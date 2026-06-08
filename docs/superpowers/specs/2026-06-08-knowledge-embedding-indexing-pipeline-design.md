# 知识库 Embedding 入库生产级流水线设计

日期：2026-06-08

本文是 `docs/embedding-retrieval-lifecycle-design.md` 之下的知识库导入与 embedding 入库实现规格。全局边界仍以生命周期设计文档为准；本文只约束知识库文件夹导入后，如何尽快、可见、可恢复地完成 retrieval document、chunk、embedding job 和 vector 入库。

## 背景

当前 TooGraph 已经具备知识库文件夹导入、`knowledge_folder_retrieval_ingestion` 图模板、`embedding_jobs` 队列、`embedding_maintenance` 官方调度任务和知识库页面统计。但现状存在几个生产级体验问题：

- 知识库导入后只看到文档数、chunk 数、pending job 数和 vector 数，缺少一次导入的完整进度。
- `embedding_maintenance` 每 20 分钟消费一批 job，适合记忆和兜底维护，不适合作为主动导入知识库后的主处理路径。
- 模型服务离线时会批量把 job 标记为 failed，而不是暂停队列并等待恢复。
- 维度不匹配这类配置错误和服务离线这类临时错误没有区分。
- 运行记录可能显示图运行 completed，但业务层 embedding 处理失败，用户容易误判。

## 目标

知识库导入应表现为一条 collection 级、operation 级、可追踪的入库流水线：

```text
选择文件夹
-> 复制到 managed knowledge source
-> 创建 indexing operation
-> 运行 Knowledge Folder Ingestion 图
-> normalize / chunk / write retrieval records
-> 创建 scoped embedding jobs
-> 立即触发 scoped embedding drain
-> 持续处理直到完成、暂停重试、或阻塞等待配置修复
-> 知识库页面显示状态、进度、错误和恢复入口
```

成功标准：

- 用户导入一个文件夹后，可以在知识库侧边栏和详情区看到入库与 embedding 进度。
- 新知识库不依赖 20 分钟一次的全局维护任务才能变得可检索。
- 模型服务临时不可用时，系统暂停后续处理并周期性探测恢复。
- 配置错误会进入明确的阻塞态，并提示用户修复，而不是无限重试。
- 每次入库、暂停、恢复、失败和完成都有可审计记录。

## 非目标

- 不新增专门的知识库问答页面。知识库问答仍通过图模板和未来 Buddy 自动能力选择调用。
- 不把知识库导入逻辑做成隐藏的产品特化后端流程。副作用仍应由图模板、Tool、调度任务和可审计运行记录表达。
- 不把记忆 embedding 和知识库 embedding 混成一个业务对象。两者可共用底层 retrieval primitives，但触发策略、优先级和 UI 表达不同。

## 核心设计

### 1. 区分两类 embedding 处理

知识库导入后的 embedding 处理应走即时流水线：

- 由知识库导入图完成后立刻触发。
- 按 `collection_id` 和本次 `operation_id` 只处理相关 job。
- 可以连续分批处理，直到完成或进入暂停/阻塞态。
- 优先级高于后台记忆和零散维护任务。

全局 `embedding_maintenance` 保留为兜底维护：

- 每 20 分钟运行一次。
- 处理记忆、零散 pending jobs、stale running jobs。
- 探测 paused/retry_wait 队列是否可以恢复。
- 修复遗漏状态，但不作为新知识库导入的主完成路径。

### 2. 引入 indexing operation

每次导入或重新入库一个知识库，都应创建一个 `knowledge_indexing_operation` 记录。它不是新业务孤岛，而是知识库 manifest、retrieval records、embedding jobs 和 run records 的聚合视图。

建议字段：

- `operation_id`
- `collection_id`
- `source_root`
- `template_id`
- `ingestion_run_id`
- `embedding_run_ids`
- `status`
- `stage`
- `document_count`
- `chunk_count`
- `embedding_job_count`
- `completed_embedding_job_count`
- `pending_embedding_job_count`
- `running_embedding_job_count`
- `retry_wait_embedding_job_count`
- `failed_embedding_job_count`
- `embedding_vector_count`
- `last_error_type`
- `last_error`
- `next_retry_at`
- `created_at`
- `updated_at`
- `completed_at`

operation 状态用于 UI 和恢复逻辑，不替代底层 `embedding_jobs`。底层 job 仍保存 chunk、model、hash 和具体执行状态。

### 3. 扩展 embedding job 状态机

当前 `pending / running / completed / failed` 不够表达生产级恢复。建议扩展为：

- `pending`：等待处理。
- `running`：已被 worker 租约占用。
- `retry_wait`：临时错误，等待下一次探测或重试。
- `completed`：向量已写入。
- `failed`：单个 job 终态失败，通常是内容或不可恢复异常。
- `blocked`：配置级错误，继续处理没有意义，需要用户修复。

同时增加或通过 metadata 存储：

- `attempt_count`
- `last_error_type`
- `last_error`
- `next_retry_at`
- `lease_expires_at`
- `operation_id`
- `priority`

`running` 必须有租约过期时间。过期后由维护任务恢复为 `pending` 或 `retry_wait`，避免长时间卡死。

### 4. 错误分类

Embedding processor 不应把所有异常都等价处理。

临时错误进入 `retry_wait`：

- 模型服务未启动。
- HTTP 连接失败。
- 请求超时。
- 429 / 503 等临时服务错误。

配置错误进入 `blocked`：

- embedding 模型未配置。
- provider 不存在或被禁用。
- 模型维度不匹配。
- 模型不支持 embedding。

内容级错误可以进入 `failed`：

- 单个 chunk 内容无法处理。
- 向量格式非法。
- 超过模型硬限制且无法裁剪。

一旦 operation 出现配置错误，应暂停同 collection/operation 的后续 embedding drain，并在知识库页面提示用户处理。修复配置后，用户可以点击“重新尝试”，系统把相关 `blocked` job 恢复为 `pending`。

### 5. Scoped embedding drain

新增或升级 `embedding_job_processor` 的能力，使它支持 scoped drain：

- `collection_id`
- `operation_id`
- `source_kind`
- `source_id`
- `model_ref`
- `limit`
- `time_budget_seconds`
- `retry_mode`
- `priority`

知识库导入后触发的 drain 应默认按 operation scope 处理，避免抢占其他队列。一次 drain 可以有时间片，例如 5 到 10 分钟；如果还有 pending jobs，则立刻安排下一轮，而不是等全局 20 分钟维护。

### 6. UI 进度表达

知识库侧边栏状态应从简单“pending/已索引”升级为进度状态：

- 导入中
- 切片中
- 生成向量中 `completed / total`
- 暂停重试中，并显示下一次重试时间
- 需要处理，并显示错误摘要
- 部分可用
- 可检索

详情区应展示：

- 当前 operation。
- 文档数、chunk 数、job 数、vector 数。
- completed / pending / running / retry_wait / failed / blocked 分布。
- 当前 embedding 模型。
- 最后一次 ingestion run。
- 最后一次 embedding run。
- 最后错误。
- 操作按钮：立即重试、暂停、继续、打开模型设置、查看运行记录。

侧边栏弹出提示应来自 operation 状态变化，而不是只来自前端请求失败。

## 数据流

### 导入

1. 用户在知识库页面选择文件夹。
2. 后端复制文件夹到 `knowledge/<collection_id>/source`。
3. 创建或更新 knowledge manifest。
4. 创建 `knowledge_indexing_operation`，状态为 `ingesting`。
5. 前端运行选定的知识库入库图。
6. 图完成后记录 `ingestion_run_id`，刷新 operation 统计。

### 入库图

1. `knowledge_folder_normalizer` 读取 folder package。
2. `source_chunker` 创建知识库 chunk。
3. `retrieval_ingestion_writer` 写入 retrieval document/chunk，并为启用的 embedding model 创建 scoped jobs。
4. writer 输出必须写入可审计 report，不能出现副作用成功但 state 输出为 null 的情况。

### 向量生成

1. 入库图完成后触发 scoped embedding drain。
2. drain 先做模型健康检查和维度校验。
3. 如果健康，按 operation scope 分批处理。
4. 如果还有剩余 job，继续排下一轮 drain。
5. 如果临时错误，operation 进入 `paused_retrying`。
6. 如果配置错误，operation 进入 `blocked_requires_configuration`。
7. 全部完成后 operation 进入 `ready`。

## 与调度系统的关系

调度页面仍是统一配置入口，但知识库导入后的即时 drain 可以由事件触发的官方任务表达：

- 事件：`knowledge.ingestion.completed`
- 官方任务：`official_knowledge_embedding_drain`
- 图模板：可以复用或派生自 embedding drain 模板
- 输入：`collection_id`、`operation_id`

`embedding_maintenance` 继续是 interval job：

- 默认启用。
- 每 20 分钟运行。
- 用于兜底和恢复，不承担新知识库导入的主处理责任。

## 当前代码需要调整的区域

- `backend/app/core/storage/embedding_store.py`
  - 支持 scoped 查询、retry_wait、blocked、stale running reset、错误分类和模型健康检查。
- `tool/official/embedding_job_processor`
  - 增加 collection/operation scope、time budget、错误分类输出。
- `backend/app/core/storage/knowledge_store.py`
  - 返回 operation 级统计、失败统计、最后错误、下一次重试时间。
- `backend/app/api/routes_knowledge.py`
  - 增加 operation 查询、重试、暂停、继续接口。
- `frontend/src/pages/KnowledgePage.vue`
  - 增加侧边栏状态、详情进度、错误提示和恢复操作。
- `graph_template/official/knowledge_folder_retrieval_ingestion/template.json`
  - 确保 writer 输出 report 正确进入 state。
- `graph_template/official/embedding_maintenance/template.json`
  - 调整语义为兜底维护。
- 官方调度 seed
  - 新增或升级知识库 embedding drain 事件任务。

## 测试策略

后端测试：

- 知识库导入创建 operation。
- 入库图写入 documents/chunks/jobs 后 operation 统计正确。
- scoped drain 只处理指定 collection/operation 的 jobs。
- 模型服务离线时进入 `retry_wait`，不批量 failed。
- 维度不匹配时进入 `blocked`。
- stale running jobs 能被维护任务恢复。
- writer 副作用成功时 report 不为 null。

前端测试：

- 知识库 API 类型包含 operation/status 字段。
- 侧边栏根据状态显示导入中、生成向量中、暂停重试、需要处理、可检索。
- 详情区展示 job 分布和最后错误。
- 立即重试、暂停、继续、打开模型设置、查看运行记录按钮存在并调用正确 API。

集成验证：

- 导入一个小文件夹，完整完成到 vector 入库。
- 关闭本地 embedding 服务后导入，页面显示暂停重试。
- 启动服务后自动恢复。
- 配错维度后进入需要处理，修复后可重试完成。

## 设计自检

- 本设计没有引入隐藏的产品特化入库路径，知识库入库仍由图模板和 Tool 表达。
- 本设计没有删除全局 `embedding_maintenance`，而是重新限定它为兜底维护。
- 本设计区分了临时故障、配置故障和内容故障。
- 本设计让知识库导入成为可追踪 operation，解决了只看零散计数无法理解进度的问题。
- 本设计没有新增知识库问答页面，问答仍由图模板提供。

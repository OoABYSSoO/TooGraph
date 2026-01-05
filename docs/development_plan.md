# GraphiteUI Development Plan

## 1. 文档目的

本文档基于当前仓库中的产品文档与验收标准，整理出一份可直接执行的开发计划。

目标：

- 将产品规划转化为工程任务
- 明确阶段顺序、依赖关系和完成标准
- 帮助按最小闭环优先方式推进实现
- 确保开发过程始终对齐当前交付边界

本文档只覆盖当前第一阶段交付，不扩展未来版本。

---

## 2. 当前项目判断

结合现有仓库内容，当前状态可以概括为：

- 产品定义、页面范围、架构分层、任务拆分、验收标准已经完成
- 仓库中已有 `demo/` 原型脚本，可作为 runtime 设计参考
- 正式的 `frontend/`、`backend/` 工程结构尚未落地
- 当前最需要做的不是补充更多需求，而是把文档中定义的闭环真正实现出来

因此，开发策略应采用：

1. 先建立正式工程骨架
2. 再固化数据协议和后端接口
3. 再完成 runtime 主流程
4. 再实现前端编辑器和观察页
5. 最后做联调、验收和演示整理

---

## 3. 开发原则

### 3.1 先闭环，后增强

当前阶段只追求以下闭环：

- graph 可创建、保存、加载、校验
- graph 可运行
- 运行时可观察当前节点和节点状态
- 节点执行摘要可回看
- runs、knowledge、memories 页面可查看真实内容

任何不服务于上述闭环的能力一律后置。

### 3.2 先协议，后页面

前端页面的稳定性依赖后端协议稳定，因此必须优先定义：

- graph schema
- run schema
- node execution schema
- API request / response 结构

### 3.3 先最小路径，后完整路径

优先打通最小运行链路：

`input -> planner -> evaluator -> finalizer`

在最小链路稳定后，再补齐 knowledge、memory、skills 和 revise 路由。

### 3.4 验收驱动开发

每个阶段都必须映射到已有验收标准，避免做完以后无法判定是否完成。

---

## 4. 总体里程碑

建议拆分为 6 个里程碑：

### M1 工程骨架完成

- 前后端项目初始化完成
- 本地开发环境可启动
- 数据目录齐全

### M2 Graph 基础能力完成

- graph schema 稳定
- save / load / validate 可用

### M3 Runtime 主流程完成

- 最小 workflow 可执行
- revise 路由可用
- run / node execution / artifacts 可记录

### M4 Editor 基础交互完成

- 节点拖拽、移动、连线、删除可用
- 节点配置可编辑
- Save / Validate / Run 按钮已打通

### M5 页面闭环完成

- Workspace、Runs、Run Detail、Knowledge、Memories、Settings 全部可访问
- 历史运行与资产沉淀可查看

### M6 验收与演示完成

- 正常路径走通
- revise 路径走通
- 无一票否决项

---

## 5. 分阶段开发计划

## 阶段 0：范围冻结与实施准备

### 目标

在开始编码前冻结当前交付边界，统一实施口径。

### 任务

#### Task 0.1 固定当前版本范围

- 明确只支持固定页面、固定节点类型、固定边类型
- 明确不做自然语言生成 graph、子图、多人协作、在线调试器

### 产出

- 当前阶段范围清单
- 开发顺序共识

### 完成标准

- 所有后续开发都以现有 spec 和 acceptance criteria 为唯一范围依据

### 依赖

- 无

### 验证方式

- 对照 `readme.md` 与 `docs/` 中文档，无新增范围漂移

---

## 阶段 1：工程骨架初始化

### 目标

创建正式前后端工程，形成可运行的基础开发环境。

### 任务

#### Task 1.1 初始化目录结构

创建：

- `frontend/`
- `backend/`
- `backend/app/`
- `backend/data/graphs/`
- `backend/data/kb/`
- `backend/data/memories/`
- `backend/data/runs/`

#### Task 1.2 初始化前端项目

技术栈：

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

要求：

- 首页可访问
- 基础 layout 可用
- 页面路由能逐步扩展

#### Task 1.3 初始化后端项目

技术栈：

- FastAPI
- Pydantic

要求：

- `app.main` 可启动
- `/health` 返回成功
- 基础 API 路由注册机制就位

#### Task 1.4 配置统一启动方式

建议增加：

- `Makefile` 或 `justfile`
- 前后端本地启动说明
- 后端依赖安装说明

### 产出

- 正式工程骨架
- 可启动的前后端开发环境

### 依赖

- 阶段 0 完成

### 完成标准

- 前端可打开首页
- 后端 `/health` 正常
- 数据目录存在

### 验证方式

- 对应 `AC-ENV-1`
- 对应 `AC-ENV-2`
- 对应 `AC-ENV-3`

---

## 阶段 2：Graph 协议与基础 API

### 目标

先稳定 graph 数据结构和基础接口，建立前后端共同语言。

### 任务

#### Task 2.1 定义 graph schema

定义：

- Graph schema
- Node schema
- Edge schema

必须覆盖字段：

- `graph_id`
- `name`
- `nodes`
- `edges`
- `metadata`

节点必须覆盖：

- `id`
- `type`
- `label`
- `position`
- `config`

边必须覆盖：

- `id`
- `type`
- `source`
- `target`
- `condition_label`

#### Task 2.2 固定支持的节点类型与边类型

节点类型：

- `input`
- `knowledge`
- `memory`
- `planner`
- `skill_executor`
- `evaluator`
- `finalizer`

边类型：

- `normal`
- `conditional`

条件边取值：

- `pass`
- `revise`
- `fail`

#### Task 2.3 实现 graph 保存接口

接口：

- `POST /api/graphs/save`

要求：

- 保存 graph json
- 返回 `graph_id`

#### Task 2.4 实现 graph 读取接口

接口：

- `GET /api/graphs/{graph_id}`

要求：

- 返回完整 graph json

#### Task 2.5 实现 graph 校验接口

接口：

- `POST /api/graphs/validate`

校验内容建议分三层：

- schema 合法性校验
- 图结构合法性校验
- 业务规则合法性校验

至少检查：

- 必要节点是否存在
- source / target 是否引用存在节点
- evaluator 后条件边是否合法
- revise / pass / fail 路由是否合法

### 产出

- 稳定的 graph 协议
- 可用的 graph save / load / validate API

### 依赖

- 阶段 1 完成

### 完成标准

- 合法 graph 可保存、读取、校验成功
- 非法 graph 返回明确 issues

### 验证方式

- 对应 `AC-GRAPH-1`
- 对应 `AC-GRAPH-2`
- 对应 `AC-GRAPH-3`

---

## 阶段 3：Compiler 与 Runtime 最小主流程

### 目标

让 graph 从“可存储的数据”变成“可执行的 workflow”。

### 任务

#### Task 3.1 定义 RunState

建议字段：

- `run_id`
- `graph_id`
- `graph_name`
- `status`
- `current_node_id`
- `revision_round`
- `max_revision_round`
- `task_input`
- `retrieved_knowledge`
- `matched_memories`
- `plan`
- `selected_skills`
- `skill_outputs`
- `draft_result`
- `evaluation_result`
- `final_result`
- `node_status_map`
- `warnings`
- `errors`
- `started_at`
- `completed_at`

#### Task 3.2 实现 `validator`

作用：

- 对 graph 做结构和业务规则校验
- 为运行前校验提供统一入口

#### Task 3.3 实现 `graph_parser`

作用：

- 解析 nodes / edges
- 构建拓扑关系
- 产出 workflow config

#### Task 3.4 实现 `workflow_builder`

作用：

- 将 workflow config 映射为 LangGraph workflow

开发顺序：

1. 先支持最小链路
2. 再支持完整链路
3. 最后支持 evaluator 条件分支

#### Task 3.5 打通最小路径

最小运行路径：

- `input -> planner -> evaluator -> finalizer`

要求：

- 可执行到终态
- 可返回最终 state

#### Task 3.6 实现 graph 运行接口

接口：

- `POST /api/graphs/run`

要求：

- 输入 graph 或 graph_id
- 返回 `run_id`
- 能启动 runtime

### 产出

- compiler 三件套
- 最小可执行 workflow
- graph run API

### 依赖

- 阶段 2 完成

### 完成标准

- graph 可以从 json 被编译为 workflow
- workflow 能执行到 `completed` 或 `failed`
- run 可被查询

### 验证方式

- 对应 `AC-GRAPH-4`
- 对应 `AC-RUNTIME-1`

---

## 阶段 4：Runtime 节点能力与 revise 路由

### 目标

补齐当前阶段要求的固定运行节点和 revise 逻辑。

### 任务

#### Task 4.1 实现固定节点逻辑

必须实现：

- `ingest_task`
- `retrieve_knowledge`
- `load_memory`
- `plan_task`
- `execute_skills`
- `evaluate_result`
- `finalize`

要求：

- 每个节点接收 `RunState`
- 每个节点返回 state 增量或更新后的 state
- 每个节点可生成执行摘要

#### Task 4.2 实现 evaluator 路由规则

合法路径：

- `pass -> finalizer`
- `revise -> planner`
- `fail -> finalizer`

#### Task 4.3 实现 revise round 控制

规则：

- 当 `evaluation_result.pass = false`
- 且 `revision_round < max_revision_round`
- 则 `revision_round + 1`
- 回到 planner

#### Task 4.4 实现 current node 与 node status 更新

必须维护：

- `current_node_id`
- `run_status`
- `node_status_map`

节点状态至少支持：

- `idle`
- `running`
- `success`
- `failed`

### 产出

- 完整 runtime 主流程
- revise 路由
- 节点状态跟踪

### 依赖

- 阶段 3 完成

### 完成标准

- evaluator 可驱动 pass / revise / fail
- revise 路径能回到 planner
- 运行中能观察当前节点

### 验证方式

- 对应 `AC-RUNTIME-2`
- 对应 `AC-RUNTIME-3`

---

## 阶段 5：Persistence 落地

### 目标

把 graph、run、node execution 和 artifacts 真正沉淀下来，支撑历史回看。

### 任务

#### Task 5.1 初始化 SQLite

要求：

- 数据库文件可自动生成
- 启动时自动初始化

#### Task 5.2 创建核心数据表

必须表：

- `graphs`
- `runs`
- `node_executions`
- `artifacts`
- `memories`

#### Task 5.3 实现 graph 存储层

要求：

- graph 可保存
- graph 可读取
- graph 更新后可覆盖或版本化

#### Task 5.4 实现 run 存储层

要求：

- run 创建
- run 状态更新
- run 查询

#### Task 5.5 实现 node execution 存储层

每条记录至少保存：

- `node_id`
- `node_type`
- `status`
- `started_at`
- `finished_at`
- `duration_ms`
- `input_summary`
- `output_summary`
- `warnings`
- `errors`

#### Task 5.6 实现 artifact 存储层

至少保存：

- `knowledge summary`
- `memory summary`
- `plan`
- `skill outputs`
- `evaluation`
- `final result`

### 产出

- 可查询的持久化数据
- 历史运行回看基础

### 依赖

- 阶段 4 完成

### 完成标准

- 一次运行后可在数据库中看到 graph、run、node execution、artifacts

### 验证方式

- 对应 `AC-RUNTIME-4`
- 对应 `AC-RUNTIME-5`

---

## 阶段 6：Knowledge / Memory / Skills

### 目标

补齐 runtime 所需的知识、记忆和技能调用能力，避免运行链路沦为空壳。

### 任务

#### Task 6.1 实现知识库加载器

要求：

- 读取 `backend/data/kb/`
- 输出标题、来源、摘要、内容

#### Task 6.2 实现知识检索

要求：

- 输入 query
- 返回匹配片段
- 优先保证可用性，不强求复杂检索算法

#### Task 6.3 实现记忆加载

要求：

- 能读取 success pattern
- 能读取 failure reason

#### Task 6.4 实现记忆写入

要求：

- 成功 run 写 success memory
- 失败或 revise run 写 failure / revision memory

#### Task 6.5 实现 skill registry

要求：

- 支持注册
- 支持获取
- 支持调用

#### Task 6.6 实现最小技能集

至少包含：

- `search_docs`
- `analyze_assets`
- `generate_draft`
- `evaluate_output`

建议做法：

- 先用结构化 mock 或轻量封装打通
- 保证输入输出 schema 稳定
- 后续再增强能力质量

### 产出

- knowledge / memory / skills 后端基础能力

### 依赖

- 阶段 5 完成

### 完成标准

- runtime 可调用知识、记忆、技能模块并生成真实产物

### 验证方式

- 调用接口测试
- 节点单测
- 运行后 artifacts 检查

---

## 阶段 7：前端页面骨架与全局布局

### 目标

先把所有页面框架搭起来，建立信息架构，再逐步接入真实数据。

### 任务

#### Task 7.1 实现全局 layout

包含：

- 侧边导航
- 顶部区域或页面标题区
- 通用空状态和错误状态

#### Task 7.2 实现首页 `/`

必须展示：

- GraphiteUI 名称
- 产品一句话介绍
- 核心能力卡片
- 进入 Workspace 按钮

#### Task 7.3 实现 Workspace `/workspace`

必须展示：

- Recent Graphs
- Recent Runs
- Running Jobs
- Failed Runs
- Quick Actions

#### Task 7.4 实现其他页面壳子

包括：

- `/editor/[graphId]`
- `/runs`
- `/runs/[runId]`
- `/knowledge`
- `/memories`
- `/settings`

### 产出

- 完整页面信息架构
- 可访问的前端骨架

### 依赖

- 阶段 1 完成

### 完成标准

- 所有页面都可访问
- 页面职责与架构文档一致

### 验证方式

- 对应 `AC-FE-1`
- 对应 `AC-FE-2`
- 对应 `AC-FE-3` 的页面壳子部分

---

## 阶段 8：Editor 核心交互

### 目标

实现 GraphiteUI 最核心的可视化编排体验。

### 任务

#### Task 8.1 接入 React Flow

要求：

- 画布支持缩放和平移
- 支持自定义节点

#### Task 8.2 实现 Editor 四区布局

包含：

- `NodePalette`
- `GraphCanvas`
- `NodeConfigPanel`
- `GraphToolbar`

可选附加：

- `RunStatusBar`
- `NodeExecutionDrawer`

#### Task 8.3 实现拖拽建图能力

支持：

- 节点拖拽到画布
- 节点移动
- 连线
- 删除节点
- 删除边

#### Task 8.4 实现节点配置面板

要求：

- 选中节点后可编辑字段
- 配置变化可更新 graph state
- 表单校验清晰

建议使用：

- Zustand 管理 editor UI 状态
- React Hook Form + Zod 管理表单

#### Task 8.5 实现本地 graph 状态模型

要求：

- 维护 nodes / edges
- 维护 selected node / edge
- 支持 graph 导入与序列化

### 产出

- 可用的 Editor 编排能力

### 依赖

- 阶段 7 完成

### 完成标准

- 用户能在浏览器中完成建图、连线、修改配置

### 验证方式

- 对应 `AC-FE-4`
- 对应 `AC-FE-5`

---

## 阶段 9：前后端联调

### 目标

让 Editor 从“本地交互”变成“真实可保存、可运行、可观察”的工作台。

### 任务

#### Task 9.1 打通 graph 保存

- `Save` 按钮调用 `POST /api/graphs/save`

#### Task 9.2 打通 graph 加载

- 页面进入时调用 `GET /api/graphs/{graph_id}`

#### Task 9.3 打通 graph 校验

- `Validate` 按钮调用 `POST /api/graphs/validate`
- 前端展示 issues

#### Task 9.4 打通 graph 运行

- `Run` 按钮调用 `POST /api/graphs/run`
- 成功后拿到 `run_id`

#### Task 9.5 打通运行状态回读

至少支持：

- 查询 `GET /api/runs/{run_id}`
- 更新当前节点
- 更新 node status map
- 显示 run status

可先使用轮询实现，后续再考虑推送机制。

#### Task 9.6 打通节点执行摘要查看

要求：

- 点击节点后可查看
- `input summary`
- `output summary`
- `duration`
- `warnings / errors`

### 产出

- 真实联通的 Editor
- 可观察的运行状态

### 依赖

- 阶段 2 到阶段 8 完成

### 完成标准

- Save / Validate / Run 全可用
- 运行中节点状态可更新
- 节点执行摘要可查看

### 验证方式

- 对应 `AC-FE-6`
- 对应 `AC-FE-7`
- 对应 `AC-FE-8`

---

## 阶段 10：Runs / Knowledge / Memories / Settings 页面

### 目标

补齐除 Editor 之外的所有关键产品页面，完成“回看”和“资产查看”闭环。

### 任务

#### Task 10.1 实现 Runs 列表页

必须展示：

- `run_id`
- `graph name`
- `status`
- `revision_count`
- `created_at`
- `duration`
- `final_score`

必须支持：

- 搜索 graph name
- 按 status 筛选

#### Task 10.2 实现 Run Detail 页

必须展示：

- run 基本信息
- 当前节点或最终状态
- 节点时间线
- 节点执行摘要
- warnings / errors
- artifacts 摘要

#### Task 10.3 实现 Knowledge 页

必须支持：

- 列表展示
- 搜索
- 详情查看

#### Task 10.4 实现 Memories 页

必须支持：

- 列表展示
- 按 memory_type 过滤
- 详情查看

#### Task 10.5 实现 Settings 页

当前阶段只读展示：

- 模型配置
- revision 配置
- evaluator 配置

### 产出

- 历史运行和资产查看页面

### 依赖

- 阶段 5、阶段 6、阶段 7 完成

### 完成标准

- 页面能展示真实数据
- 不是空壳页

### 验证方式

- 对应 `AC-FE-9`
- 对应 `AC-FE-10`
- 对应 `AC-FE-11`
- 对应 `AC-FE-12`

---

## 阶段 11：全链路验收与演示整理

### 目标

按照验收标准验证整个项目是否真正完成。

### 任务

#### Task 11.1 准备正常路径示例 graph

建议包含：

- input
- knowledge
- memory
- planner
- skill_executor
- evaluator
- finalizer

#### Task 11.2 准备 revise 路径示例 graph

要求：

- evaluator 至少一次返回 revise
- revision_round 明确增加

#### Task 11.3 执行完整 E2E 验收

按文档顺序逐项验证：

1. Workspace 进入 Editor
2. 新建 graph
3. 拖拽和连线
4. 配置节点
5. Validate
6. Save
7. Run
8. 查看节点状态
9. 查看 run detail

#### Task 11.4 检查历史沉淀

要求：

- 至少有两次 run 记录
- runs 页面可进入 detail
- knowledge 页面有真实内容
- memories 页面有真实内容

#### Task 11.5 整理演示素材

建议准备：

- 一条正常路径演示
- 一条 revise 路径演示
- 一份示例 graph
- 一份演示脚本

### 产出

- 验收记录
- 演示素材

### 依赖

- 阶段 1 到阶段 10 完成

### 完成标准

- 通过全部 E2E 验收
- 未触发一票否决项

### 验证方式

- 对应 `AC-E2E-1`
- 对应 `AC-E2E-2`
- 对应 `AC-E2E-3`
- 对应 `AC-E2E-4`

---

## 6. 关键依赖关系

必须遵守以下顺序：

1. 先做阶段 1，再做阶段 2
2. 阶段 2 完成后才能稳定推进阶段 3 和阶段 9
3. 阶段 3 和阶段 4 完成后，阶段 5 才有意义
4. 阶段 5 和阶段 6 完成后，Runs / Knowledge / Memories 页面才有真实数据可展示
5. 阶段 8 不应早于阶段 2 太多，否则前后端协议会反复修改

简单理解：

- 后端协议先定
- runtime 先闭环
- 前端再联调

---

## 7. 推荐实施顺序

如果按最稳妥方式推进，建议顺序如下：

### 第一批

- 阶段 1：工程骨架初始化
- 阶段 2：Graph 协议与基础 API

### 第二批

- 阶段 3：Compiler 与 Runtime 最小主流程
- 阶段 4：Runtime 节点能力与 revise 路由

### 第三批

- 阶段 5：Persistence 落地
- 阶段 6：Knowledge / Memory / Skills

### 第四批

- 阶段 7：前端页面骨架与全局布局
- 阶段 8：Editor 核心交互

### 第五批

- 阶段 9：前后端联调
- 阶段 10：Runs / Knowledge / Memories / Settings 页面

### 第六批

- 阶段 11：全链路验收与演示整理

---

## 8. 优先级建议

### P0 必须先做

- 阶段 1
- 阶段 2
- 阶段 3
- 阶段 4

原因：

- 没有这些，项目仍停留在“概念”和“画布”阶段

### P1 闭环必需

- 阶段 5
- 阶段 7
- 阶段 8
- 阶段 9

原因：

- 这些直接决定是否能通过核心验收

### P2 交付完善

- 阶段 6
- 阶段 10
- 阶段 11

原因：

- 这些决定是否能形成完整产品体验和可演示结果

---

## 9. 风险与控制建议

### 风险 1：先做前端画布，后端迟迟未定

后果：

- 前端状态结构频繁返工
- 节点配置字段反复修改

控制方式：

- 先固化 graph schema 和 run schema

### 风险 2：runtime 设计过重，迟迟打不通最小路径

后果：

- 项目长期没有可运行结果

控制方式：

- 先只打通最小链路，再逐步增加知识、记忆、技能

### 风险 3：知识和记忆页面变成空壳

后果：

- 直接触发一票否决项

控制方式：

- 阶段 6 必须尽早准备真实样例数据

### 风险 4：运行记录只保存总状态，不保存节点摘要

后果：

- 无法满足 run detail 和节点摘要查看要求

控制方式：

- `node_executions` 设计时一次性把摘要字段补齐

### 风险 5：验收时才发现 revise 路径没跑通

后果：

- 返工成本高

控制方式：

- 在阶段 4 就准备 revise 测试样例

---

## 10. 建议的第一轮实施清单

如果从当前仓库立刻开始动工，建议第一轮只做以下内容：

1. 创建 `frontend/` 和 `backend/` 正式目录
2. 初始化 Next.js 前端
3. 初始化 FastAPI 后端
4. 创建 `/health`
5. 创建 `backend/data/` 目录
6. 定义 graph / node / edge schema
7. 实现 `save` / `load` / `validate` 三个接口
8. 写两个合法 graph 样例和两个非法 graph 样例

做到这一步后，再进入 runtime 开发。

---

## 11. 完成判定

只有满足以下条件，当前阶段才算真正完成：

1. 前后端都可启动
2. graph 可保存、加载、校验、运行
3. runtime 可返回当前节点和节点状态
4. 节点执行摘要可查看
5. runs 页面可回看历史
6. knowledge 页面有真实内容
7. memories 页面有真实内容
8. revise 路径可走通
9. 未触发任何一票否决项

---

## 12. 结论

GraphiteUI 当前最正确的推进方式，不是先把 UI 做漂亮，也不是先追求复杂 agent 能力，而是优先完成：

- 工程骨架
- graph 协议
- runtime 最小闭环
- editor 联调
- 运行观察与历史回看

只要按本文档的顺序推进，项目就能以最小返工成本进入一个“能演示、能解释、能继续扩展”的稳定状态。

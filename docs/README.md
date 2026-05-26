# TooGraph 长期代码事实与路线图

最后整理日期：2026-05-27。

本文是 `docs/` 下的长期参考总入口。它的维护原则是：先看代码、官方模板 JSON、Action manifest 和测试，再写结论；已经完成的事情写成事实，未完成的事情写成路线图，历史计划只保留仍然有效的细节。独立专题路线图可以作为长期参考文档保留，但必须从本文或相关代码路径可发现。

## 1. 事实来源

当前实现事实以这些路径为准：

- 图协议和校验：`backend/app/core/schemas/`、`backend/app/core/compiler/`。
- 图运行时：`backend/app/core/langgraph/`、`backend/app/core/runtime/`。
- 运行记录和运行树：`backend/app/core/storage/run_store.py`、`backend/app/core/runtime/run_tree.py`、`backend/app/api/routes_runs.py`。
- 图运行存储、运行树、Buddy 聊天历史和记忆召回设计：本文 `2.3`、`2.4`、`2.5`、`2.9`。
- Hermes Agent 能力追赶路线图：`docs/hermes-agent-capability-parity-roadmap.md`。
- Hermes Agent 能力差距逐项解决方案：`docs/hermes-agent-capability-gap-resolution-plan.md`。
- 官方 Action：`action/official/*/action.json`、`action/official/*/ACTION.md`、生命周期脚本。
- 官方图模板：`graph_template/official/*/template.json`。
- Buddy Home 和记忆：`backend/app/buddy/`、`action/official/buddy_session_recall/`、`action/official/buddy_home_writer/`。
- 知识库和 RAG 基础：`backend/app/knowledge/loader.py`、`backend/app/core/runtime/knowledge_retrieval.py`。
- 前端页面和展示模型：`frontend/src/`。
- 自动化测试：`backend/tests/`、`frontend/src/**/*.test.ts`、`scripts/*.test.mjs`。

维护规则：

- 不再新增 `docs/current_project_status.md`、阶段性流水账或互相冲突的平行路线图。
- 一次性计划完成、过期或与代码冲突后，必须删除，仍有效的细节折叠进本文。
- `docs/` 下不保存图片、测试 fixture 或资源文件；资源应放在真正使用它们的代码目录。
- 如果本文和代码冲突，先修本文；如果本文想表达新协议，必须先落实到代码、manifest、模板或测试。

## 2. 当前代码事实

### 2.1 启动与部署

已完成：

- TooGraph 使用单端口启动模型，标准命令是 `npm start`，底层执行 `node scripts/start.mjs`。
- 默认公开地址是 `http://127.0.0.1:3477`，健康检查是 `http://127.0.0.1:3477/health`。
- `npm start` 会在构建 manifest 匹配时复用 `frontend/dist`，需要强制重建时使用 `TOOGRAPH_FORCE_FRONTEND_BUILD=1 npm start`。
- Docker 镜像以 `TOOGRAPH_HOST=0.0.0.0`、`PORT=3477` 暴露单端口，持久数据挂载到 `/app/backend/data`。
- 模型入口通过 UI 的 Model Providers 页面配置，不通过启动环境变量配置。

保留操作说明：

```bash
git clone https://github.com/OoABYSSoO/TooGraph.git
cd TooGraph
npm --prefix frontend install
python -m pip install -r backend/requirements.txt
npm start
```

Docker：

```bash
docker build -t toograph:local .
docker run --rm -p 3477:3477 -v toograph-data:/app/backend/data --name toograph toograph:local
```

更新源码安装：

```bash
git pull
npm --prefix frontend install
python -m pip install -r backend/requirements.txt
npm start
```

未完成或待确认：

- 端口释放策略仍要确认边界：已知 TooGraph 进程可以释放；未知进程占用 `3477` 时应报告 PID/command 并停止，不能自动换端口或误杀。
- 桌面端、一键安装包和非开发环境安装体验仍是未来可用性方向。

### 2.2 图协议、Action、Tool、Subgraph

已完成：

- `node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的数据来源。
- 当前代码是 Action-based，不是旧 Skill-based：
  - 官方包位于 `action/official/<action_key>/`。
  - 用户包位于 `action/user/<action_key>/`。
  - 本地启用状态位于被忽略的 `action/settings.json`。
  - LLM 节点手动绑定使用 `config.actionKey`。
  - 输出映射使用 `actionBindings.outputMapping`。
  - 节点级说明覆盖使用 `actionInstructionBlocks.<actionKey>`。
- `backend/app/core/schemas/node_system.py` 会拒绝旧字段 `skillKey`、`config.skills`、`skillBindings`、`skillInstructionBlocks`。
- Action 是一次受控能力调用。它可以读取上下文、执行确定性前后处理、联网、写文件或返回 artifact，但不拥有多轮自治、最终回复生成、重试循环、长期记忆策略或后续能力选择。
- Tool 是确定性无 LLM 能力的协议方向，后端已有 `/api/tools/catalog` 和 Tool schema 路径；官方 Tool 包位于 `tool/official/<tool_key>/`。
- Subgraph 是图级 Agent 或可复用模板能力。多步骤智能应由模板、Subgraph、Condition、Batch 和普通节点表达。

当前官方 Action：

| Action | 当前职责 | 状态 |
| --- | --- | --- |
| `web_search` | 联网搜索、网页正文抓取、本地 source document artifact | 保留 |
| `toograph_capability_selector` | 先判断是否还需要能力；需要时选择一个 `action` / `subgraph` / `tool`，不需要时返回 `none` | 已升级，文档需保持同步 |
| `toograph_page_operator` | 页面虚拟操作、模板运行、图编辑意图 | 保留 |
| `toograph_action_builder` | 生成 Action 包文件内容 | 保留 |
| `toograph_action_package_reader` | 读取已有 Action 包 | 保留 |
| `toograph_graph_template_reader` | 读取图模板包 | 保留 |
| `toograph_graph_template_validator` | 校验图模板 JSON | 保留，内部 helper 可收敛 |
| `toograph_graph_template_writer` | 写入用户图模板并记录 revision | 保留，内部 helper 可收敛 |
| `toograph_script_tester` | 临时测试工作区和允许命令运行 | 保留 |
| `local_workspace_executor` | 本地工作区 read/list/search/edit/write/execute | 保留，未来补 operation 级权限和 execute 长输出 |
| `buddy_session_recall` | 只读 Buddy 会话召回 | 保留 |
| `buddy_home_writer` | 通过 command/revision 写 Buddy Home | 保留，记忆写回唯一出口 |

当前官方 Tool：

| Tool | 当前职责 | 状态 |
| --- | --- | --- |
| `buddy_context_pressure_check` | 确定性判断 Buddy 主循环在首轮回复前、能力结果后、溢出恢复或后台复盘时是否需要运行会话压缩，并输出预算报告与触发原因 | 保留 |

未完成或待做：

- 官方说明、模板说明、测试 fixture 必须继续清理旧 Skill 术语，只在“未来 Agent 操作书型 Skill”语境下保留 Skill 这个词。
- 如果未来重新引入 Skill，应把它定义为 Agent 操作书型能力，不能复用当前 Action 包语义。
- Tool 节点和更多官方 Tool 包还需要真实业务落地，例如视频分段、OCR、文档切块、格式转换。

### 2.3 动态能力选择和运行树

已完成：

- 动态 `capability` state 是单个互斥对象，合法 `kind` 为 `action`、`subgraph`、`tool`、`none`。
- `toograph_capability_selector` 的能力候选已经从真实目录发现：
  - 可发现图模板 -> `kind: "subgraph"`。
  - 启用 Action -> `kind: "action"`。
  - Tool catalog -> `kind: "tool"`。
- `toograph_capability_selector` 已不再固定返回 `toograph_page_operation_workflow`，也不再输出 `found`。它会：
  - 先根据当前 LLM 节点可见的普通图 state 判断当前是否还需要调用能力；若已有可用结果或不需要能力，返回 `{"kind": "none"}` 且 `needs_capability=false`。
  - `stateInputSchema.current_requirement` 只是连接提示；绑定 Action 不会强制创建或要求 managed `action_input` 槽，用户可以按图流程需要连接任意普通 state。
  - 只有仍需要显式能力时，才对页面、UI、按钮、打开页面、编辑图等请求优先选择 `toograph_page_operation_workflow`。
  - 对新闻、最新、研究、联网、搜索、调研等请求优先给研究类模板加分。
- 官方 `buddy_autonomous_loop` 是扁平可见主循环：先由 `buddy_context_pressure_check` Tool 做上下文压力检查；需要时运行内部 `buddy_context_compaction` Subgraph；随后同一个 LLM 节点生成回复草稿并选择一个 `capability` 或 `none`；Condition 按 `needs_capability` 决定是否执行一次动态能力；动态能力只写一个 `result_package`，再回到压力检查节点，按需压缩后继续复盘。会话召回通过 `buddy_session_recall` 作为按需动态能力进入循环，不做每轮预取。
- Buddy 主运行会注入 `current_session_id`，供按需召回排除当前会话谱系，避免把正在发生的上下文当作历史材料重复召回。
- Buddy 上下文压缩参考 Hermes 触发方式，但保持图优先：可见主路径的压力判断和压缩节点已经进入官方 `buddy_autonomous_loop`，不是 Buddy 窗口外层隐藏重试。Buddy 窗口把 `conversation_history` 作为 `context_package` 进入图状态，包内记录具体消息和摘要来源，并通过嵌套 `context_assembly_ref` 按需渲染，不在每次 run 中重复保存完整历史文本；真正摘要由内部官方 `buddy_context_compaction` 模板完成，并写回统一数据库中的 `session_summary`，留下 command/revision。可见路径的触发点包括首轮 LLM 前和动态能力结果后；可见 run 完成后的后台压缩仍然作为独立后台图运行。
- 普通 Subgraph node、动态 `capability.kind=subgraph` 和 batch subgraph worker 会创建 child run。
- `/api/runs/{run_id}` 会返回直接 children，`/api/runs/{run_id}/tree` 会返回运行树。
- 动态 subgraph result package 会写入 `childRunId`、`child_run_id`、`triggered_run_id`，并把公开输出包装到 `outputs`。
- 子图暂停恢复已经能续写原 child run：
  - pending subgraph breakpoint 会保存 `child_run_id` 和 `graph_snapshot`。
  - 普通 Subgraph node 和动态 Subgraph capability resume 会优先加载原 child run。
  - resume 使用 pending breakpoint 中的 checkpoint、state values、metadata、node status 和 node executions，避免测试或中间保存产生的不完整 child run 覆盖真正暂停点。
  - 恢复完成或再次暂停后会更新同一个 child run，并把 `child_run_id` 写回父 run 的 subgraph artifact 和动态 result package。
- 前端运行树展示模型已经抽到 `frontend/src/lib/runTreeDisplayModel.ts`，RunDetail 使用同一套 run row、batch group 和 status summary 逻辑。
- RunDetail 前端已有运行树和 batch group 折叠展示。
- Buddy run trace 胶囊折叠态按可见 output boundary 分组：运行中显示当前节点，动态 subgraph 能力会显示为 `动态能力节点 / 已选择能力 / 子图节点`；完成后显示已完成节点数和耗时，空输出边界不会单独留下可见胶囊。
- Buddy 胶囊展开态只展示当前可见 output-boundary segment 的主图节点、动态能力分支和 subgraph 子节点；按消息 `runId` 拉取 `/api/runs/{run_id}/tree` 给 subgraph 行补 `child_run_id` 跳转，并按 child run detail 补动态 subgraph 子节点名称，不再用整棵 run tree 替换胶囊内容。展开状态本身还不是持久化 UI 状态。

仍未完成：

- P2：继续补运行树回归和端到端验证，重点是再次暂停、child run 文件缺失 fallback、失败恢复、Buddy 展开真实子运行后的导航和刷新再展开。
- P2：如果后端 tree API 未来要直接输出 batch group summary，应保持与 `frontend/src/lib/runTreeDisplayModel.ts` 的展示语义一致，不能让 Buddy 和 RunDetail 分叉。

### 2.4 Buddy 记忆系统

已完成：

- Buddy 记忆和历史采用统一数据库模型：
  - `backend/data/toograph.db` 保存 Buddy 会话、消息、图运行事实、context assembly、retrieval index、embedding vectors、`memory_entries`、revision 和 event。
  - `buddy_home/MEMORY.md` 仍是 Buddy Home 的可读文档，但长期记忆事实源是带 source/revision/event 的 `memory_entries`。
- `buddy_home/` 规范形态是 `AGENTS.md`、`SOUL.md`、`USER.md` 和 `MEMORY.md`；`policy.json` 和 `buddy.db` 属于旧设计残留，不作为权限、记忆或历史事实源。
- 平台 `memories` 体系和旧候选记忆体验不再是目标架构。
- `buddy_session_recall` 只读统一数据库事实，支持 `browse`、`discover`、`scroll`，并可返回 Buddy messages、memory entries、graph outputs、`context_assembly_ref` 和标准 `context_package`。
- `buddy_messages_fts`、`buddy_messages_fts_trigram`、`retrieval_chunks_fts`、`retrieval_chunks_fts_trigram`、embedding vectors 和 hybrid audit 表已进入统一数据库。
- `discover` 支持 snippet、bookend_start、messages、bookend_end、messages_before、messages_after、rank/newest/oldest 排序、CJK trigram 和短 token LIKE fallback。
- `buddy_sessions` 已包含 `parent_session_id`、`source`、`ended_at`、`end_reason` 等字段。
- `memory_review_template_binding` 已进入 Buddy store 和 command 路径，默认绑定 `buddy_autonomous_review`，变更可记录 revision。
- `buddy_autonomous_review` 是后台复盘加低风险记忆写回流程：召回相关会话，产出 `memory_update_plan`、`user_context_update_plan`、`buddy_identity_update_plan` 和可审查改进候选，并在同一模板内通过 `buddy_home_writer` 写入低风险 Buddy Home 更新。
- `buddy_home_writer` 负责 `memory_document.update` 等低风险 Buddy Home 写回，并留下 command/revision；它仍是唯一写入口，不把写文件逻辑藏进后端策略。
- `buddy_context_compaction` 是独立内部模板，专门处理会话压缩摘要：保护最近原文，迭代更新 `session_summary`，只允许生成 `session_summary.update` 写回命令，不触碰 `MEMORY.md`、`USER.md`、伙伴身份设定或全局运行权限设置。

必须保持的边界：

- `MEMORY.md` 是长期记忆正文；会话召回只是历史材料。
- `session_summary` 是当前会话压缩摘要，不是长期记忆，也不是新的用户指令；它只能降低上下文压力，不能提升权限或覆盖系统/用户显式规则。
- 召回结果、生成摘要和长期记忆都不能覆盖系统规则，也不能提升图编辑、文件写入、网络访问或脚本执行权限。
- 后台记忆整理必须是图模板流程，不是隐藏后端策略。
- 自动写入可以不逐条询问用户，但必须由复盘图内的受控 writer 节点执行，并保持可见、可追踪、可恢复。

仍未完成：

- Session lineage 还需要在 browse/discover/scroll 中更完整地使用：压缩续聊、分支、后台子会话应投影为一个逻辑会话或可解释 lineage。
- `buddy_autonomous_review` 还应继续强化写回质量：候选证据、去重理由、diff 摘要、风险标记、skipped reason 和 revision 展示。
- 记忆候选规则需要继续强化：
  - 可以落盘：长期偏好、项目长期决定、反复纠正、未来有用的稳定约束。
  - 不要落盘：一次性任务状态、原始日志、完整错误、临时路径、密钥、base64、大 artifact、可从项目文件重读的信息、权限升级或未经确认的推测。
- 记忆复盘图只自动写入低风险 `MEMORY.md` 更新；Action 更新、模板更新、persona 或全局运行权限设置改动应拆成独立模板、子图或审批流；会话压缩摘要由 `buddy_context_compaction` 负责。

### 2.5 Hybrid RAG 和知识库

已完成：

- 后端知识库有 `knowledge_bases`、`knowledge_documents`、`knowledge_chunks`、`knowledge_chunks_fts`、`knowledge_chunk_embeddings` 等存储路径。
- 默认官方知识库 ID 是 `toograph-official`。
- `backend/app/knowledge/loader.py` 支持官方文档导入、chunk、SQLite FTS、LIKE fallback、本地 hash embedding、metadata filter 和知识库级 embedding rebuild。
- 当前默认 embedding provider 是确定性的 `local-hash` / `hashing-v1`，维度 384。
- `search_knowledge` 会合并关键词候选和本地向量候选，输出 score、retrieval mode、keyword_score、vector_score、metadata、chunk_id、citation_id。
- `retrieve_knowledge_base_context` 会返回 `knowledge_context`，包含 `results`、`citations` 和可直接给 LLM 的 context 文本。
- 知识库上下文当前通过显式知识库 input 和后续 RAG Action 方向承载，不再保留旧 fanout Action。
- 知识库页面已有导入、检索、引用展示、重建索引、删除确认、检索质量评测等基础。

当前判断：

- TooGraph 已经能支撑基础 Hybrid RAG 原型。
- TooGraph 还不是专业 RAG 系统。缺口集中在真实 embedding provider、reranker、用户文档 ingestion、增量索引、权限隔离、RAG 专用 Action/模板、评测和引用校验。

RAG 和记忆系统的共通层：

| 共通能力 | RAG 用法 | 记忆用法 |
| --- | --- | --- |
| query planning | 把用户问题改写成知识库检索 query | 把目标改写成历史会话或偏好查询 |
| retrieval | 搜知识库 chunk | 搜 Buddy messages、memory entries、graph outputs |
| metadata filter | 过滤知识库、来源、section、时间、权限 | 过滤 session lineage、角色、时间、来源 |
| rerank/dedupe | 排序知识 chunk，去重文档 | 排序历史会话，去重 lineage |
| context budget | 控制证据长度 | 控制 MEMORY.md 和历史窗口长度 |
| source trace | citation、chunk、URL、页码 | message_id、session_id、run_id、revision_id |
| audit report | 分数、命中、遗漏、过滤 | 召回模式、窗口、写回 revision |
| eval | context precision、citation accuracy | 记忆稳定性、去重、错误沉淀率 |

RAG 和记忆系统必须分开的语义层：

| 维度 | RAG | 记忆 |
| --- | --- | --- |
| 来源 | 外部文档、网页、政策、产品资料 | Buddy Home、用户偏好、历史会话 |
| 主要问题 | “资料怎么说？” | “用户过去怎么说？偏好是什么？” |
| 权威级别 | 外部事实证据 | 个性化上下文 |
| 输出引用 | citation、chunk、URL、页码 | session、message、run、revision |
| 写入触发 | 导入、同步、rebuild | 后台复盘、稳定性判断、受控写回 |
| 失败风险 | 引用错、资料过期、检索遗漏 | 错记偏好、沉淀临时信息、权限误升 |

推荐统一上下文包合同：

```json
{
  "kind": "context_package",
  "source_kind": "knowledge|memory|session|page|capability|web",
  "authority": "evidence|preference|history|context_only|candidate",
  "query": "检索或召回使用的 query",
  "items": [
    {
      "id": "kb:docs:1",
      "title": "来源标题",
      "summary": "摘要",
      "content": "预算内上下文",
      "score": 0.82,
      "source": "URL、文件、message_id 或 revision_id",
      "metadata": {},
      "trace": {}
    }
  ],
  "citations": [],
  "budget": {
    "used_chars": 1200,
    "source_chars": 4500,
    "omitted_count": 2
  },
  "warnings": []
}
```

关键字段是 `authority`：

- `evidence`：可作为事实证据，例如 RAG 文档、网页来源。
- `preference`：长期偏好，例如 `MEMORY.md`。
- `history`：历史会话事实，例如 `buddy_messages` message。
- `context_only`：只可参考，不能作为权限或新指令。
- `candidate`：候选内容，仍需审查。

RAG 工作流教学：

```text
数据接入
-> 解析清洗
-> 结构化切块
-> metadata / 权限 / 版本管理
-> 关键词检索 + 向量检索 + metadata filter
-> 多路召回融合
-> rerank
-> 上下文预算
-> 引用和证据校验
-> 生成回答
-> 评测、日志、反馈闭环
```

专业 RAG 需要注意：

- 数据接入要记录来源、版本、hash、发布日期、URL、页码或章节。
- 文档解析不能只抽文本，还要保留结构、标题、表格语义和引用位置。
- 切块要按标题、段落、句子、表格或代码结构尽量保持语义，避免固定长度切断关键条款。
- 索引通常要同时包含关键词索引、向量索引和 metadata 索引。
- 用户 query 常常要清洗、拆分、改写、多查询或 HyDE。
- 检索第一轮追求召回，第二轮用融合和 rerank 精排。
- 上下文拼装要控制预算、去重、保留 citation id、过滤低置信度内容。
- 回答生成要把结论与证据绑定；资料不足时说明不足，不能编造。
- 评测要覆盖检索命中、上下文相关性、答案忠实度、引用准确性、资料不足时的拒答能力、延迟和成本。

常见 RAG 术语：

| 术语 | 解释 |
| --- | --- |
| RAG | Retrieval-Augmented Generation，检索增强生成；回答前先查外部知识。 |
| LLM | 大语言模型，负责理解、推理和生成文本。 |
| Knowledge Base | 知识库，保存可检索文档、chunk、索引和元数据。 |
| Document | 原始或解析后的文档。 |
| Chunk | 文档切出来的检索片段，是 RAG 的基本召回单位。 |
| Chunking | 切块策略，例如按标题、段落、固定 token、递归结构切分。 |
| Overlap | 相邻 chunk 的重叠内容，用于减少切断语义。 |
| Metadata | 来源、时间、版本、权限、章节、页码等结构化信息。 |
| Embedding | 把文本变成向量，用于语义相似度检索。 |
| Dense Vector | 稠密向量，适合语义相似。 |
| Sparse Vector | 稀疏向量，保留词项权重，接近关键词检索。 |
| Vector Store | 向量库，用于保存向量并做相似检索。 |
| FTS | Full Text Search，全文检索。 |
| BM25 | 常见关键词相关性排序算法。 |
| Hybrid Search | 关键词和向量混合召回。 |
| Top-k | 取分数最高的前 k 条结果。 |
| Similarity | 相似度，常见有 cosine similarity。 |
| ANN | Approximate Nearest Neighbor，近似最近邻，用于大规模向量检索。 |
| HNSW / IVFFlat | 常见 ANN 索引结构。 |
| Reranker | 重排模型，对候选结果做更精细排序。 |
| Recall | 召回率，正确资料是否被找回来。 |
| Precision | 精确率，找回资料中有多少相关。 |
| Context Window | 模型一次可读取的上下文容量。 |
| Context Budget | 分配给检索资料、历史、指令、输出的上下文预算。 |
| Citation | 引用，答案与来源 chunk、URL、页码的绑定。 |
| Grounding | 让回答基于给定证据。 |
| Hallucination | 幻觉，模型编造未被证据支持的内容。 |
| Faithfulness | 忠实度，答案是否被上下文支持。 |
| Context Precision | 提供给模型的上下文有多少是相关内容。 |
| Context Recall | 需要的证据是否进入上下文。 |
| Query Rewrite | 查询改写，提高检索命中率。 |
| Multi-query Retrieval | 多查询检索，用多个 query 捕捉不同表达。 |
| HyDE | 先生成假想答案，再用假想答案检索。 |
| RRF | Reciprocal Rank Fusion，用排名位置融合多个结果列表。 |
| GraphRAG | 结合实体关系图谱的 RAG。 |
| RAPTOR | 层级摘要和检索方法。 |
| Agentic RAG | 由 Agent 动态规划检索、工具调用和多步验证。 |

RAG 路线图：

- P0：建立标准 `context_package` 合同，明确 `knowledge_context` 和 `memory_context` 权威边界。
- P1：新增 `knowledge_retrieval` Action，输出标准上下文包、citations、scores、budget、warnings。
- P1：明确 Buddy Home 只读能力；读取结果要在输出中标注 `authority=preference`。
- P1：建立 `rag_question_answering` 模板：输入问题和知识库 -> query planning -> `knowledge_retrieval` -> citation-aware answer -> output。
- P1：为 RAG 增加 eval：检索命中、引用准确、资料不足拒答、过度引用、chunk 质量、上下文预算。
- P2：接入真实 embedding provider 和 reranker，保留 `local-hash` 作为 deterministic fallback。
- P2：支持用户文档知识库 ingestion：PDF/Word/HTML/Markdown、结构化 chunk、增量索引、删除一致性、版本管理。
- P2：权限隔离和 metadata filter 要成为检索合同的一部分，不靠 prompt。
- P3：探索 GraphRAG、RAPTOR、多模态 RAG 和 Agentic RAG，但不要在基础检索和评测不稳时提前堆复杂度。

### 2.6 本地工作区 Action

已完成：

- `local_workspace_executor` 支持 `read`、`list`、`search`、`edit`、`write`、`execute`。
- 它对路径做仓库内约束，拒绝 `.git`、`.env`、`backend/data/settings` 等危险位置。
- 它会输出 activity events。
- `edit` 已经是独立局部编辑操作，不再退化成完整 `write`：
  - 输入 `old_string`、`new_string`、`replace_all`。
  - 默认要求 `old_string` 唯一匹配；多处匹配必须显式 `replace_all=true`。
  - 修改前检查 `expected_sha256` 和 `expected_mtime_ns`，文件变化后返回 `stale_file`。
  - 成功后 activity event 写入 old/new hash、old/new mtime、匹配数、行级增删统计和统一 patch。
- `write` 创建新文件时可直接写；覆盖已有文件时必须带 `expected_sha256` 和 `expected_mtime_ns`。
- `before_llm.py` 在预读文件上下文中输出文件内容、`sha256` 和 `mtime_ns`，供 `edit` 或覆盖写入做 read-before-write。
- `execute` 支持 `args` JSON 数组，并把 args 写入 command activity event detail。
- `toograph_script_tester` 在临时目录写测试文件，使用命令 allowlist，返回命令、退出码、stdout、stderr、耗时和 activity events。

仍未完成：

- `execute` 仍缺少只读命令识别、后台任务和大输出 artifact。
- 权限暂停仍偏 Action 级，未来应按 operation 展示风险：read/list/search、edit/write、execute 分开。

目标 operation 协议：

```text
operation:
  read
  list
  search
  edit
  write
  execute
```

`edit` 推荐输入：

```json
{
  "operation": "edit",
  "path": "action/user/example/after_llm.py",
  "old_string": "timeout=30",
  "new_string": "timeout=60",
  "replace_all": false,
  "expected_sha256": "pre-read sha256",
  "expected_mtime_ns": "pre-read mtime_ns"
}
```

推荐底层 helper：

- `workspace_paths`：路径归一化、危险根拒绝、读写执行根校验。
- `workspace_read`：文本读取、大小限制、二进制拒绝、文件快照。
- `workspace_edit`：`old_string -> new_string`、唯一匹配、replace_all、stale 检查、patch。当前已在 `local_workspace_executor/after_llm.py` 内实现，未来可抽 helper。
- `workspace_write`：新建文件和完整覆盖；覆盖已有文件前要求完整快照。当前已在 `local_workspace_executor/after_llm.py` 内实现，未来可抽 helper。
- `workspace_execute`：脚本/命令执行、args 数组、timeout、输出裁剪；后台任务和大输出 artifact 仍未完成。
- `workspace_events`：activity events、错误类型、diff 摘要和 artifact refs。

### 2.7 结构化输出与 Function Calling

已完成：

- TooGraph 主协议仍是 `node_system`、`state_schema`、Action、Subgraph 和 graph run。
- 代码已有 `structured_output_schema` 参数、OpenAI-compatible `response_format` / Codex Responses text format 适配、provider 拒绝后的 fallback 和运行时校验基础。

未完成：

- Provider 能力矩阵：记录 JSON Schema、strict schema、tool calling、parallel tool calls、streaming structured output 和 fallback 行为。
- Model Providers 页面展示结构化输出能力，运行记录记录实际策略。
- Provider 级 tool/function schema 归一化，把 TooGraph 的 LLM 输出 schema 转成对应 provider 工具调用格式。
- Tool/function calling 只服务结构化输出约束，不能直接执行 TooGraph Action。
- Repair retry：JSON parse 失败、schema validation 失败、缺字段、错类型、业务约束失败时统一修复，记录最大次数、错误路径、原始输出、修复输出和最终状态。
- 运行详情展示 schema、provider 策略、原始模型文本、解析结果、validation errors、repair 次数和 fallback 原因。

非目标：

- 不把 function calling 升级为 TooGraph 的主协议。
- 不允许 provider tool call 绕过 `config.actionKey`、`capability` state、权限模式或 human review。
- 不为旧图协议恢复 `config.skills`、绑定推断或 prompt-only 隐式工具调用。

### 2.8 Eval 和官方模板

已完成：

- Eval 存储、API 和前端评测中心已存在，支持 suite、case、run、case result、check result、artifact、单 case run/rerun、批量运行/采集、LLM judge 开关和失败诊断。
- 官方 `eval_cases.json` 已覆盖 Buddy 主循环、页面操作、Action 创建、联网搜索和现有业务模板。
- 官方模板已经覆盖：
  - `advanced_web_research_loop`
  - `buddy_autonomous_loop`
  - `buddy_autonomous_review`
  - `toograph_page_operation_workflow`
  - `toograph_action_creation_workflow`
  - `toograph_graph_template_creation_workflow`
  - `policy_navigator_agent`
  - `ai_news_digest_to_wechat_article`
  - `multi_platform_content_repurposer`
  - `job_application_interview_coach`
  - `game_creative_factory`
  - `product_competitor_research_agent`
  - `ecommerce_review_mining_agent`

模板长期准入标准：

- 模板必须体现固定流程、结构化中间产物、证据链、artifact 输出、Eval 和可复跑 run 记录。
- 只有“输入一段话、输出一段话”的场景不进入官方模板重点。
- 每个模板应有目标用户、输入 schema、Graph State、节点流程、Action/Subgraph 列表、权限说明、失败边界和 output contract。
- 需要用户补充信息时，通过最终输出询问并结束本轮；下一轮从普通输入和历史上下文读取补充。
- 涉及政策、求职、商业、合规或营销建议时，必须保留来源、限制条件、不确定项和人工确认提示。

官方业务模板完整模式仍待补齐：

- `policy_navigator_agent`：URL/PDF 解析、多文件新旧冲突识别、真实知识库检索执行器、评测自动运行。
- `ai_news_digest_to_wechat_article`：RSS、定时运行、主题订阅、选题偏好闭环、封面提示词、评测自动运行。
- `multi_platform_content_repurposer`：更细用户反馈二次修改、平台分发评分、封面生成提示词。
- `job_application_interview_coach`：多 JD 对比、多轮模拟面试、弱点趋势、行业薪资数据。
- `game_creative_factory`：真实 RSS、广告素材抓取、视频理解服务、审核返修循环、生成任务下游执行。
- `product_competitor_research_agent`：URL/截图/应用商店评论导入、知识库检索、真实批量证据导入。
- `ecommerce_review_mining_agent`：真实 CSV/JSON 批量导入、平台合规词库、评论来源统计、生成素材下游执行。

### 2.9 Buddy 主循环与 Hermes Agent 差距

本节用于回答一个长期产品问题：当前 TooGraph Buddy 主循环距离通用 Agent，尤其是 `demo/hermes-agent/` 这类成熟本地 Agent，还有哪些差距。

核心结论：

- TooGraph 的优势是图优先、可审计、可回放、可审批：能力调用、子图、记忆写回、运行树和 output 胶囊都应表现为显式图流。
- Hermes 的优势是 Agent 工程成熟度：主循环鲁棒性、工具生态、记忆后台复盘、技能沉淀、任务调度、委派、上下文压缩、provider 兼容和运行诊断都更完整。
- TooGraph 不应照搬 Hermes 的隐藏 while-loop 和直接 tool-call 架构；应把 Hermes 风格能力翻译成图模板、Action、Tool、Subgraph、run record、revision 和 approval。
- 近期最重要的差距不是“能不能调用工具”。官方主循环输入边界已经收敛，剩余重点是召回质量、能力选择质量、失败恢复、自我改进闭环和诊断可见性。

当前 TooGraph Buddy 基线：

- 官方默认主循环是 `buddy_autonomous_loop`。它已经切换到改良输入边界：绑定页只绑定当前用户消息，历史、会话摘要、当前 session id 等运行时上下文由 `buddy_history_context_loader` Tool 在图内组装；同时保留上下文压力检查、可选上下文压缩、回复与能力选择、一次动态能力执行、能力结果复盘和 output-boundary 胶囊。
- 临时的 `buddy_main_loop_test` 已并入官方主循环，不再作为独立官方模板保留。
- `buddy_autonomous_review` 已经是后台复盘图：它从已完成 run snapshot 加载上下文，召回相关历史和记忆，输出长期记忆、用户文件、伙伴身份和改进候选，并通过受控 writer 写入低风险 Buddy Home 更新。
- Buddy Home 规范形态是 `AGENTS.md`、`SOUL.md`、`USER.md`、`MEMORY.md`。`AGENTS.md` 是运行/项目上下文说明，通常不由复盘记忆自动更新；`SOUL.md`、`USER.md`、`MEMORY.md` 和结构化数据库记忆分别承担身份、用户画像、长期记忆正文和召回索引。

Hermes Agent 参考基线：

- `demo/hermes-agent/agent/prompt_builder.py` 会把 `SOUL.md` 作为身份上下文，把工作目录内的 `AGENTS.md`、`.hermes.md`、`CLAUDE.md`、`.cursorrules` 等作为项目上下文。
- `demo/hermes-agent/tools/memory_tool.py` 的长期记忆写入目标主要是 `MEMORY.md` 和 `USER.md`，不是 `AGENTS.md`。
- `demo/hermes-agent/agent/background_review.py` 会在每轮之后 fork 后台 review：一条线判断是否写 memory，一条线判断是否更新 skill；后台 review 使用受限工具白名单，不污染主对话 prompt cache。
- Hermes 的通用 Agent loop 更接近传统 while-loop：模型反复思考、调用工具、读取结果、继续下一步，直到完成、预算耗尽或失败。
- Hermes 的能力生态包括 toolsets、skills、plugins、外部 memory providers、session search、context compression、cron、kanban、delegation、skill curator、provider 适配和运行恢复。

差距矩阵：

| 方向 | TooGraph 当前状态 | Hermes 参考能力 | 差距 | TooGraph 推荐设计 |
| --- | --- | --- | --- | --- |
| 主循环输入边界 | `buddy_autonomous_loop` 已只暴露当前用户消息绑定；会话历史、摘要和 session id 由 `buddy_history_context_loader` 组装 | runtime 负责会话、记忆、项目上下文组装 | 主要剩余是回归覆盖、审计展示和更完整 runtime context 报告 | 保持官方主循环只绑定当前用户消息；其他上下文都由 Tool、固定文件 input 或 runtime context state 组装 |
| 对话历史存储 | Buddy messages、context assembly、run record 已进入统一数据库；历史输入倾向引用组装 | session history 和 prompt cache 由 runtime 管理 | 官方主循环仍需完全消除重复文本输入心智负担 | run 记录保存输入引用、context assembly report 和结果 snapshot；历史文本按 message/session/run id 重建，不在每轮 run 中累加嵌套保存 |
| 上下文压缩 | `buddy_context_pressure_check` 和 `buddy_context_compaction` 已进入官方主路径 | Hermes 有 context compressor 和 prompt cache 管理 | 预算报告、压缩触发、摘要版本和恢复链路仍需更透明 | 压缩节点输出 `context_package`、保留窗口、摘要版本、source refs、omitted refs 和写回 revision |
| 记忆召回 | SQLite FTS、trigram、embedding vectors、`memory_entries` 和 `buddy_session_recall` 已存在 | Hermes 有本地文件记忆、外部 memory providers、turn 后 sync/prefetch | embedding 召回、rerank、去重、lineage 投影和评测还不够生产级 | 建完整 hybrid recall：query planning -> FTS/vector 多路召回 -> lineage 去重 -> rerank -> context budget -> trace/audit |
| 长期文件记忆 | `SOUL.md`、`USER.md`、`MEMORY.md` 和结构化 DB 记忆双线存在 | Hermes 区分 SOUL、USER、MEMORY；AGENTS 是项目上下文 | 写入目标说明还需持续体现在模板 prompt 和审计结果中 | 复盘图必须显式输出写入矩阵：身份写 `SOUL.md`，用户稳定信息写 `USER.md`，长期经验写 `MEMORY.md`，可检索事实写 DB memory |
| AGENTS.md 用途 | Buddy Home 中保留 `AGENTS.md`，作为运行/项目上下文 | Hermes 从工作目录读取 AGENTS 作为 agent 工作说明 | 容易被误解为记忆文件或自动复盘输出目标 | AGENTS 作为上下文输入和人工维护文件；自动复盘只在确有必要时产出“建议更新 AGENTS”的改进候选，不直接写入 |
| 能力选择 | `toograph_capability_selector` 可发现 Action/Subgraph/Tool 并输出单个 capability | Hermes 直接使用丰富 tool schemas 和模型 tool call | selector 排名、置信度、失败 fallback、预算和候选解释仍弱 | selector 输出候选评分、拒绝理由、调用预算、失败记忆和可审计 selection trace |
| 能力生态 | 官方 Action/Tool/Subgraph 已有骨架和若干关键包 | Hermes toolsets、skills、plugins 更丰富 | TooGraph 官方能力数量、质量、测试和文档不足 | 扩充官方 Action/Tool/Subgraph，并用 eval、manifest metadata、权限标签和示例 run 作为准入 |
| 多步骤自治 | 通过图模板、Condition、Subgraph 和动态 capability 表达 | Hermes while-loop 多轮 tool use 很成熟 | 图模板还缺统一的循环预算、stop reason、失败恢复和分支诊断 | 建立通用 Agent graph primitives：iteration budget、capability budget、stop reason、retry policy、recover path、failure output |
| 自我改进 | `buddy_autonomous_review` 能产出 improvement candidates | Hermes background review 可写 memory 和 skill，curator 管理 skills | 候选到实际 Action/模板/子图 revision 的闭环还没打通 | 建“改进候选 -> 验证 -> diff -> approval -> revision -> eval”的图模板，不用隐藏自修改 |
| 技能/能力沉淀 | TooGraph 当前是 Action/Tool/Subgraph，不使用 Hermes skill 语义 | Hermes 有 skills 和 skill curator | 缺少从成功 run 中沉淀可复用能力的成熟机制 | 以 Action package、Tool package、graph template 和 reusable subgraph 承接沉淀；curator 行为表现为显式整理图 |
| 后台任务 | 回复后可跑后台复盘图 | Hermes 有 cron、curator、后台 review、外部 memory sync | 缺少通用 scheduler、队列、周期任务和失败重试 | 增加 graph scheduler：周期复盘、记忆清理、Action 健康检查、模板 eval、知识库重建都作为图运行 |
| 委派与子任务 | Subgraph 和 batch worker 基础存在 | Hermes 有 delegation、kanban/subagents | 缺少通用 worker task packet、结果合并、并发预算和审计 UI | 用 Subgraph worker protocol 表达委派：task packet、context package、budget、result package、merge/review 节点 |
| 权限和审批 | command/revision、Action 权限和 Buddy Home writer 已有方向 | Hermes 有工具白名单、保护文件、运行边界 | operation 级权限、风险分类和 review surface 仍需完善 | Action/Tool manifest 标注 scope、risk、network、file、graph、cost；高风险能力必须进入 approval/revision |
| 运行诊断 | run detail、run tree、Buddy 胶囊已有基础 | Hermes TUI/日志/错误恢复信息更成熟 | 用户还不容易看清“为什么这么选、为什么停、召回了什么” | 增加 Agent Diagnostic view：输入来源、召回命中、context budget、selection trace、capability call、stop reason、失败恢复 |
| Provider/runtime 鲁棒性 | Model Providers 页面和结构化输出基础存在 | Hermes provider 适配、fallback、streaming、prompt cache 更成熟 | provider 能力矩阵、fallback、repair retry 和错误解释不足 | 补 provider capability matrix、结构化输出 repair、模型 fallback、运行详情原始输出和 validation trace |

近期推荐优先级：

| 优先级 | 目标 | 交付物 | 验收标准 |
| --- | --- | --- | --- |
| P0 | 官方主循环输入边界收敛 | 已将改良设计并入官方 `buddy_autonomous_loop` | Buddy 绑定页只需绑定当前用户消息；历史、摘要、session id、Buddy Home 都能在图内可见组装 |
| P0 | run record 作为唯一事实源 | run 记录保存 graph run snapshot、state 结果、context assembly refs、capability calls、output refs | Buddy 胶囊、运行记录、历史回放都能从 run record 和 DB 引用重建 |
| P1 | 完整 embedding 召回 | 统一 DB memory/message/run chunks embedding、hybrid search、rerank、audit | 每次召回能看到 query、命中、分数、source refs、预算和 omitted reason |
| P1 | 记忆复盘质量提升 | 复盘模板输出写入矩阵、证据、去重、diff、revision、skipped reason | 自动写低风险记忆；高风险变更只产出改进候选和审批入口 |
| P1 | 能力选择质量提升 | selector scoring、fallback、失败记忆、budget 和候选解释 | 每次 capability 选择都能解释为什么选、为什么不选、还剩多少预算 |
| P2 | 自我改进闭环 | improvement candidates -> 验证图 -> diff -> approval -> revision -> eval | 成功 run 能沉淀为 Action/Tool/Subgraph/template 修订，但所有副作用可审查、可撤销 |
| P2 | Agent 诊断视图 | 单页展示主循环输入、召回、压缩、能力、输出、错误和 stop reason | 用户不用读原始 JSON 也能判断一次 Buddy run 是否合理 |
| P3 | 调度与委派 | graph scheduler、worker subgraph protocol、批量任务合并 | 周期复盘、知识库重建、模板 eval、并行子任务都作为可审计图运行 |

主循环目标形态：

```text
current_user_message
-> runtime_context_loader
   输出 current_session_id、conversation_history_ref、existing_session_summary_ref、history_context_report
-> buddy_home_input
   输出 AGENTS.md、SOUL.md、USER.md、MEMORY.md 的 file state
-> memory_recall_planner
   输出 memory_query 和 recall filters
-> buddy_session_recall / memory_retrieval
   输出标准 context_package
-> context_pressure_check
   输出 budget report 和 should_compact
-> optional context_compaction subgraph
   输出 session_summary.update command 和压缩后的 context_package
-> reply_and_select_capability
   输出 assistant_message_draft、capability、selection_trace
-> optional dynamic capability execution
   输出 result_package
-> review_capability_result / continue_or_finish
-> final output
-> background buddy_autonomous_review
```

这个形态里，真正外部绑定的用户输入只有当前用户消息。其他内容不是绑定页输入，而是图运行时通过 Tool、文件 input、召回 Action 或 runtime context 组装出来的 state。session id 不应是用户手填 input；它应来自 Buddy runtime context，并在图中表现为可审计 state。

run record 和对话历史的目标存储原则：

- `buddy_messages` 保存每条用户/助手消息的原子事实：session id、role、content、created_at、source run id、output refs。
- 每次 graph run 不保存“嵌套累加后的完整聊天全文”作为事实源；它保存 context assembly refs、source message ids、summary ids、memory ids、run ids 和当次实际输入快照或可重建报告。
- 若为了审计需要保存模型当时看到的 prompt snapshot，可以保存为 run artifact 或 prompt audit snapshot，但它不是对话历史事实源，不能反过来成为下一轮历史的累加来源。
- 聊天历史重建逻辑应是：按 session lineage 查询原子 messages -> 叠加 session_summary -> 叠加 memory/context package -> 根据预算拼装当前 prompt。
- Buddy 胶囊和运行记录显示应从 run tree、node executions、state snapshot、output boundary 和 output refs 重建，不依赖聊天消息里保存的二次拼接文本。

记忆系统目标形态：

```text
短期上下文：
  当前用户消息
  当前会话最近原文窗口
  当前会话压缩摘要 session_summary

长期稳定上下文：
  buddy_home/SOUL.md
  buddy_home/USER.md
  buddy_home/MEMORY.md
  buddy_home/AGENTS.md

可召回记忆：
  memory_entries
  buddy_messages
  graph outputs
  run summaries
  retrieval_chunks

召回索引：
  FTS
  trigram
  embedding vectors
  metadata filters
  lineage / source refs
```

写记忆是双线的：

- 长期文件线：`SOUL.md`、`USER.md`、`MEMORY.md` 提供稳定、可读、可人工编辑的上下文注入。
- 数据库召回线：`memory_entries`、message chunks、run/output chunks 和 embedding vectors 服务检索、召回、排序、证据追踪和去重。

两条线不互相替代。长期文件解决“稳定上下文怎么注入”；数据库召回解决“相关历史怎么找回来”。复盘图应同时考虑这两条线，并清楚说明每条信息应该写到哪里。

非目标和约束：

- 不把 Hermes 的隐藏 monolithic loop 移植进后端。
- 不让单个 LLM 节点承担多步骤自治；整张图才是 Agent。
- 不让 provider tool call 绕过 TooGraph 的 Action、Tool、Subgraph、权限和 run record。
- 不让记忆复盘自动修改 `AGENTS.md`、Action、模板、图资产或权限设置；这些只能作为改进候选进入审批流。
- 不把完整聊天全文作为每轮 run 的递归输入事实源。
- 不把召回结果、session summary 或 generated memory 当作更高优先级指令。

验收标准：

- 官方 Buddy 主循环模板和绑定页能证明：用户只需要绑定当前消息。
- 每次 Buddy run 都能解释所有非用户输入来自哪里：Buddy Home 文件、runtime context、session summary、message refs、memory refs、knowledge refs 或 capability result。
- RunDetail、Buddy 胶囊、历史记录和后台复盘都从统一 DB/run record 重建显示。
- 每条长期记忆更新都有 source run、source message、证据摘要、revision 和 skipped reason。
- 每次能力选择都有候选、评分或理由、预算、结果和失败路径。
- 每个高风险副作用都有 approval、diff/revision、undo 或可恢复路径。
- Hermes 中有效的通用 Agent 能力被翻译为 TooGraph 图流，而不是变成后端隐藏策略。

## 3. 已处理的冲突和历史遗留

本次文档收敛要删除或折叠的旧内容：

- 旧 `docs/future/buddy-autonomous-agent-roadmap.md` 保留了大量有效路线，但其中“selector 固定页面操作入口”的描述与当前代码冲突，已折叠并更正。
- 旧 `docs/future/run-tree-dynamic-capability-remaining-work.md` 是有效剩余工作，已折叠进运行树章节。
- 旧 RAG 教学和 RAG/Memory 收敛文档有效，但旧 fanout Action 路径已删除，剩余 RAG 工作已按当前代码更新。
- 旧 superpowers plans/specs 属于历史计划，不能继续作为当前状态来源；有效细节已折叠进本文。
- 旧部署文档已折叠进本文，测试应验证 `docs/README.md`。
- 旧结构化输出待办已折叠进本文。
- `docs/assets/*` 不是文档资产，已从 docs 中移除；代码测试应引用真正的前端资源。

仍需全仓持续清理的历史术语：

- “Skill”作为当前节点能力调用的叫法是历史遗留；当前实现用 Action。
- `skillKey`、`config.skills`、`skillBindings`、`skillInstructionBlocks` 是旧协议字段，只能通过显式迁移脚本或重建路径处理，不做隐藏兼容。
- 如果知识库源文档、模板说明或外部说明仍使用旧词，应逐步改为 Action；只有 Agent 操作书型能力可以保留 Skill 术语。

## 4. 推荐优先级路线图

### P0：Buddy 官方主循环输入边界

状态：已完成官方模板替换，剩余回归和展示细节。

已完成：

1. `buddy_autonomous_loop` 已采用新的输入边界：绑定页只绑定当前用户消息。
2. `buddy_history_context_loader` Tool 已能在图内输出会话历史、已有摘要、当前 session id、来源 run id 和 history context report。
3. Buddy Home 文件仍通过固定 file state 输入进入图，不需要用户在绑定页临时粘贴。
4. 临时 `buddy_main_loop_test` 已并入官方主循环并移除，避免两个官方主循环并存。

剩余：

1. 增加浏览器级或端到端回归，验证默认 Buddy 运行不依赖手工绑定历史文本。
2. 在运行详情中进一步展示 history context report、source refs、预算和降级状态。

### P0：Run Record 唯一事实源

状态：统一数据库和 run tree 基础已存在，显示层仍需继续收敛。

已完成：

1. Buddy messages、run records、context assembly、retrieval index、embedding vectors 和 memory entries 已进入统一数据库方向。
2. Buddy 胶囊已经按 output boundary 从 run trace 分段展示。
3. RunDetail 已能展示运行树、子运行和 batch group。

剩余：

1. 明确每次图运行保存的是输入引用、context assembly refs、state 结果、capability calls、output refs 和必要 prompt audit snapshot，不把累加聊天全文作为历史事实源。
2. Buddy 胶囊、运行记录、历史回放和后台复盘都从同一 run record / DB 引用重建显示。
3. 每个 context assembly report 记录 source message ids、summary ids、memory ids、run ids、预算、裁剪和 omitted reason。
4. 对话历史组装逻辑只从原子 messages、session summary、memory/context package 和预算规则生成，不从上一轮拼接全文递归生成。

### P0：运行树可信度

状态：基础实现已完成。

已完成：

1. 子图暂停恢复续写原 child run。
2. pending subgraph breakpoint 保存 `child_run_id` 和 `graph_snapshot`。
3. resume 时读取原 child run，并用 pending breakpoint 的 checkpoint、state values、metadata、node status、node executions 恢复真正暂停点。
4. 恢复完成后更新同一个 child run，再回写父 run 的 subgraph status map、subgraph artifact 和 result package child run 标识。
5. 测试已覆盖普通 Subgraph node resume、动态 Subgraph capability resume、旧 pending metadata 兼容路径、子图内权限审批恢复和 result package child run 标识。

剩余回归：

1. 补再次暂停后继续恢复的端到端回归。
2. 补 child run 文件缺失但 pending breakpoint 仍可恢复的 fallback 回归。
3. 补失败恢复后的 run tree、snapshot 和错误展示回归。

### P1：Buddy 胶囊和运行树 UI

状态：基础实现已完成。

已完成：

1. Buddy 胶囊折叠态保持 output-boundary 摘要。
2. 展开态保留当前 output-boundary segment 的节点列表，并用 `/api/runs/{run_id}/tree` 补 subgraph 行的 child run 跳转。
3. RunDetail 使用 `frontend/src/lib/runTreeDisplayModel.ts` 展示完整运行树。
4. RunDetail 中 batch worker 子运行按 `batch_group_id` 折叠，并共享 status summary。
5. 页面刷新后，持久化消息里的 `runId` 能在再次展开时重新拉取 child run 跳转所需运行树信息。

剩余回归：

1. 补 Buddy 展开真实子运行后的浏览器级交互测试，包括打开子 run 证据、打开运行回放和加载失败态。
2. 如需要“刷新后仍保持展开”，再把 `expandedTraceMessageIds` 做成会话级 UI 状态；当前实现是刷新后再次展开重新拉取。

### P1：RAG 标准化

1. 建立 `context_package` 合同。
2. 新增 `knowledge_retrieval` Action。
3. 新增 `rag_question_answering` 模板。
4. 为 RAG 加 eval cases 和 citation 检查。
5. 接入真实 embedding provider 和 reranker。

### P1：记忆复盘增强

1. `buddy_autonomous_review` 强化候选、过滤、合并和同图写回质量。
2. 输出 diff summary、revision、skipped reason。
3. session lineage 用于 browse/discover/scroll 去重和投影。
4. 高风险记忆只写报告，不进入 `memory_update_plan.commands`。

### P1：Action/模板创建

1. `toograph_graph_template_validator` 与 writer 抽共享模板校验 helper。
2. `toograph_action_package_reader` 与 template reader 抽共享安全读取 helper。
3. Action 创建、模板创建和改进链路继续走官方流程、测试、审查和受控写入。

### P2：本地工作区能力

状态：Action 基础实现已完成，运行时和长输出能力仍未完成。

已完成：

1. `local_workspace_executor` 已有真正 `edit` operation。
2. 已引入 read-before-write 快照、mtime/hash stale 检查、唯一匹配、`replace_all` 和 patch/diff。
3. `execute` 已支持参数数组。

剩余：

1. 为 `execute` 增加只读命令识别、后台任务和大输出 artifact。
2. 权限展示从 Action 级扩展到 operation 级风险。
3. 将当前内联的 workspace path/read/edit/write/execute/event helper 抽成可复用模块。

### P2：结构化输出与 Provider 能力

1. 建 Provider 能力矩阵。
2. 加 tool/function schema 适配层。
3. 加 repair retry。
4. 运行详情展示结构化输出策略、原始输出、校验和修复记录。

### P2：模板完整模式和评测

1. 把当前轻量官方模板补到完整模式。
2. 扩大官方 eval 自动运行覆盖。
3. 让 Gallery 展示模板说明、示例输出、mock 入口、权限需求、最近 Eval 状态和使用入口。

### P3：更高级的自治和 RAG

1. Buddy 自演化优先做窄且可逆的改进：记忆更新、会话总结、Action 修订建议、模板建议和全局运行权限设置建议。
2. 风险更高的图编辑、文件写入、脚本执行、网络访问、自动化创建或 persona / 全局运行权限设置改动必须显式审批和可恢复 revision。
3. 在基础检索、引用和 eval 稳定后，再探索 GraphRAG、RAPTOR、多模态 RAG 和 Agentic RAG。

## 5. 验收标准

本文长期保持有效需要满足：

- `docs/` 下只保留本文和明确从本文可发现的长期专题路线图。
- README、AGENTS、CLAUDE、模板 metadata、测试和知识库导入不再指向已删除 docs 路径。
- 仓库当前说明不再把 `toograph_capability_selector` 描述为固定返回页面操作。
- 当前协议说明统一为 Action / Tool / Subgraph / Capability；旧 Skill 字段只作为历史迁移或未来 Agent 操作书型 Skill 被提及。
- RAG、记忆、运行树、本地工作区、结构化输出的未来事项都能从本文找到，不需要回看已删除计划。
- 改动后运行最小相关验证集，并在提交前确认没有 stale docs 引用。

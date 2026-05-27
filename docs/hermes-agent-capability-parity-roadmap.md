# TooGraph 追上 Hermes Agent 能力路线图

最后整理日期：2026-05-28。

本文是一个独立长期路线图，目标是把 `demo/hermes-agent/` 中已经成熟的通用 Agent 能力，翻译成 TooGraph 的图优先架构。这里的“追上”不是复制 Hermes 的实现形状，而是在 TooGraph 中实现同等级能力：

- Hermes 用同步 Agent loop、tool calls、skills、plugins、cron、gateway 和后台 fork 表达能力。
- TooGraph 应用图模板、Action、Tool、Subgraph、run record、revision、approval、artifact 和可视化运行树表达同类能力。
- 单个 LLM 节点只做一次模型回合；多步骤智能属于整张图。
- 重要副作用必须可见、可审计、可恢复。

## 1. 参考基线

### Hermes Agent 已具备的关键能力

从 `demo/hermes-agent/website/docs/developer-guide/architecture.md`、`run_agent.py`、`agent/background_review.py`、`agent/curator.py`、`agent/prompt_builder.py`、`tools/memory_tool.py` 可以看到 Hermes 的能力形态：

- Agent loop：`AIAgent` 负责 provider 选择、prompt 构造、tool 执行、retry、fallback、callback、上下文压缩和持久化。
- Prompt system：从 `SOUL.md`、`MEMORY.md`、`USER.md`、skills、`AGENTS.md`、`.hermes.md`、工具说明和模型特定提示组装系统 prompt。
- Provider resolution：统一解析 provider/model/API mode/API key/base URL，供 CLI、gateway、cron、ACP、辅助任务复用。
- Tool system：中心 registry 管理大量工具和 toolsets，负责 schema、dispatch、availability check、error wrapping。
- Session persistence：SQLite session store + FTS5，支持 lineage、平台隔离、原子写入和 search。
- Background review：每轮后 fork 一个受限后台 Agent，判断 memory 和 skill 是否需要更新；只给 memory/skill 工具白名单。
- Curator：周期性整理技能库，归并、归档、评分、修复 cron skill 引用，产出报告。
- Cron / gateway / platform：定时任务、平台消息、授权、slash command、hook、后台维护。
- Delegation：支持子任务委派、并发限制、结果合并和 provider/runtime 继承。
- Runtime robustness：工具调用去重、tool-call repair、provider fallback、stream parse recovery、credential refresh、max iterations、context compression。

### TooGraph 当前基线

当前 TooGraph 已经有一些关键基础：

- 官方 `buddy_autonomous_loop` 已只绑定当前用户消息；历史、摘要、session id 由 `buddy_history_context_loader` Tool 组装。
- `buddy_context_pressure_check` + `buddy_context_compaction` 已进入主循环，压缩作为可见图分支。
- 动态 `capability` state 可表达 `action` / `subgraph` / `tool` / `none`，并写入 `result_package`。
- `buddy_autonomous_review` 已作为后台复盘图，能输出记忆更新、用户信息更新、身份更新和改进候选。
- Buddy Home 规范为 `AGENTS.md`、`SOUL.md`、`USER.md`、`MEMORY.md`。
- 统一数据库已包含 Buddy messages、run records、context assembly、retrieval index、embedding vectors、memory entries 等方向。
- RunDetail、run tree 和 Buddy 胶囊已经提供基础可视化。

核心差距集中在成熟度和闭环：

- loop 预算、stop reason、失败恢复、诊断还不够强。
- memory recall、embedding、rerank、lineage、eval 还不够生产级。
- capability selector、能力生态、工具注册、权限、调度、委派和自我改进闭环仍不完整。

## 2. 总体架构目标

目标架构分为六层：

```text
Buddy / Agent entry
-> Runtime context loader
-> Context package and recall layer
-> Graph agent loop
-> Capability execution layer
-> Review / memory / improvement layer
-> Scheduler / delegation / diagnostics layer
```

关键原则：

- 用户绑定入口保持极简：默认 Buddy 主循环只绑定当前用户消息。
- 所有历史、记忆、session id、Buddy Home、知识库、网页、工具结果都进入显式 state。
- 每次能力调用都可在 run record 中复原：输入、选择理由、权限、结果、失败、耗时、artifact。
- 自我改进是图流：候选 -> 验证 -> diff -> approval -> revision -> eval。
- scheduler、delegation、curator 都是可审计图运行，不是隐藏后端策略。

## 3. 差距与解决方案

本节按能力差距逐项展开。每个差距都用同一套阅读方式：

- Hermes 能力：`demo/hermes-agent` 中已经具备的能力形态。
- TooGraph 差距：当前架构中缺失或成熟度不足的部分。
- 解决方案：在 TooGraph 图优先架构下应该怎么补。
- 验收标准：开发完成后如何判断真的追上，而不是只做了一个表面功能。

### 3.0 差距落地总表

| 差距点 | Hermes 参考 | TooGraph 目标形态 | 解决路径 | 关键产物 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| Agent loop 鲁棒性 | `run_agent.py`、`agent/iteration_budget.py`、`agent/tool_executor.py` | 默认 Buddy 主循环有预算、停止原因、失败分类、诊断输出 | 用 `agent_loop_control` state 和 `agent_loop_guard` Tool 把循环控制图化；run record 写标准 stop reason；RunDetail 和胶囊读取同一事实源 | `agent_loop_guard`、stop reason schema、RunDetail Agent Diagnostic | P0 |
| Prompt / Context Assembly | `agent/prompt_builder.py`、`agent/system_prompt.py`、`agent/context_engine.py` | 所有上下文都以 `context_package` 进入 LLM，来源与 authority 可审计 | Buddy Home、历史、记忆、知识库、网页、能力结果统一包装为 context package；prompt assembly 按 authority 分段渲染；RunDetail 展示裁剪与来源 | `context_package` 合同、Context Assembly 面板、source refs | P0 |
| Session persistence 与搜索 | `hermes_state.py`、`tools/session_search_tool.py` | 历史是原子消息 + 摘要 + lineage + run refs，而不是每轮复制全文 | 完善 `buddy_sessions`、`buddy_messages`、`session_summaries`、`context_assemblies`、run/message links；FTS + embedding 混合搜索 | session search API、lineage 过滤、历史证据展开 | P1 |
| 长期记忆与 Embedding 召回 | `tools/memory_tool.py`、`agent/memory_manager.py`、`plugins/memory/*` | 文件记忆负责稳定注入，DB 记忆负责可检索召回，二者互相引用但不互相替代 | 保持 Buddy Home 文件线；DB `memory_entries` 记录 kind、confidence、source refs、revision；embedding job queue + hybrid recall + rerank | embedding model registry、embedding jobs、hybrid recall report | P1 |
| Background Review | `agent/background_review.py` | 主回复完成后触发独立后台复盘图，不污染可见回复路径 | 可见 run 完成后 enqueue `buddy_autonomous_review`；复盘读取 source run snapshot；写入 memory/file revision 或 improvement candidate；失败可见可重跑 | background run queue、review report、source_run_id links | P1 |
| 自我改进与 Curator | `agent/curator.py`、`hermes_cli/curator.py` | 运行经验变成可审查候选，候选经过 diff、验证、approval、revision | 定义 `improvement_candidate`；新增 improvement workflow 和 capability curator；官方资产只生成候选，应用改动走 revision | improvement candidates、curator report、eval case | P2 |
| Capability Selector 与能力路由 | `model_tools.py`、`tools/registry.py`、`toolsets.py` | selector 不只选择能力，还记录候选评分、拒绝理由、权限和 fallback | 统一 capability profile；selector 输出 score breakdown、rejected candidates、permission summary；失败写 usage event 供下一次选择参考 | capability profile、usage events、selection trace | P1 |
| Action / Tool / Subgraph 生态 | `tools/*`、`plugins/*`、`toolsets.py` | 官方能力覆盖常用低层操作，每个能力有合同、权限、失败模式和测试 | Core Tools、Workspace Actions、Web Actions、Knowledge Tools、Graph Actions、Buddy Actions 分层建设；manifest 增强 permissions/scopes/artifacts/eval | capability catalog、能力准入规范、官方能力包 | P1-P2 |
| Scheduler / Cron / 后台任务 | `cron/jobs.py`、`cron/scheduler.py`、`tools/cronjob_tools.py` | 定时任务是 scheduled graph job，每次运行都是可审计 graph run | 建 `scheduled_graph_jobs` 和 job runs；后台 tick 到点创建图运行；支持暂停、立即运行、失败记录、retry policy、delivery target | Scheduler store/runtime/UI、job run history | P2 |
| Delegation / Subagents / Kanban | `tools/delegate_tool.py`、`hermes_cli/kanban_db.py`、`tools/kanban_tools.py` | 委派表达为 Subgraph worker，主图负责拆分、预算、合并结果 | 定义 `worker_task_packet` 和 `worker_result_package`；Subgraph worker 模板执行受限能力；merge/review 节点聚合 | worker packet/result schema、worker run links、并发预算 | P2-P3 |
| Provider Runtime 与模型能力矩阵 | `providers/base.py`、`hermes_cli/runtime_provider.py`、`agent/model_metadata.py`、`agent/transports/*` | 所有模型调用走同一 resolver，知道 provider 能力、fallback、repair trace | 扩展 provider profile；LLM、Action planning、review、scheduler、embedding/rerank 共用 runtime resolver；结构化输出 repair + fallback | provider capability matrix、fallback policy、repair trace | P2 |
| 上下文压缩与 Prompt Cache | `agent/conversation_compression.py`、`agent/context_compressor.py`、`agent/prompt_caching.py` | 压缩是可审计图分支，摘要带 source refs，稳定上下文不反复破坏缓存 | 标准化压缩输出；保存 prompt snapshot 的引用而不是递归全文；复盘写入只影响下一轮 | compression report、summary revision、budget panel | P1 |
| 权限、安全与注入防护 | `tools/approval.py`、`tools/path_security.py`、`tools/tirith_security.py`、`agent/file_safety.py`、`agent/redact.py` | 高风险副作用、注入风险和 secret 暴露都有通用 guardrail | context scanner 检查外部内容；operation-level approval；官方资产保护；run record 脱敏；定时任务不绕过权限 | context scanner、permission profile、approval audit | P1-P2 |
| Plugin / Extension 体系 | `hermes_cli/plugins.py`、`plugins/*` | 插件可提供 Action/Tool/template/model provider/hooks，并有生命周期与权限 | 定义 TooGraph plugin manifest；install/enable/validate/update/uninstall；插件能力进入统一 capability catalog | plugin manifest、Plugin 页面、hook runtime | P3 |
| Gateway / 多入口 / 消息平台 | `gateway/run.py`、`gateway/session.py`、`gateway/platforms/*`、`tui_gateway/*` | Web Buddy、API、CLI、cron、webhook 共用 session routing 和 run store | 定义 `agent_entrypoint`；entrypoint + external user + conversation -> Buddy session；CLI 先行，平台 gateway 后置 | entrypoint abstraction、CLI runner、platform session mapping | P3 |
| 诊断与可观测性 | `hermes_cli/logs.py`、`hermes_cli/status.py`、`tui_gateway/*` | 用户能看到一次 Agent run 的上下文、能力选择、预算、停止原因和错误 | Agent Diagnostic view 聚合 context、recall、selection、capability result、loop budget、errors；后台任务生成 report artifact | diagnostic view、capsule diagnostics、metrics | P1-P2 |
| Eval 与质量门禁 | `tests/*` | 主循环、召回、selector、压缩、自我改进、scheduler 都有自动评测 | 建 Agent eval suites；官方模板变更必须跑相关 eval；Action/Tool 包自带测试或 eval case | eval suites、quality reports、template gate | P1 |

### 3.1 Agent Loop 鲁棒性

Hermes 能力：

- `AIAgent` 有 `max_iterations`，多轮 tool call loop，能处理工具调用、并发、去重、fallback、压缩和持久化。
- provider 异常、stream 解析异常、tool call 参数异常都有恢复路径。
- 达到最大迭代、工具失败、模型失败时有明确处理逻辑。

TooGraph 差距：

- 图模板能表达循环，但缺少统一的 Agent loop runtime contract。
- Condition 节点有局部 `loopLimit`，但缺少跨整张图的 capability budget、iteration budget、stop reason、retry policy。
- 失败后用户很难判断是模型问题、能力问题、权限问题、上下文问题还是图结构问题。

当前进展：

- 已新增官方 `agent_loop_guard` Tool，维护 `agent_loop_control`、能力调用计数、失败计数、retry budget 和标准 stop reason。
- 官方 `buddy_autonomous_loop` 已接入 `agent_loop_guard`，并通过 schema-backed state 暴露 `agent_loop_report`、`agent_loop_stop_reason`、`agent_loop_should_continue` 和 `agent_loop_should_retry`。
- 已有模板测试覆盖 Buddy 主循环的 guard 节点、状态绑定和预算耗尽 eval case；新增 Tool 单测覆盖 catalog、继续、能力预算耗尽和失败重试/停止判定。
- 统一数据库已新增 `agent_loop_events` 运行时事实投影；保存 graph run 时会从 `agent_loop_report` state event 生成可查询循环事件，并保存同节点最近的 `agent_loop_control` 预算快照；加载 run detail 时会恢复 `agent_loop_events`。
- `RunDetail` API schema 已显式返回 `agent_loop_events`；RunDetail Agent Diagnostic 会优先读取这些投影事实来还原 stop reason、decision、iteration budget、capability budget、能力引用和 warnings。
- Buddy 胶囊运行树已可从同一 `agent_loop_events` 事实源给对应节点补充 stop、decision 和 capability budget 标签；胶囊分段逻辑仍只按 output 边界决定，不会因为循环诊断事实创建额外胶囊。
- RunDetail Agent Diagnostic 已把标准 stop reason 接入统一用户可见解释文案，覆盖 `provider_failed`、`permission_required`、`context_budget_exhausted` 以及其他 Agent loop 停止原因；页面显示本地化标题、说明、原始 stop reason、循环预算和能力预算。
- `agent_loop_events` 存储 fixture 已覆盖 `provider_failed`、`permission_required`、`context_budget_exhausted`，验证保存 run、数据库投影、加载 `RunDetail` schema 时能保留标准 stop reason、预算快照和结构化错误详情。
- RunDetail Agent Diagnostic 模型测试已覆盖投影事件中的 provider 失败详情，会把 `error_type` / `error_message` 与 warnings 一起作为用户可见诊断证据重组。
- RunDetail 页面结构测试已覆盖 Agent Diagnostic 的独立 warning list，页面会把这些由运行事实重组出的错误详情作为可扫描诊断证据展示。
- 已新增真实图运行端到端回归：最小 LangGraph 图实际调用 `agent_loop_guard` Tool，验证 `agent_loop_report` / `agent_loop_stop_reason` 从运行时 state 写入、投影成 `agent_loop_events`、通过 `/api/runs/{run_id}` 返回，并保留给 RunDetail 与 Buddy 胶囊共用的诊断事实。

解决方案：

1. 定义 `agent_loop_control` state：
   - `iteration_index`
   - `max_iterations`
   - `capability_call_count`
   - `max_capability_calls`
   - `last_stop_reason`
   - `failure_count_by_node`
   - `retry_budget`
   - `warnings`
2. 增加通用 Tool：`agent_loop_guard`。
   - 输入当前 loop control、capability trace、context budget、last result。
   - 输出是否继续、是否重试、是否降级、stop reason。
3. 官方 Buddy 主循环加入 guard 节点：
   - capability 执行后先进入 guard。
   - guard 决定回到上下文压力检查、进入最终回复、进入失败解释输出，或请求人工 review。
4. run record 增加标准 stop reason：
   - `completed`
   - `needs_user_clarification`
   - `max_iterations_reached`
   - `capability_budget_exhausted`
   - `permission_required`
   - `provider_failed`
   - `tool_failed`
   - `graph_validation_failed`
   - `context_budget_exhausted`
5. RunDetail 和 Buddy 胶囊显示 stop reason 和 loop budget。

验收标准：

- 每次 Buddy run 都能看到循环次数、能力调用次数、停止原因。
- 达到预算时输出可理解的最终消息，而不是静默失败。
- 同一个 capability 连续失败会触发明确 fallback 或停止策略。
- 运行详情能区分模型失败、能力失败、权限等待、图结构失败。

优先级：P0。

### 3.2 Prompt / Context Assembly

Hermes 能力：

- `prompt_builder.py` 统一组装 SOUL、MEMORY、USER、AGENTS、`.hermes.md`、skills、tool guidance、模型特定说明。
- 对上下文文件做注入扫描。
- memory snapshot 在 session 内稳定，避免频繁破坏 prompt cache。

TooGraph 差距：

- Buddy Home 已有文件结构，但上下文注入、数据库召回、知识库召回和能力结果还没有统一上下文包合同贯穿所有模板。
- 运行详情能看到部分 state，但对“模型到底看到了什么上下文、来源是什么、权威级别是什么”还不够清晰。

当前进展：

- `buddy_history_context_loader` 已将 `conversation_history` 输出升级为 `context_package`，包内记录 `source_kind=session`、`authority=history`、来源 refs、预算、warnings 和嵌套 `context_assembly_ref`。
- LLM prompt assembly、上下文压力检查、RunDetail 上下文审计和 Buddy graph fallback 已能识别并展开 `context_package`。
- `buddy_session_recall` 已输出 `source_kind=memory`、`authority=evidence` 的 `context_package`，召回的 Buddy messages、memory entries 和 graph outputs 可通过同一路径展开。
- `buddy_home_context_loader` 已把 Buddy Home 文件选择升级为 `source_kind=buddy_home` 的 `context_package`；官方 Buddy 主循环保留 Buddy Home input 节点，但 LLM 读取的是带 `buddy_home_file` source refs、item authority、预算和 warnings 的组装包。
- `knowledge_context_loader` 已把 `search_knowledge` 结果升级为 `source_kind=knowledge`、`authority=evidence` 的 `context_package`；知识库 chunk 以 `knowledge_chunk` source ref 写入 context assembly，可从 `knowledge_chunks` 数据库事实重新展开。
- `capability_context_loader` 已把 Action、Tool、Subgraph 的 `result_package` 输出升级为 `source_kind=capability`、`authority=evidence` 的 `context_package`；输出项以 `capability_result_output` source ref 写入 context assembly，优先从 `graph_runs.detail_json.state_values` 重新展开。
- `runtime_context_loader` 已把图运行时上下文升级为 `source_kind=runtime`、`authority=context_only` 的 `context_package`；运行时字段以 `runtime_context_item` source ref 写入 context assembly，可从 source blob 重新展开，并默认过滤敏感 key。
- `page_context_loader` 已把页面操作上下文、页面快照文本、可用页面命令、页面事实和操作结果升级为 `source_kind=page`、`authority=context_only` 的 `context_package`；页面分区以 `page_context_item` source ref 写入 context assembly，可从 source blob 重新展开。
- `web_context_loader` 已把网页搜索结果和已保存网页正文 artifact 升级为 `source_kind=web`、`authority=evidence` 的 `context_package`；网页来源以 `web_source_document` 或 `web_search_result` source ref 写入 context assembly，优先从 capability artifact 重新展开。
- 核心上下文来源已经收敛到同一 `context_package` 合同；后续重点是把更多官方模板接入这些 loader，并完善 RunDetail 的上下文面板交互。

解决方案：

1. 定义标准 `context_package`：
   - `source_kind`: `buddy_home|session|memory|knowledge|web|capability|page|runtime`
   - `authority`: `instruction|identity|preference|history|evidence|context_only|candidate`
   - `items[]`: `id/title/content/summary/score/source_ref/metadata`
   - `budget`: `used_chars/source_chars/omitted_count`
   - `warnings`
2. Buddy Home reader 输出四个分区：
   - `AGENTS.md`: `authority=context_only` 或 `instruction`，只用于项目/运行说明，不作为记忆写回目标。
   - `SOUL.md`: `authority=identity`
   - `USER.md`: `authority=preference`
   - `MEMORY.md`: `authority=preference`
3. `buddy_history_context_loader` 输出：
   - `conversation_history` context package。
   - `history_context_report`，包含 message ids、summary ids、omitted reason、lineage。
4. LLM prompt assembly 使用同一渲染路径：
   - state schema 决定可见输入。
   - context package 按 authority 分段。
   - recall 内容明确标记为上下文材料。
5. RunDetail 增加 Context Assembly 面板：
   - 展示所有 context package。
   - 展示来源、裁剪、预算、权威级别。

验收标准：

- 任意 Buddy run 能列出每段上下文来源。
- `AGENTS.md`、`SOUL.md`、`USER.md`、`MEMORY.md` 在 UI 和 run record 中边界清晰。
- 历史、摘要和召回结果不会被显示成新的用户指令。
- 同一个 context package 能用于 Buddy、RAG、复盘、能力选择。

优先级：P0。

### 3.3 Session Persistence 与搜索

Hermes 能力：

- SQLite session storage + FTS5。
- session lineage 用于压缩、分支、平台隔离和 session search。
- 历史搜索服务于“过去发生过什么”，不等同于长期记忆。

TooGraph 差距：

- Buddy messages 已存在，但 session lineage、context assembly refs、run refs、summary refs 和搜索投影还需要更系统地使用。
- 证据搜索已具备只读查询入口，下一步差距集中在 embedding 混合检索和更完整的 summary/source refs 投影。

当前进展：

- `buddy_sessions`、`buddy_messages`、`buddy_message_revisions`、`buddy_message_run_refs` 已进入统一数据库，消息 FTS 和 trigram FTS 会随消息写入更新。
- `buddy_session_recall` 已能用 FTS/trigram/LIKE fallback 发现历史消息，并默认排除当前 session lineage，召回结果输出 `context_package`。
- 已新增官方 `session_search_context_loader` Tool，把显式历史搜索 query 转成 `source_kind=session`、`authority=history` 的 `context_package`；结果包含 message ids、session lineage、hit snippets、source refs、预算和 warnings，可从 `buddy_messages` 原子事实重新展开。
- 已新增面向 UI/API 的只读搜索视图：`/api/buddy/search/sessions` 复用 Buddy message FTS、lineage 去重和当前会话谱系排除，返回 session snippets、bookends、hit message ids；`/api/buddy/search/run-context` 从 graph run 的 `state_values`、`state_snapshot`、`state_events` 和 context assembly refs 展开某次 run 实际使用过的上下文来源。
- 前端 API/types 已能直接调用 session evidence search 和 run context evidence search。
- 已新增 `/evidence` 证据搜索页：左侧检索 Buddy 会话历史，展示 session lineage、hit message ids、bookends 和消息窗口；右侧按 run id 展开运行上下文来源，展示 `assembly_id`、`target_state_key`、source refs、renderer、authority 和 metadata，并可跳转 Run Detail。
- Buddy message 写入现在会投影为 `source_kind=buddy_message` 的 retrieval document/chunk，并为已启用 embedding models 自动排队，供 session 语义召回复用统一 embedding pipeline。
- `/api/buddy/search/sessions` 已支持 `embedding_model_ref`，可通过 retrieval hybrid search 合并 FTS 与向量结果，并在 session hit 上返回 retrieval mode、score 和 query audit id。
- `/evidence` 的会话历史检索已加入 embedding model 选择器，能直接发起 session hybrid search，并在结果卡片显示 retrieval mode、lexical score 和 vector score。
- session search 结果已展开 `source_refs`，包含命中的 `buddy_message` 原子消息和通过 `buddy_message_run_refs` 关联的 `graph_run`，证据页会直接显示这些 refs。
- `session_summary.update` 现在会在能从 source run runtime context 推断 `buddy_session_id` 时写入 `buddy_session_summaries`，保存 summary id、session id、lineage root、source run、revision 和原始 source refs。
- session search 结果已展开 `summary_refs`，并把 `buddy_session_summary` 合并进同一 `source_refs` 事实源；`context_assembly_ref` 也能通过 per-session summary id 重建摘要文本。
- session search 的 hybrid retrieval report 已从 `retrieval_queries` / `retrieval_results` 审计表展开 `ranking_reports`，包含 query、filter、embedding model、score formula、ranked results、source ref、lexical/vector/final score；Evidence 页会显示最高排序来源和 query id。
- 已新增官方 `hybrid_recall_context_loader` Tool，把 Buddy 历史消息和结构化 DB 记忆召回合并为同一个 `context_package` 与 `hybrid_recall_report`；报告包含 `message_ids`、`memory_ids`、source refs、retrieval modes、budget 和 warnings。
- Eval runner 已支持 case 级 `metadata.fixture_buddy_sessions`，能在运行 eval case 前安装 Buddy session/message fixture，并投影到 retrieval/FTS，供 session + memory 混合召回形成可重复输入。
- 已新增官方 `buddy_hybrid_recall_eval` 模板和 `buddy_hybrid_recall_eval_core` suite，用 `hybrid_recall` 自动 check 验证同一次召回同时命中历史消息与结构化记忆，并保留 source refs 和上下文预算。

解决方案：

1. 明确 session 数据模型：
   - `buddy_sessions`: session 基本信息、parent、source、started/ended。
   - `buddy_messages`: 原子消息。
   - `session_summaries`: 摘要版本、source refs、revision。
   - `context_assemblies`: 每次 prompt 拼装引用。
   - `run_message_links`: run 和 message/output 的关系。
2. 搜索层提供三类 API：
   - `search_messages`: 全文/向量搜原子消息。
   - `search_sessions`: 按 session title、时间、任务、lineage 搜。
   - `search_run_context`: 搜某次 run 使用过的上下文。
3. FTS + embedding 混合检索：
   - FTS 负责关键词精确召回。
   - embedding 负责语义召回。
   - trigram/LIKE 处理 CJK 和短词 fallback。
4. lineage 投影策略：
   - 默认把当前 session 分支视为一个逻辑上下文。
   - 搜索时可选择 include current lineage / exclude current lineage。
   - `buddy_session_recall` 默认排除当前会话谱系，避免自我重复。

验收标准：

- 给定一条回答，可以追溯到哪些 message、summary、run、memory 参与了上下文。
- 搜索能返回 message snippets、bookends、session lineage 和 run refs。
- UI 能从一级导航进入证据搜索，按 query 或 run id 检查原子消息与 context assembly 来源。
- 压缩后的会话仍能展开到被摘要覆盖的原始消息引用。

优先级：P1。

### 3.4 长期记忆与 Embedding 召回

Hermes 能力：

- `MEMORY.md` 和 `USER.md` 作为文件记忆注入系统 prompt。
- background review 判断是否写 memory。
- external memory providers 可在 turn 后同步和预取。
- session_search 负责历史 transcript 召回。

TooGraph 差距：

- 已有 Buddy Home 文件线和数据库记忆线，但写入、召回、去重、embedding、证据和评测还需要统一。
- 记忆复盘已能写低风险文件，但 DB 结构化记忆和向量召回还没形成完整闭环。

当前进展：

- 统一 retrieval/embedding 表已支持 `embedding_models`、`embedding_jobs`、`embedding_vectors` 和 hybrid audit。
- 已新增 `process_pending_embedding_jobs` 与官方 `embedding_job_processor` Tool；`hashing-*` / `local-hash` 模型可以显式处理 pending embedding jobs，生成 deterministic embedding 并完成 job。
- embedding job processor 已接入 Model Providers 的 OpenAI-compatible `/embeddings` 调用；非 hashing 的 embedding model 会按 `provider_key/model` 解析保存的 provider 配置、调用真实 provider、校验维度并写回 `embedding_vectors`。
- 已新增官方 `embedding_model_registry` Tool，用于通过可审计图运行注册、启用和列出 embedding models。
- 记忆写入和更新后会根据 enabled embedding models 自动生成 dirty queue；内容更新会把旧 content hash 的 pending/running job 标记为 superseded，并为新内容排队。
- 已新增官方 `embedding_maintenance` 模板，把 `embedding_job_processor` 包装为可审计图运行，输出处理明细和完成数量。
- 已新增只读记忆证据搜索 API：`/api/buddy/search/memories`。它直接读取 `memory_entries`、source refs、latest revision、embedding model registry 和 hybrid recall audit，供 UI 和后续 Agent 诊断使用。
- `/evidence` 证据搜索页已加入长期记忆面板，支持关键词检索、embedding model 选择、来源 refs、latest revision、metadata 和 retrieval audit 展开；历史、记忆和 run context 现在可以在同一页面交叉核验。
- Scheduler 页面已把官方 `embedding_maintenance` 维护任务作为一等引导展示，用户可以直接启用或立即运行该任务，让 embedding dirty queue 通过标准 graph run 被处理。
- `/evidence` 证据搜索页已提供手动处理 Embedding 队列入口：页面读取官方 `embedding_maintenance` 模板，把当前选择的 embedding model 和 job limit 写入 input state，再通过 `runGraph` 启动可审计图运行，并提供运行详情链接。
- memory search 的 hybrid retrieval report 已复用 `retrieval_queries` / `retrieval_results` 展开 ranking report，Evidence 页会显示 query id、结果数、最高排序来源和最终分数。
- 已新增 `embedding_maintenance_core` 官方 eval suite，覆盖空队列维护时的处理状态、计数和 job 审计输出合同。
- 已新增官方 `memory_search_context_loader` Tool，把 DB `memory_entries` 搜索结果转换成标准 `context_package` 和 `memory_search_report`，报告包含 memory ids、source refs、retrieval modes、ranking reports 和上下文预算；context package 可通过 `memory_entry` source refs 从数据库重新展开。
- Eval runner 已支持 case 级 `fixture_memory_entries`，能在运行 eval case 前安装结构化记忆 fixture，并自动投影到 retrieval/FTS，供召回模板形成可重复测试输入。
- 已新增官方 `buddy_memory_recall_eval` 模板和 `buddy_memory_recall_eval_core` suite，通过确定性 Tool 运行结构化记忆召回，并用新增 `memory_retrieval` check 验证 required memory ids、source refs、关键文本和上下文预算。
- 已新增 `hybrid_recall_context_loader`、`buddy_hybrid_recall_eval_core` 和 `hybrid_recall` 自动 check，验证 DB memory 与 Buddy session history 可以在同一次 recall 中合并为可审计 context package。
- `memory_entry.create` 已增加同 scope/layer/type 下的规范化内容去重：重复写入不会创建第二条 `memory_entries` 事实，而是返回已有 memory，合并新的 source refs，写入 `duplicate_skipped` 事件和 `dedupe_merge_sources` revision，并在返回值中给出 `dedupe.reason=duplicate_canonical_content`。
- `memory_search_context_loader` 已透传 `reranker_model_ref`，`memory_retrieval` 自动 check 已能验证 reranker model、rerank status、首位 memory id 和 ranked memory id 前缀；官方 `buddy_memory_recall_eval_core` 已新增 rerank case，用结构化 ranking report 证明最相关记忆被重排到首位。
- 记忆写入去重已从精确规范化 hash 扩展到保守近似匹配：同一 scope/layer/type 下，如果新旧内容达到近似重复阈值，会跳过新建、合并 source refs，并在返回值和 `duplicate_skipped` event 中记录 `dedupe.reason=near_duplicate_content` 与 `similarity_score`。
- 后续可继续把近似去重接入 embedding 相似度或人工复核候选，以处理更弱的语义改写。

解决方案：

1. 双线记忆保持：
   - 文件线：`SOUL.md`、`USER.md`、`MEMORY.md` 提供稳定上下文注入。
   - 数据库线：`memory_entries`、message chunks、run/output chunks 提供召回和 embedding。
2. 每条 `memory_entry` 必须包含：
   - `kind`: `user_preference|project_fact|buddy_behavior|workflow_lesson|stable_context`
   - `content`
   - `source_refs`: message/run/revision。
   - `confidence`
   - `stability`
   - `created_by_run_id`
   - `last_verified_at`
   - `supersedes`
3. embedding pipeline：
   - 写入 memory/message/run summary 时生成 chunk。
   - 本地 hash embedding 保留为 deterministic fallback。
   - Model Providers 的 OpenAI-compatible provider 作为真实 embedding 执行路径。
   - 增加 embedding model 的注册、启用、维度配置和可见维护入口。
   - 支持 rebuild、incremental update、dirty queue。
4. Hybrid recall：
   - query planning 生成关键词 query 和 vector query。
   - FTS + trigram + vector 多路召回。
   - lineage filter、source filter、time decay。
   - rerank 和去重。
   - 输出 context package 和 audit report。
5. 记忆复盘输出写入矩阵：
   - 身份变化 -> `SOUL.md` candidate。
   - 用户稳定信息 -> `USER.md`。
   - 长期经验 -> `MEMORY.md`。
   - 可检索事实 -> `memory_entries`。
   - 高风险或不确定内容 -> `improvement_candidates`。

验收标准：

- 召回结果有 score、source ref、authority、reason、omitted reason。
- 同一事实不会在 `MEMORY.md` 和 DB 中无限重复。
- 用户纠正过的信息能被下一轮召回并进入上下文。
- 记忆写回有 revision、diff、证据和 skipped reason。

优先级：P1。

### 3.5 Background Review

Hermes 能力：

- 每轮后 fork 后台 review。
- fork 继承主运行时 provider/model/credentials/cache。
- 工具白名单限制为 memory 和 skill。
- 主对话和 prompt cache 不被后台 review 污染。

TooGraph 差距：

- `buddy_autonomous_review` 已存在，但触发、隔离、预算、可观测性、失败处理和写回质量还需要增强。
- 复盘输出和后续改进执行之间仍有断点。

当前进展：

- 已新增后端 `buddy_background_review_runs` 记录表，用统一数据库保存 `source_run_id`、`review_run_id`、`template_id`、触发原因、状态、错误和时间线。
- 已新增 Buddy API：`POST /api/buddy/background-reviews` 只接受已完成的 source run，按当前 `memory_review_template_binding` 在后端构建并启动 `buddy_autonomous_review`；`GET /api/buddy/background-reviews` 可按 `source_run_id` 查询复盘记录。
- 前端 Buddy 可见回复完成后不再自行拼装复盘图和调用 `/api/graphs/run`，而是请求后端复盘队列；后端把 `buddy_background_review_id`、`buddy_parent_run_id`、`buddy_review_trigger_reason` 和 `buddy_template_id` 写入 review run metadata。
- RunDetail 已能按 source run 查询后台复盘记录，展示复盘状态、触发原因、模板、模型、错误信息、review run 链接，并提供对已完成 source run 的手动重跑入口。
- 后台复盘列表会从 review run 的 state 中聚合写回摘要，把 applied commands、skipped commands、revision ids、structured memory ids 和 `autonomous_review.evidence` 关联到复盘记录；RunDetail 后台复盘面板已能直接展开这些审计事实。
- RunDetail 后台复盘面板已能区分可直接恢复的 Buddy revision 和仅可审计的 structured memory revision；对 `home_file`、`buddy_identity`、session/template/capability usage 等现有 Buddy revision 提供确认后恢复入口，恢复仍走 `revision.restore` command 并写入新的 revision。
- 后台复盘列表会从 review run 的 `improvement_candidates` state 中聚合候选摘要，包含 candidate id、kind、source run、risk level、expected benefit、proposed change summary、approval requirement 和 evidence refs；RunDetail 后台复盘面板已能直接展示候选数量、风险分布和候选详情。
- 后续仍需把复盘产物详情、improvement candidate 的验证/应用流和 curator 周期整理接入同一能力链路。

解决方案：

1. 建立后台运行队列：
   - 可见 Buddy run 完成后 enqueue review run。
   - review run 记录 `source_run_id`、trigger reason、template id、budget。
2. review runtime contract：
   - 读取 source run snapshot。
   - 读取 Buddy Home 文件。
   - 召回相关 messages/memories。
   - 输出 review report、write plans、improvement candidates。
3. 权限隔离：
   - review 模板默认只允许 memory read/write、Buddy Home writer、structured memory writer。
   - Action/template/graph/file 权限变更只输出候选，不自动应用。
4. 失败处理：
   - review 失败不影响主回复。
   - 失败记录进入 background run list。
   - 可手动重跑。
5. UI：
   - Buddy 消息旁显示“复盘状态”。
   - RunDetail 展示复盘 run 链接、写入 revision 和 skipped commands。

验收标准：

- 主回复完成后，后台复盘可独立查询。
- 复盘写入的每个文件/DB memory 都有 source refs。
- review 失败时主对话不回滚，后台列表能看到失败原因。

优先级：P1。

### 3.6 自我改进与 Curator

Hermes 能力：

- background review 会更新 skills。
- curator 周期性整理 skill library，归并、归档、评分，并产出报告。
- curator 有保护边界：bundled/hub/pinned skills 不能被随意删除。

TooGraph 差距：

- `buddy_autonomous_review` 能产出并展示 improvement candidates，但还不能自动变成 Action、Tool、Subgraph、模板或文档 revision。
- 缺少周期性的“能力库整理者”。

当前进展：

- 已新增官方 `buddy_improvement_review_workflow` 模板，作为 improvement candidate 的图优先验证入口。
- 该模板接收 `improvement_candidate` 和 `source_run_id`，规范化目标引用，按需只读读取目标 Action 包或图模板包，生成 `candidate_validation_plan`、`proposed_diff`、`test_plan` 和 `approval_request`。
- 对包含完整图模板 JSON 的候选，模板会调用 `toograph_graph_template_validator` 产出 `validation_report`；模板本身只验证和请求审批，同时可在 `approval_request.apply_command` 中声明后续可由受控 Buddy command 应用的单步命令。
- 官方模板测试已覆盖该工作流的状态合同、Action reader / template reader / validator 绑定、条件边、输出节点、无 breakpoint metadata 和运行时兼容性。
- RunDetail 后台复盘面板已为每个 improvement candidate 提供“开始验证”入口：前端从官方模板创建标准 graph run，写入候选 JSON 与 source run id，并跳转到新验证 run 详情；不新增隐藏后端应用路径。
- 已建立 `improvement_candidates` 持久化表；后台复盘完成后会把 run state 中的候选投影为可查询对象，并通过 `GET /api/buddy/improvement-candidates` 按 source run、review、review run 或状态查询。
- 后台复盘 summary 继续从原始 run state 还原候选，同时叠加数据库中的候选状态、验证 run 和应用 revision 字段；RunDetail 候选卡会显示当前状态。
- 已支持候选验证 run 关联和状态同步：启动验证后候选进入 `validating`，验证 run 完成后从 `candidate_status_recommendation.recommended_status` 同步为 `validated`、`needs_changes`、`rejected` 或 `waiting_for_approval`，失败或取消则同步为 `failed`。
- 候选表会持久化验证产物包 `validation_result` 和 `status_reason`，包含验证计划、proposed diff、validator report、test plan、approval request、状态建议和最终摘要，为 approval / apply 流提供可审计输入。
- 已新增候选 approve / reject 决策 API 和 RunDetail 操作入口；人工决策会写入 `decision`、`decided_at`、`status_reason`，只推进候选状态。
- 已新增候选 apply API 和 RunDetail 操作入口；状态为 `approved` 且带 `has_apply_command` 的候选可读取验证产物中的 `approval_request.apply_command`，通过 allowlist Buddy command 执行改动，写入可恢复 revision，并把候选标记为 `applied`。
- 已新增独立改进候选队列页面 `/improvements`，集中展示所有候选，支持状态筛选、搜索、来源/验证 run 跳转、验证、状态同步、批准、拒绝和可应用候选的 apply。
- 已新增官方 `capability_curator_context_loader` Tool，会只读组装 Action/Tool/template 能力目录、`capability_usage_events`、官方 eval 覆盖和 `improvement_candidates` 队列快照。
- 官方 `buddy_capability_curator` 模板已接入该 loader：用户只输入整理范围，图运行时自动生成 `capability_catalog_snapshot`、`capability_usage_snapshot`、`eval_snapshot`、`existing_candidates_snapshot` 和 `curator_context_report`，再输出 `capability_health_report`、`curator_report`、`improvement_candidates` 和 `scheduler_recommendation`。模板只产出报告和候选，不应用改动。
- 已新增独立能力整理报告页 `/curator-reports`：页面通过 `template_id=buddy_capability_curator` 查询标准 run records，直接从 run detail 的 `state_snapshot` 和 output previews 还原 `curator_report`、`capability_health_report`、`improvement_candidates` 和 `scheduler_recommendation`，并保留跳转源运行详情和调度页入口。
- 后续仍需补齐更广的 Action / Tool / template writer 覆盖，以及把 curator 产出的候选更系统地接入 writer/eval 覆盖扩展。

解决方案：

1. 定义 `improvement_candidate` schema：
   - `candidate_id`
   - `kind`: `memory|action_revision|tool_revision|template_revision|subgraph_proposal|docs_update|eval_case|policy_suggestion`
   - `source_run_id`
   - `evidence_refs`
   - `risk_level`
   - `expected_benefit`
   - `proposed_change_summary`
   - `approval_required`
2. 新增官方模板：`buddy_improvement_review_workflow`。
   - 输入候选。
   - 读取目标包或模板。
   - 生成 diff。
   - 运行 validator/test。
   - 输出 approval request。
3. 新增官方模板：`buddy_capability_curator`。
   - 已完成官方模板和 `capability_curator_context_loader`，整理范围作为唯一手动输入，能力目录、使用记录、eval 和候选快照由 Tool 组装。
   - 后续通过 scheduler 定期触发该图模板。
   - 识别低质量、重复、失败率高、过期说明。
   - 输出整理候选和报告。
4. revision 策略：
   - Action/Tool/template 改动走现有 writer/command/revision。
   - 官方包需要更高审批，用户包可低风险自动建议。
5. eval 闭环：
   - 每个能力改动必须附带至少一个 eval case 或测试说明。
   - curator 按最近使用成功率、失败率、用户纠正次数评分。

验收标准：

- 成功 run 可以生成可审查的能力改进候选。
- 候选能进入 diff + test + approval 流程。
- 能力库周期报告列出最常用、失败最多、重复、待归档能力。
- 不会静默修改官方模板或高风险能力。

优先级：P2。

### 3.7 Capability Selector 与能力路由

Hermes 能力：

- 模型直接看到工具 schema。
- tool registry 提供可用性检查、schema、dispatch、错误包装。
- 工具调用过程中有参数修复、去重、并发和 fallback。

TooGraph 差距：

- `toograph_capability_selector` 已能发现 Action/Subgraph/Tool，但评分、拒绝理由、失败学习、预算、权限和动态上下文不够强。
- 选择结果缺少长期统计反馈。

当前进展：

- `toograph_capability_selector` 已发现 Action、Subgraph、Tool，并按 subgraph > action > tool 的优先级做高层能力替换。
- capability catalog 已暴露通用 selection metadata：`granularity`、`covers`、`produces`、`taskTags` 和 `permissions`。
- selector after_llm 已输出 `selection_reason` 和 `capability_selection_trace`，包含原始请求、最终选择、被拒绝候选、fallback 候选、评分拆解和权限摘要。
- 官方 `buddy_autonomous_loop` 已把 `capability_selection_reason`、`capability_selection_trace` 写入 schema-backed state，后续 RunDetail/Buddy 胶囊可直接读取。
- selector catalog 已读取 `capability_usage_stats`，把使用次数、成功率、失败次数、近期失败数和最近运行摘要注入候选项；trace 的 `score_breakdown` 与 `usage_summary` 已能解释所选能力的历史反馈。
- selector catalog 已暴露标准 `permissionTier`、`permissionProfile` 和 `evalStatus`；trace 的 `permission_summary` 与 `score_breakdown` 已能体现权限层级和 eval case 覆盖。
- selector 已支持显式 `capability_permission_policy.allowed_permission_tiers` / `blocked_permission_tiers` / `approval_required_permission_tiers`；before_llm 目录会过滤不符合权限策略的能力，after_llm 会拒绝策略外选择并记录 `permission_tier_not_allowed`，并在 `permission_summary` 中标记由策略触发的审批原因。
- Buddy 主循环会按 ask-first / full-access 模式把 capability permission policy 写入图 metadata；LangGraph 子图和 Action runtime context 会继承该策略，使 selector 能在嵌套能力选择中使用同一权限边界。
- RunDetail 的 Agent Diagnostic 已能从 `capability_selection_trace` 展示 selected/requested/reason、权限、使用反馈、拒绝候选和 fallback 候选；Buddy 胶囊 evidence labels 也会显示同一 selector trace。
- `buddy_autonomous_review` 已新增 `capability_usage_update_plan` 分支，通过图内 `buddy_home_writer` 显式应用 `capability_usage_stats.update`，从源 run 的 `capability_result` / `capability_review` / run record 中把实际能力成功或失败写入统计。
- 官方 `buddy_autonomous_loop` 已把 `agent_loop_control` 作为 `toograph_capability_selector` 的 managed Action input 注入；selector trace 会写入 `budget_after_call`，RunDetail Agent Diagnostic 与 Buddy 胶囊 evidence labels 可显示能力调用预算、剩余额度和耗尽状态。
- 统一数据库已新增 `capability_usage_events` 运行时事实投影；保存 graph run 时会从 Action、Tool 和动态 Subgraph 调用记录生成能力使用事件，`capability_usage_stats` 读取时会合并这些事实，使 selector 的历史反馈不再只依赖后台复盘 LLM 提取。
- selector 已根据 runtime `capability_usage_stats` 评估近期失败：当 LLM 请求的能力连续近期失败，并且同覆盖范围内存在更健康的候选时，`toograph_capability_selector` 会改选 fallback，并在 `capability_selection_trace.rejected_candidates` 中以 `recent_failures_fallback_preferred` 记录原请求；RunDetail 和 Buddy 胶囊可直接展示该结构化拒绝原因。
- Eval runner 已支持 case 级 `metadata.fixture_capability_usage_entries`，可在运行官方 eval 前预置能力成功/失败统计；新增 `capability_selection` 自动 check，可确定性验证 requested/selected/rejected/fallback 候选与 `recent_failures_fallback_preferred` 等拒绝原因。
- 官方 `buddy_autonomous_loop_core` 已新增 selector fallback eval case，用预置的 `advanced_web_research_loop` 近期失败和 `web_search` 成功记录，验证 Buddy 主循环在能力选择 trace 中改选健康 fallback。
- 后续仍需把更多运行时失败恢复结果投影成结构化事件，并把能力失败后的自动 fallback 评估扩展到真实 provider/tool 失败驱动的完整 Buddy 图端到端测试。

解决方案：

1. Capability registry 标准化：
   - `kind`
   - `key`
   - `name`
   - `description`
   - `input_contract`
   - `output_contract`
   - `permissions`
   - `risk`
   - `latency_class`
   - `cost_class`
   - `success_rate`
   - `recent_failures`
   - `eval_status`
2. selector 输出增强：
   - `selected`
   - `needs_capability`
   - `selection_reason`
   - `rejected_candidates[]`
   - `score_breakdown`
   - `permission_summary`
   - `budget_after_call`
   - `fallback_candidates[]`
3. 失败反馈：
   - 每次能力失败写 `capability_usage_event`。
   - selector 读取最近失败，避免重复选同一失败能力。
4. 权限前置：
   - selector 只选择当前权限 tier 下可申请或可执行的能力。
   - 高风险能力输出 approval reason。
5. UI：
   - Buddy 胶囊展示“为什么选这个能力”。
   - RunDetail 展示候选排序和拒绝理由。

验收标准：

- 每次能力选择都有可解释 trace。
- selector 不会选择自己、压缩模板或不适合的内部模板。
- 能力失败后下一轮能选择 fallback 或停止。
- 能力 catalog 能按权限、类型、使用率和 eval 状态过滤。

优先级：P1。

### 3.8 Action / Tool / Subgraph 生态

Hermes 能力：

- 70+ tools、约 28 toolsets、插件扩展、可用性检查。
- terminal tools 支持多种后端。
- toolsets 可按平台、任务和权限启用。

TooGraph 差距：

- Action/Tool/Subgraph 协议已经有，但官方能力数量和覆盖面不足。
- Tool 节点方向刚起步，很多确定性操作仍未工具化。

解决方案：

1. 官方能力分层：
   - Core Tools：历史组装、上下文预算、文件读取、检索、schema validate。
   - Workspace Actions：读写文件、运行命令、创建 revision。
   - Web Actions：搜索、抓取、下载、引用生成。
   - Knowledge Tools：RAG 检索、chunk、embedding rebuild。
   - Graph Actions：读取模板、校验模板、写模板、预览 diff。
   - Buddy Actions：记忆写入、Buddy Home 写入、复盘上下文加载。
2. manifest 增强：
   - permissions
   - scopes
   - artifacts
   - expected failure modes
   - eval cases
   - examples
3. Tool registry 与 Action registry 一致化：
   - catalog API 输出统一 capability profile。
   - selector 不需要理解每种包内部格式。
4. 可用性检查：
   - 网络可用。
   - provider 配置可用。
   - 本地命令可用。
   - 文件权限可用。
5. 能力准入：
   - 官方能力必须有 manifest、README/ACTION.md、schema、至少一个测试或 eval。

验收标准：

- 能力库页面能按 Action/Tool/Subgraph 统一展示。
- 每个官方能力有输入输出合同、权限、失败模式和示例。
- selector 使用同一 capability profile。
- 新能力可以通过模板创建 workflow 生成并验证。

优先级：P1-P2。

### 3.9 Scheduler / Cron / 后台任务

Hermes 能力：

- Cron 是 first-class agent task。
- Jobs 支持 schedule、skills、scripts、平台投递、runtime override、context chaining。
- Gateway 有 tick 和后台维护。

TooGraph 差距：

- 后台复盘存在，但没有通用 scheduler。
- 周期任务、知识库重建、memory cleanup、eval、curator 都需要手动触发。

当前进展：

- 已新增统一数据库表 `scheduled_graph_jobs` 和 `scheduled_graph_job_runs`，记录模板、输入绑定、调度表达式、启用状态、最近 run、下次运行时间和每次触发历史。
- 已新增 `app.scheduler.store`，支持创建 `manual` / `interval` / `cron` 形态的 scheduled graph job；当前 interval 支持 `PT6H`、`30m`、`3600s` 这类表达式，并能查询 due jobs。
- 已新增 Scheduler API：`/api/scheduler/jobs`、`/api/scheduler/jobs/{job_id}/run`、`/api/scheduler/jobs/run-due`、`/api/scheduler/jobs/{job_id}/runs` 和启停接口。
- 已新增 scheduler runner，手动触发或 run-due 触发时会从 `template_id` 加载模板，应用 `input_bindings` 到 input state，创建标准 LangGraph run，写入 `graph_runs`，并把 job / job run metadata 写入 run snapshot。
- `RunSummary` / `RunDetail` 已显式返回 `template_id` 和 `template_version`，方便从调度历史、RunDetail 和后续 UI 直接追溯模板来源。
- 已新增 scheduler service，FastAPI lifespan 启动后会开启后台 tick；tick 查询 due jobs，并通过标准 scheduler runner 创建 graph run。可用 `TOOGRAPH_SCHEDULER_DISABLED=1` 禁用本地 tick，`TOOGRAPH_SCHEDULER_POLL_INTERVAL_SECONDS` 调整轮询间隔。
- 已新增官方 scheduled job 种子：`official_buddy_capability_curator` 每周建议运行 `buddy_capability_curator`，`official_embedding_maintenance` 每小时建议运行 `embedding_maintenance`。两者默认禁用，启动时只保证可发现，不会自动消耗模型或执行后台任务；用户启用后才会进入 scheduler tick。
- 已新增 `/scheduler` 调度任务管理页面：默认加载包含禁用官方种子的任务列表，展示任务概览、输入绑定、运行覆盖、元数据、最近 job run，并提供启停、立即运行和跳转 graph run 详情入口。
- `/scheduler` 已提供用户自定义任务创建入口：用户可选择 active 图模板、填写任务名、调度类型、调度表达式、时区和 input bindings JSON；创建结果仍写入 `scheduled_graph_jobs`，每次触发仍生成标准 graph run。
- 已新增一等 `retry_policy`：调度任务可配置最大尝试次数、重试延迟和 backoff；定时运行失败后会在 `metadata.scheduler_retry_pending` 中记录下一次 retry，下一次 tick 会生成 `trigger_reason=retry` 的标准 graph run，并在 job run metadata 中保留 attempt、parent run 和 retry decision。
- Scheduler 页面已新增官方维护任务启用引导，把 `official_embedding_maintenance` 和 `official_buddy_capability_curator` 从普通任务列表中提升为后台能力入口；禁用时显示启用入口，启用后显示立即运行入口，操作仍走现有 Scheduler API 并生成标准 graph run。
- 已新增第一版 `delivery_target` 投递审计：终态 job run 会把 `local_audit` / `job_run_metadata` 投递结果写入 `scheduled_graph_job_runs.metadata.delivery_result`，结果包含 job、job run、graph run 引用、触发原因、终态状态和脱敏后的 target；暂不支持的非外部 target 会记录为 `skipped` 和 `unsupported_delivery_target`，不产生隐藏平台副作用。
- 已新增外部投递权限边界：`webhook` / `http_webhook` target 会被识别为 `external_delivery`，终态 job run 记录 `approval_required=true`、`required_permissions=["external_delivery"]`、统一 `permission_profile` 和脱敏 target；当前仍跳过真实投递并标记 `external_delivery_requires_approval`，避免 Scheduler 在未审批时进行外部发送。
- Scheduler 创建表单已暴露 `delivery_target` JSON 输入，用户创建任务时可指定本地审计投递目标。
- 已新增 `/curator-reports` 能力整理报告页，供 Scheduler 触发的 `official_buddy_capability_curator` run 通过模板索引集中查看报告、候选和调度建议。
- Eval runner 已支持 case 级 `metadata.fixture_scheduled_graph_jobs` 和 `metadata.fixture_scheduled_graph_job_runs`，可在运行官方 eval 前安装 scheduled job / job run 事实；新增 `scheduler_run_context_loader` Tool 与 `scheduler_run` 自动 check，用确定性方式验证 retry decision、pending retry、delivery result、source refs 和脱敏目标。
- 官方 `scheduler_retry_delivery_eval_core` 已覆盖失败 schedule run 触发 retry、写入 `scheduler_retry_pending`、生成本地审计投递结果并隐藏敏感 token 的回归场景。
- Scheduler 生成的图运行 snapshot 现在会默认写入 `graph_permission_mode=ask_first` 和 `capability_permission_policy.approval_required_permission_tiers=["risky"]`；已有模板 permission policy 会被合并而不是放宽，因此定时触发、retry 触发和手动触发的 scheduled graph run 都不会以无审批边界运行高风险 Action。
- 后续仍需补齐经审批后的真实外部投递 adapter。

解决方案：

1. 新增 scheduler store：
   - `scheduled_graph_jobs`
   - `scheduled_graph_job_runs`
   - `next_run_at`
   - `timezone`
   - `enabled`
   - `template_id`
   - `input_bindings`
   - `runtime_overrides`
   - `delivery_target`
   - `retry_policy`
2. 新增 scheduler runtime：
   - 应用启动后后台 tick。
   - 到点创建 graph run。
   - run 完成后写 job run record。
   - 失败后按 retry policy 创建下一次可审计 graph run。
3. job 类型：
   - Buddy memory review cleanup。
   - capability curator。
   - knowledge base rebuild。
   - eval suite run。
   - user-defined graph automation。
4. UI：
   - Scheduler 页面。
   - Job run history。
   - 暂停/启用/立即运行。
5. 权限：
   - 创建自动化需要明确 approval。
   - 高风险 Action 在定时任务中仍要权限策略。

验收标准：

- 可以创建一个每日运行的复盘或知识库重建任务。
- 每次定时运行和 retry 都有 run record、失败原因、attempt metadata 和下次运行时间。
- 关闭 job 不删除历史。

优先级：P2。

### 3.10 Delegation / Subagents / Kanban

Hermes 能力：

- `delegate_task` 支持子任务、并发限制和结果返回。
- Kanban/board 用于管理长期或多子任务计划。
- 子 Agent 继承必要 runtime。

TooGraph 差距：

- Subgraph 和 batch worker 有基础，但缺少通用 worker protocol、并发预算、结果合并和 UI。
- 目前委派更多是模板作者手工组织。

当前进展：

- 已新增 `delegation_worker_result_packager` Tool，作为 worker 协议边界的确定性低层 primitive：输入 `worker_task_packet`、worker outputs、状态、摘要和预算使用量，输出标准 `worker_result_package`。
- `worker_task_packet` 初版字段已覆盖 `task_id`、`goal`、`context_package_refs`、`allowed_capabilities`、`budget` 和 `expected_output_schema`；`worker_result_package` 初版字段已覆盖 `task_id`、`status`、`summary`、`outputs`、`artifacts`、`errors`、`followups`、`source_refs`、`allowed_capabilities` 和 `budget`。
- 已新增官方隐藏模板 `delegation_worker_eval` 和 `delegation_worker_eval_core` eval suite，用 `delegation_worker` 自动 check 验证 worker result 的 task id、状态、输出键、source refs 和关键文本。
- 后续仍需把该协议接入真实 Subgraph worker 执行、并发预算、worker run links、结果 merge/review 节点和 RunDetail/Buddy 胶囊展示。

解决方案：

1. 定义 `worker_task_packet`：
   - `task_id`
   - `goal`
   - `context_package_refs`
   - `allowed_capabilities`
   - `budget`
   - `expected_output_schema`
2. 定义 `worker_result_package`：
   - `task_id`
   - `status`
   - `summary`
   - `outputs`
   - `artifacts`
   - `errors`
   - `followups`
3. 新增 Subgraph worker 模板：
   - 输入 task packet。
   - 执行受限能力。
   - 输出 result package。
4. 新增 merge/review 节点：
   - 合并多个 worker result。
   - 去重冲突。
   - 输出最终回答或下一轮任务。
5. UI：
   - RunDetail 以 worker group 展示并发任务。
   - Buddy 胶囊显示子任务数量、状态、失败。

验收标准：

- 一个主图能并发运行多个子任务并合并结果。
- 每个子任务有独立 run id 和预算。
- 超预算、失败、部分成功都有可读汇总。

优先级：P2-P3。

### 3.11 Provider Runtime 与模型能力矩阵

Hermes 能力：

- 统一 provider resolver。
- 支持 18+ providers、OAuth、credential pools、alias、fallback。
- provider/model 能力影响 vision、reasoning、tool calling、streaming、timeouts、prompt cache。

TooGraph 差距：

- Model Providers 页面已有基础，但 provider 能力矩阵、fallback、结构化输出 repair、embedding provider、reranker provider 还不完整。

当前进展：

- 已新增共享 `provider_fallback` resolver primitive，定义标准 `provider_fallback_trace`，记录 requested model、selected fallback、failed candidates、fallback candidates、rejected candidates、required capabilities、required permissions、attempts 和 decision。
- 已新增官方 `provider_fallback_resolver` Tool，作为图内确定性低层 primitive：输入 provider failure event、候选模型、能力要求和权限范围，输出 `selected_model_ref` 与可审计 fallback trace。
- 已新增官方隐藏模板 `provider_fallback_eval` 和 `provider_fallback_eval_core` suite，用 `provider_fallback` 自动 check 验证 provider 失败后能选择兼容 fallback，并拒绝会扩大权限范围的候选。
- RunDetail Agent Diagnostic 已能从 `provider_fallback_trace` 重组 provider fallback 诊断，展示 requested model、selected model、decision、失败模型、被拒绝模型、fallback 候选、能力/权限要求和 warnings。
- `chat_with_model_ref_with_meta` 已接入真实 LLM 调用链：主 provider/model 调用失败后，会从保存的 Model Providers 配置构造候选，按 `chat`、`structured_output`、`vision` 等能力和 `text_generation` 权限范围调用 `provider_fallback` resolver，选择不扩大权限的兼容 fallback，并把 `provider_fallback_trace`、`requested_model_ref` 和 fallback warning 写入模型调用 meta。
- `embed_text_with_model_ref` 已接入同一 provider fallback 机制：embedding provider 失败后按 `embedding` capability 和 `embedding` permission 选择兼容 fallback，并把 `provider_fallback_trace` 写入 embedding meta；embedding job processor 通过该入口会继承相同行为。
- Provider fallback runtime 已支持多候选重试：第一个兼容 fallback 运行时失败后，会继续尝试后续兼容候选；`provider_fallback_trace.attempts` 和 `failed_candidates` 会记录实际失败的 fallback provider，最终 `selected` 指向真正成功的候选。
- 结构化输出 repair 已接入可审计 provider fallback：主结构化输出调用和 repair 调用都会把实际 provider/model、requested model ref、`provider_fallback_used` 和 `provider_fallback_trace` 写入节点 runtime config；RunDetail Agent Diagnostic 在没有顶层 state trace 时，会从 node execution runtime config 读取这些 trace，展示 repair/main LLM provider fallback 证据。
- `rerank_documents_with_model_ref` 已接入 Model Providers 的 OpenAI-compatible `/rerank` 调用和同一 provider fallback 机制：reranker provider 失败后按 `rerank` capability 和 `rerank` permission 选择兼容 fallback，并把 `provider_fallback_trace` 写入 rerank meta。
- `hybrid_search` 已支持可选 `reranker_model_ref`：FTS + embedding 合并后可调用 reranker 对候选重排；`retrieval_queries` / `retrieval_results` 会记录 `reranker_model_ref`、`ranking_metadata`、`base_score`、`rerank_score` 和最终排序，Evidence/RunDetail 可继续从同一 retrieval ranking report 事实源展开。
- Buddy session search、memory search 和 `hybrid_recall_context_loader` 已可透传 `reranker_model_ref`，因此 Buddy 历史召回、结构化记忆召回和混合上下文工具能复用同一 rerank provider 运行时与审计报告。
- Model Providers 页面已加入模型级能力矩阵：每个启用模型可显式标注 `chat`、`structured_output`、`tool_calling`、`vision`、`embedding`、`rerank`、`streaming`、`reasoning`，并保存对应 `permissions`；settings API、model catalog 和前端 draft/save payload 会完整保留这些字段，fallback resolver 使用的能力与权限不再只能靠手写 settings。
- 3.11 的 provider runtime 基础闭环已经覆盖 LLM、structured output repair、embedding、rerank、fallback trace 和 UI 能力矩阵；后续扩展应集中在更细的 provider profile 字段，如 timeout、prompt cache、credential pool 和 per-node override。

解决方案：

1. 扩展 provider profile：
   - `chat`
   - `structured_output`
   - `tool_calling`
   - `vision`
   - `embedding`
   - `rerank`
   - `streaming`
   - `reasoning`
   - `context_window`
   - `timeouts`
   - `fallbacks`
2. Runtime resolver：
   - 所有 LLM 节点、Action planning、review、scheduler、curator 都走同一路径。
   - 支持 per-template / per-node override。
   - 已完成第一步：通用 `chat_with_model_ref_with_meta` 会在 provider failure 后通过统一 resolver 选择真实 fallback provider，所有复用该入口的 LLM 节点、Action planning、review 和 evaluator judge 都会继承该行为。
3. Fallback policy：
   - provider failed -> model fallback。
   - structured output failed -> repair retry；主调用和 repair 调用都继承 provider fallback，并把 fallback trace 写入 runtime config。
   - embedding provider failed -> compatible embedding model fallback；如果没有兼容 fallback，再由 embedding job 记录失败，后续可扩展为 queue retry 或 local-hash fallback。
   - reranker provider failed -> compatible rerank model fallback；如果没有兼容 fallback，召回路径保留原 hybrid 排序，并在 retrieval ranking report 中记录 rerank failure metadata。
   - fallback provider failed -> try next compatible fallback candidate，并把每次实际尝试写入 trace。
4. UI：
   - Model Providers 页面展示能力矩阵。
   - RunDetail 记录实际 provider/model、fallback、repair 次数。

验收标准：

- 每次模型调用知道实际 provider/model/API mode。
- 结构化输出失败有 repair trace。
- embedding/rerank 可配置并有 fallback。
- provider fallback 不会静默改变权限或能力范围。

优先级：P2。

### 3.12 上下文压缩与 Prompt Cache

Hermes 能力：

- context compressor 在阈值超过时压缩中间历史。
- prompt caching 保持稳定前缀。
- memory 文件 mid-session 写入不会立即改变当前系统 prompt snapshot。

TooGraph 差距：

- Buddy 压缩已图化，但预算报告、摘要版本、source refs、prompt snapshot 和缓存策略还不够成熟。

当前进展：

- RunDetail 上下文审计已能从统一 run detail 事实源中提取 `context_budget_report` 和 `compaction_report`，把触发原因、原始历史长度、保留上下文长度、摘要长度、省略数量、保护数量、provider prompt tokens、模型窗口和 prompt 压力展示在同一 Context Audit 面板中。
- 该投影直接读取 run snapshot、artifacts、state events、node executions、Action/Tool/Capability outputs 和 metadata 中已有的结构化 state，不复制完整历史文本，也不引入新的 Buddy 专用旁路。
- LLM 响应生成、Action 输入规划和 Subgraph 输入规划已经写入 `llm_prompt_snapshot` 运行时审计记录；记录只保存 system/user prompt 的 `sha256` hash、字符数、估算 token、输入 state keys、输出 keys、Action/Subgraph keys 和 context refs，不保存原始 prompt 文本。
- RunDetail Context Audit 已能从 `runtime_config.prompt_snapshots` 读取这些 `llm_prompt_snapshot`，展示阶段、hash、字符数、估算 token 和上下文引用数量；胶囊和运行详情可以基于同一 run 事实源解释“这次模型调用使用了哪些上下文引用”。
- 结构化输出 repair 调用也已写入同一 `llm_prompt_snapshot` 链路，覆盖主 LLM 响应 repair、Action 输入规划 repair 和 Subgraph 输入规划 repair；repair 快照同样只保存 hash-and-metadata，不保存 raw model output 或原始用户上下文。
- 上下文压缩预算报告已标准化输出 `source_refs`、`summary_source_refs`、`omitted_refs` 和 `protected_recent_history_refs`；官方 `buddy_context_compaction` 模板要求 `compaction_report` 和 `session_summary.update.payload.source_refs` 直接复用这些 refs，让摘要写回可追溯到被压缩的原子消息和已有摘要。
- RunDetail Context Audit 已能从 `compaction_report` 展示摘要来源、被省略来源、被保护最近原文的引用数量，并列出摘要来源 revision id；用户不用展开 raw JSON 就能确认一次压缩摘要覆盖了哪些来源版本。
- `llm_prompt_snapshot` 已补齐 hash-only 的 `prompt_cache_policy` 审计元数据：稳定前缀 hash/字符数、动态后缀 hash/字符数、cache key、是否可复用、失效因子和 provider cache-control 状态都会随运行记录保存；RunDetail Context Audit 可以直接显示这些字段。
- 当前策略明确标记为 `audit_only`，并在运行时 state、context refs、Action keys 或 Subgraph keys 被注入 system prompt 时将缓存判定为不可复用，避免把尚未启用的 provider 级缓存伪装成已生效能力。
- 仍需补齐真正 provider 级 prompt cache-control、per-node cache override，以及把动态 state 从稳定 system prefix 中拆出去的 prompt assembly 改造。

解决方案：

1. 压缩输出标准化：
   - `protected_recent_history`
   - `session_summary_candidate`
   - `summary_source_refs`
   - `omitted_refs`
   - `risk_notes`
   - `revision_id`
2. Prompt snapshot：
   - 每次关键模型调用保存 hash-and-metadata snapshot。
   - 保存 context assembly refs，而不是递归保存完整聊天全文。
   - 不把 system/user prompt 原文写入 run detail，必要时通过 context refs 回查来源。
3. 缓存策略：
   - 稳定 Buddy Home 文件在当前 run 中只读取一次。
   - 后台复盘写入影响下一轮，不修改已运行中的 prompt。
4. UI：
   - Context budget panel 展示原始长度、保留长度、摘要长度、裁剪原因。

验收标准：

- 压缩后可以追溯被摘要的消息。
- 复盘写入不会改变已经完成 run 的 prompt snapshot。
- 压缩反复触发时有 anti-thrashing 记录。

优先级：P1。

### 3.13 权限、安全与注入防护

Hermes 能力：

- memory/context 注入前有 threat pattern 扫描。
- background review 有工具白名单。
- protected/pinned/bundled skills 有防护。
- provider env vars 会从 subprocess 中隔离。

TooGraph 差距：

- Action 权限、approval 和 revision 方向存在，但 operation 级权限、context 注入扫描、定时任务权限、能力包防护还不完整。

当前进展：

- 已新增共享 `context_security_v1` scanner primitive，所有通过 `context_assembly` 创建或物化的上下文文本都会扫描 prompt injection、secret exfiltration、invisible unicode 和 hidden HTML 风险。
- 扫描结果会作为 `context_assembly_warnings` 持久化，warning metadata 记录 scanner 版本、severity、pattern id 和 source refs，不保存可疑 secret 原文。
- LLM prompt assembly 渲染 `context_package` 时会合并 package warning 与 assembly warning，并在上下文包边界展示 warning code，让外部知识、网页、记忆或 Buddy Home 内容进入模型前被明确标记。
- context assembly 已接入 secret 脱敏：密钥样式值、API key assignment、私钥块和常见 token 会在写入 rendered blob、从 source refs 重建以及注入 prompt 前替换为 `[REDACTED_SECRET]`，并记录 `context_secret_redacted` warning、命中模式和脱敏数量。
- context assembly 已支持显式阻断策略：当 `metadata.context_security_policy.block_high_risk=true` 时，命中高风险 `context_prompt_injection` 或 `context_secret_exfiltration` 的 rendered context 会在写入 blob 和注入 prompt 前替换为 `[BLOCKED_CONTEXT_ITEM]`，并记录 `context_item_blocked`、被阻断 warning codes、policy 和 source refs。
- 官方 `web_context_loader` 和 `knowledge_context_loader` 已默认启用 `context_security_policy.block_high_risk=true`，外部网页证据和知识库 chunk 在进入 `context_package` 时会自动执行高风险阻断。
- capability artifact 的 prompt 读取路径 `read_capability_artifact_text_for_prompt` 已接入同一 secret 脱敏 primitive；UI/文件预览仍可读原始 artifact，模型 prompt 读取会返回脱敏文本和 `context_secret_redacted` warning。
- 模型请求日志写入路径已复用 secret 脱敏 primitive，`request_raw`、`response_raw` 和顶层 `error` 写入 JSONL 前会替换密钥样式值，同时保留现有 inline media summary。
- 权限审批已支持 `local_workspace_executor` 的 operation 级收窄：`read` / `list` / `search` 只按 `file_read` 评估，`edit` / `write` 只申请 `file_write`，`execute` 才申请 `subprocess`；运行时 pending approval 保存本次 Action inputs 和收窄后的 permissions。
- 权限审批审计已进入 graph run 事实源和 `/api/runs/{run_id}`：已批准或拒绝的 `permission_approvals` 会随 run detail 持久化并返回给 UI，审计副本写入数据库前会递归替换密钥样式值；pending approval 的 `input_preview` 也会脱敏，同时保留运行时恢复执行所需的原始 inputs。
- 已新增共享 capability permission profile primitive，标准化 `network`、`file_read`、`file_write`、`execute`、`graph_write`、`memory_write`、`cost`、`external_delivery` 等权限操作与 `none|guarded|external|risky` 层级；selector catalog 与运行时审批共用该分类。
- Action 审批现在会直接消费 `capability_permission_policy.approval_required_permission_tiers`；即使没有额外 mode flag，只要策略要求 risky tier 审批，高风险 operation 仍会暂停并写入 pending approval。
- Scheduler 运行图默认继承强制 risky 审批边界：每次 scheduled graph run 都会在 metadata 中记录 `graph_permission_mode=ask_first`、合并后的 `capability_permission_policy` 和 `scheduled_graph_permission_policy_source`，避免后台定时任务绕过人工设置的权限边界。
- Action subprocess 环境已改为显式 allowlist：默认只继承运行进程必需的系统路径、locale、临时目录和 Buddy Home 路径，再注入 TooGraph Action runtime 变量；`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、自定义 provider token 等不会隐式透传给 Action 脚本。
- Graph run DB store 写入时会对 run metadata/detail、state values、activity events、node executions、output previews、capability invocations 和 capability usage events 做统一 secret 脱敏，避免运行时错误、Action 输出或审计摘要把 provider token 明文落库。
- RunDetail Agent Diagnostic 已能从 pending approval metadata 和已完成 `permission_approvals` 审计记录重组权限审批摘要，展示目标能力、审批状态、权限、binding source 和审批/拒绝原因，用户不需要读取 raw JSON 才能判断一次能力暂停的原因。
- RunDetail 权限审批摘要已进入操作闭环：当审批仍处于 pending 状态时，诊断面板会提供“批准并继续”和“拒绝并继续”，通过现有 `/api/runs/{run_id}/resume` 协议提交 `permission_approval.decision`，由运行时消费 pending approval 并写入审计记录。
- 当前实现已覆盖上下文扫描、审计、边界标记、上下文 secret 脱敏、可配置高风险上下文阻断、web/knowledge 官方外部上下文入口默认阻断、artifact prompt 读取脱敏、模型请求日志 secret 脱敏、本地工作区 Action 的首个 operation-level permission、权限审批审计持久化、通用 capability permission profile 基础、scheduler 高风险 Action 审批边界、scheduler 外部投递权限边界、Action subprocess provider secret 隔离、graph run 运行时日志/投影脱敏，以及 RunDetail 权限审批摘要和操作闭环；后续仍需推进经审批后的真实外部投递 adapter、能力包保护和更完整的 approval review surface。

解决方案：

1. Context scanner：
   - 扫描 Buddy Home、knowledge docs、web pages、memory entries。
   - 标记 prompt injection、secret exfiltration、invisible unicode、hidden HTML。
   - 输出 warning 或 blocked context item。
2. Capability permission profile：
   - `network`
   - `file_read`
   - `file_write`
   - `execute`
   - `graph_write`
   - `memory_write`
   - `cost`
   - `external_delivery`
3. Operation-level approval：
   - 一个 Action 内部的 read/edit/write/execute 分开显示。
   - 定时任务内高风险 operation 仍受策略约束。
4. Protected assets：
   - 官方模板、官方 Action、Buddy Home `AGENTS.md`、权限设置默认只可生成候选。
   - 应用修改必须走 approval + revision。
5. Secret hygiene：
   - 子进程环境变量最小化。
   - run records 不保存 secret 明文。
   - artifact path 和日志做脱敏。

验收标准：

- 注入风险内容不会直接进入 LLM 上下文而无标记。
- 高风险副作用有 review surface。
- run record 中能看到权限申请和批准来源。
- 定时任务不会绕过人工设置的权限边界。

优先级：P1-P2。

### 3.14 Plugin / Extension 体系

Hermes 能力：

- 用户、项目、pip entry point 三类插件来源。
- 插件可注册 tools、hooks、CLI commands。
- memory provider 和 context engine 是专门插件类型。

TooGraph 差距：

- TooGraph 有 Action/Tool package 和 graph template，但缺少统一插件生命周期、安装、启用、版本、权限和 hook。

解决方案：

1. 定义 TooGraph plugin manifest：
   - `plugin_id`
   - `version`
   - `provides`: `actions|tools|templates|knowledge_loaders|model_providers|hooks`
   - `permissions`
   - `entrypoints`
   - `settings_schema`
2. 插件目录：
   - official plugins。
   - user plugins。
   - project plugins。
3. Lifecycle：
   - install。
   - enable/disable。
   - validate。
   - update。
   - uninstall。
4. Hooks：
   - before graph run。
   - after graph run。
   - before context assembly。
   - after capability result。
   - scheduler tick。
5. UI：
   - Plugin page 显示包内容、权限、状态、版本、最近运行错误。

验收标准：

- 一个插件可以同时提供 Action、Tool 和模板。
- 插件启用后 selector 能发现其 capability profile。
- 插件权限在安装和使用位置都可见。

优先级：P3。

### 3.15 Gateway / 多入口 / 消息平台

Hermes 能力：

- Gateway 支持多个平台、session routing、授权、slash commands、hooks、cron ticking。

TooGraph 差距：

- TooGraph 当前主要是 Web app + Buddy UI。
- 没有独立平台 gateway，也没有 Telegram/Discord/Slack/CLI 等入口。

解决方案：

1. 定义 `agent_entrypoint` 抽象：
   - `web_buddy`
   - `api`
   - `cli`
   - `cron`
   - `webhook`
   - future platform adapters。
2. 统一 session routing：
   - entrypoint + external user id + conversation id -> Buddy session。
3. 权限模型：
   - 每个 entrypoint 有 allowed actions、delivery target、approval strategy。
4. API：
   - start buddy run。
   - stream activity events。
   - resume approval。
   - list sessions。
5. CLI 入口：
   - 最先做本地 CLI，可以复用 Web app backend。
   - 平台 gateway 后置。

验收标准：

- CLI 可以启动同一个 Buddy 主循环并写入同一 run store。
- 不同入口的 session 和权限隔离清晰。
- cron/job 结果可以投递到指定 UI 或输出 artifact。

优先级：P3。

### 3.16 诊断与可观测性

Hermes 能力：

- TUI/status/logs 展示 provider、token、工具调用、错误、fallback。
- Curator 和 cron 有 run report。

TooGraph 差距：

- RunDetail 有运行树，但 Agent 级诊断还不集中。
- 用户不容易看清“为什么选这个能力、为什么停止、召回了什么、裁剪了什么”。

当前进展：

- RunDetail Agent Diagnostic 已聚合 Agent loop stop reason、能力选择 trace、provider fallback trace 和标准 warnings；用户可在同一个诊断面板看到停止原因、能力预算、能力候选、模型 fallback 决策、失败/拒绝/fallback 候选与上下文证据。
- RunDetail Agent Diagnostic 已补充权限审批摘要：从当前 pending permission approval 或最近完成的 approval 审计记录读取能力引用、能力名称、权限集合、审批状态、来源和原因，并在诊断面板中作为独立分区展示。
- Pending 权限审批已经可在 RunDetail 中直接批准或拒绝；页面复用统一 run resume API，把 approval decision 写回运行时，由运行时继续执行或产出 permission denied 结果，避免只提供只读诊断。

解决方案：

1. Agent Diagnostic view：
   - Input boundary。
   - Runtime context。
   - Context packages。
   - Recall hits。
   - Capability selection trace。
   - Capability result。
   - Loop budget。
   - Stop reason。
   - Errors/fallbacks。
2. Buddy 胶囊增强：
   - 折叠态显示阶段、耗时、选择能力。
   - 展开态显示 source refs、selection reason、child run links。
3. Run report artifacts：
   - 每次 review/curator/scheduler 运行生成 Markdown/JSON report。
4. Metrics：
   - capability success rate。
   - memory write count。
   - recall precision proxy。
   - provider error count。

验收标准：

- 用户不用读 raw JSON 就能判断一次 Agent run 的质量。
- 每个后台任务都有 report。
- 能力失败和 fallback 在 UI 中可见。

优先级：P1-P2。

### 3.17 Eval 与质量门禁

Hermes 能力：

- 大量 provider/tool/runtime 回归测试。
- release notes 显示其稳定性来自长期修复和覆盖。

TooGraph 差距：

- Eval 中心已存在，但 Agent 主循环、召回、记忆、selector、scheduler、curator 的评测还需要系统化。

已完成进展：

- Eval runner 已支持 case 级 `metadata.fixture_runs`，启动 eval case 前会把声明的 source run fixture 写入统一 graph run store；复盘、压缩和改进验证类模板可以通过真实 `source_run_id` 从 run 事实源恢复上下文。
- Eval runner 已支持 case 级 `metadata.fixture_buddy_sessions`，能把 Buddy session/message fixture 写入统一 DB 并投影到 retrieval，供 session search 和 hybrid recall eval 形成可重复输入。
- Eval runner 已支持 case 级 `metadata.fixture_memory_entries`，能把结构化记忆 fixture 写入统一 DB 并投影到 retrieval，供 memory recall eval 形成可重复输入。
- 官方 eval seed 已覆盖 `buddy_autonomous_review_core`、`buddy_context_compaction_core`、`embedding_maintenance_core`、`buddy_memory_recall_eval_core`、`buddy_hybrid_recall_eval_core`、`buddy_capability_curator_core`、`buddy_improvement_review_workflow_core` 和 `delegation_worker_eval_core`，加上既有 Buddy 主循环、页面操作、Action 创建、Web research 和业务模板 eval，核心 Buddy 后台能力已有可发现回归入口。
- 新增的 eval cases 覆盖后台复盘产物、上下文压缩摘要、Embedding 维护计数、能力整理报告和改进候选审批请求；定性规则仍通过 LLM judge 跑，结构化输出通过 schema check 跑。
- 新增 `memory_retrieval` 自动 check，用确定性方式验证 memory ids、source refs、required terms、forbidden terms 和上下文预算，让记忆召回质量不完全依赖 LLM judge。
- 新增 `capability_selection` 自动 check 和 case 级 `fixture_capability_usage_entries`，Buddy 主循环 eval 已能覆盖“能力近期失败后 selector 改选健康 fallback，并留下结构化拒绝原因”的回归场景。
- 新增 `scheduler_run` 自动 check、`scheduler_run_context_loader` Tool 和 `scheduler_retry_delivery_eval_core`，调度 retry/delivery 现在可以通过 eval 中心验证，而不只依赖 scheduler store 单元测试。
- `scheduler_run_context_loader` 会同时读取关联 graph run 的权限 metadata；`scheduler_run` 自动 check 已支持验证 `graph_permission_mode`、`permission_policy`、`scheduled_graph_permission_policy_source` 和 `pending_permission_approval`，官方 scheduler eval case 现在覆盖后台调度运行的 risky 审批边界。
- 新增 `delegation_worker` 自动 check、`delegation_worker_result_packager` Tool 和 `delegation_worker_eval_core`，委派 worker packet/result 协议已有可重复评测入口。
- 新增 `hybrid_recall` 自动 check、`hybrid_recall_context_loader` Tool 和 `buddy_hybrid_recall_eval_core`，session/history + DB memory 的混合召回已有可重复评测入口。
- 新增 `provider_fallback` 自动 check、`provider_fallback_resolver` Tool 和 `provider_fallback_eval_core`，provider/model fallback 选择合同已有可重复评测入口。

后续仍需：

- 为真实 Subgraph worker 执行、真实 provider/tool 失败驱动的 selector fallback，以及真实 LLM runtime provider fallback 接入增加更细的自动评测。
- 把官方模板变更和能力包变更接入明确的本地 eval gate，而不是只依赖人工选择运行 suite。

解决方案：

1. Eval suite 分层：
   - Buddy main loop。
   - Memory recall。
   - Capability selector。
   - Context compression。
   - Self-improvement candidate。
   - Scheduler。
   - Delegation。
2. 每个 suite 至少包含：
   - happy path。
   - ambiguous request。
   - missing capability。
   - failed capability。
   - context overflow。
   - stale memory。
   - permission required。
3. 指标：
   - 是否选对能力。
   - 是否引用正确 source refs。
   - 是否避免重复历史。
   - 是否给出正确 stop reason。
   - 是否生成合格 memory candidate。
4. 变更门禁：
   - 官方模板变更必须跑相关 eval。
   - Action/Tool 变更必须跑包内测试。

验收标准：

- 每个核心 Agent 能力有至少一个自动评测。
- 官方主循环改动能被 eval 捕捉。
- 记忆和召回有可重复质量报告。

优先级：P1。

## 4. 推荐实施顺序

### 阶段 A：主循环可信度

目标：让默认 Buddy 主循环具备可解释、可停止、可恢复的 Agent loop 基础。

工作项：

1. `agent_loop_control` state + `agent_loop_guard` Tool。
2. stop reason 标准化。
3. RunDetail Agent Diagnostic 初版。
4. `buddy_autonomous_loop` 加入 guard。
5. 官方主循环 eval。

完成标准：

- Buddy run 具备 loop budget、stop reason、selection trace。
- 失败路径能输出可读结果。

### 阶段 B：记忆与召回生产化

目标：让记忆召回接近 Hermes session_search + memory providers 的实用性。

工作项：

1. 标准 `context_package`。
2. memory/message/run chunk embedding queue。
3. Hybrid recall + rerank。
4. Memory recall audit UI。
5. 记忆复盘写入质量增强。

完成标准：

- 每次召回可解释。
- 文件记忆和数据库记忆协作，不互相替代。

### 阶段 C：能力选择与能力生态

目标：让 selector 从“能选一个能力”升级为“能解释、能 fallback、能学习失败”。

工作项：

1. Capability profile。
2. selector scoring。
3. capability usage stats。
4. fallback candidates。已支持 trace 展示，并在请求能力连续近期失败时自动改选更健康 fallback。
5. 官方能力准入规范。

完成标准：

- 每次能力选择有评分、拒绝理由和预算。
- 失败后能调整选择。

### 阶段 D：自我改进闭环

目标：让 Buddy 能把运行经验沉淀成可审查改进。

工作项：

1. `improvement_candidate` schema。
2. improvement review workflow。已完成官方验证模板、RunDetail 启动验证 run 入口、独立候选队列 UI、验证 run 关联、候选状态同步、验证产物持久化、人工决策和 command-backed apply。
3. Action/Tool/template diff + validation + approval + apply 覆盖扩展。
4. capability curator。已完成官方模板、自动快照 loader、官方 scheduler 种子和报告 UI。
5. curator report UI。已完成第一版 `/curator-reports`，从标准 graph run 事实源重建报告。

完成标准：

- 后台复盘产生的候选能进入受控改进流程。
- 官方能力不会被静默修改。

### 阶段 E：调度、委派、插件

目标：追上 Hermes 的 cron、delegation、plugin 扩展能力。

工作项：

1. Scheduler store + API + 手动/run-due 触发 + 后台 tick + 官方 job 种子 + Scheduler 页面 + 用户自定义任务创建入口 + 失败 retry policy + 默认官方维护任务启用引导 + 本地审计投递结果。已完成第一版；外部投递 adapter 待补。
2. Worker task packet / result package。
3. Subgraph worker 模板。
4. Plugin manifest 和 Plugin 页面。
5. CLI/API entrypoint。

完成标准：

- 能创建周期性图运行。
- 能并发委派子任务并合并结果。
- 插件能力能被 selector 发现。

## 5. 数据结构草案

### `agent_loop_events`

```text
event_id
run_id
node_id
iteration_index
event_kind
capability_kind
capability_key
stop_reason
budget_snapshot_json
detail_json
created_at
```

### `capability_usage_events`

```text
event_id
invocation_id
run_id
node_id
capability_kind
capability_key
selected_reason
status
latency_ms
error_type
error_message
permission_result
summary
detail_json
created_at
```

### `memory_entries`

```text
id
kind
content
confidence
stability
source_refs_json
embedding_status
supersedes_id
created_by_run_id
created_at
updated_at
last_verified_at
```

### `retrieval_chunks`

```text
id
source_kind
source_id
chunk_index
content
metadata_json
hash
embedding_status
created_at
updated_at
```

### `scheduled_graph_jobs`

```text
job_id
name
template_id
input_bindings_json
schedule_kind
schedule_expr
timezone
enabled
last_run_id
next_run_at
runtime_overrides_json
delivery_target_json
retry_policy_json
metadata_json
created_at
updated_at
```

### `scheduled_graph_job_runs`

```text
job_run_id
job_id
run_id
trigger_reason
status
error
started_at
completed_at
metadata_json
created_at
updated_at
```

`metadata_json.delivery_result` 记录终态投递审计，包含投递 kind、状态、job/run 引用、触发原因、终态状态、脱敏 target；外部投递 target 还会包含 `approval_required`、`required_permissions` 和统一 `permission_profile`。

### `improvement_candidates`

```text
candidate_id
kind
status
status_reason
source_run_id
review_id
review_run_id
target_ref_json
evidence_refs_json
risk_level
expected_benefit
proposed_change_summary
approval_required
validation_run_id
validation_result_json
applied_revision_id
applied_command_json
applied_at
decision_json
decided_at
payload_json
created_at
updated_at
```

## 6. 验收总清单

TooGraph 可以认为“追上 Hermes Agent 核心能力”的最低标准：

- 默认 Buddy 主循环具备 loop budget、stop reason、fallback、diagnostic view。
- 所有上下文以 context package 进入 prompt，来源和 authority 可见。
- 历史、记忆、知识库和 run outputs 都能 hybrid recall。
- 记忆写入有文件线和数据库线，且有 evidence、revision、去重。
- background review 不阻塞主回复，失败可见，可重跑。
- improvement candidates 能进入验证、diff、approval、revision、eval 流程。
- capability selector 有评分、拒绝理由、失败反馈和预算。
- Action/Tool/Subgraph 有统一 capability profile。
- scheduler 能运行周期性图任务。
- Subgraph worker 能支持委派和结果合并。
- provider runtime 有能力矩阵、fallback、structured output repair。
- 权限、注入扫描、secret hygiene 和 operation approval 成为通用机制。
- 每个核心能力都有自动测试或 eval。

## 7. 明确不做的事

- 不把 Hermes 的 monolithic `AIAgent` loop 直接搬进 TooGraph 后端。
- 不让单个 LLM 节点连续自治执行多个步骤。
- 不让 provider tool call 绕过 Action/Tool/Subgraph、权限、run record。
- 不把 Buddy 自我改进做成隐藏后端策略。
- 不把完整聊天全文作为每轮 run 的递归事实源。
- 不让召回内容、摘要或生成记忆变成更高优先级指令。

## 8. Hermes 源码对照索引

后续开发调研时，优先从下列文件验证 Hermes 的实际行为，再把能力翻译为 TooGraph 图、Action、Tool、Subgraph 和存储合同。

| 能力域 | Hermes 参考文件 | TooGraph 翻译重点 |
| --- | --- | --- |
| 主 Agent loop | `demo/hermes-agent/run_agent.py`、`demo/hermes-agent/agent/conversation_loop.py`、`demo/hermes-agent/agent/iteration_budget.py`、`demo/hermes-agent/agent/tool_executor.py` | 不搬 monolithic loop；拆成图模板循环、guard Tool、stop reason、run diagnostics |
| 模型调用与 fallback | `demo/hermes-agent/providers/base.py`、`demo/hermes-agent/hermes_cli/runtime_provider.py`、`demo/hermes-agent/agent/chat_completion_helpers.py`、`demo/hermes-agent/agent/transports/` | 统一 provider profile 与 runtime resolver；记录实际 provider/model、repair 和 fallback |
| Prompt 构造 | `demo/hermes-agent/agent/prompt_builder.py`、`demo/hermes-agent/agent/system_prompt.py`、`demo/hermes-agent/agent/context_engine.py`、`demo/hermes-agent/agent/subdirectory_hints.py` | 统一 `context_package`；按 authority 渲染；保留来源、预算、裁剪和注入风险 |
| 会话与搜索 | `demo/hermes-agent/hermes_state.py`、`demo/hermes-agent/tools/session_search_tool.py` | Buddy messages、summaries、lineage、context assemblies、run refs 形成可查询事实源 |
| 记忆 | `demo/hermes-agent/tools/memory_tool.py`、`demo/hermes-agent/agent/memory_manager.py`、`demo/hermes-agent/agent/memory_provider.py`、`demo/hermes-agent/plugins/memory/` | 文件记忆 + DB 记忆双线；embedding queue；hybrid recall；evidence 和 revision |
| 后台复盘 | `demo/hermes-agent/agent/background_review.py` | 独立后台图运行；只读 source run snapshot；写 memory 或 candidate；失败不影响主回复 |
| 技能/能力整理 | `demo/hermes-agent/agent/curator.py`、`demo/hermes-agent/hermes_cli/curator.py`、`demo/hermes-agent/tools/skill_usage.py` | capability curator 图；输出整理候选、报告、测试建议；官方资产保护 |
| Tool registry / toolsets | `demo/hermes-agent/model_tools.py`、`demo/hermes-agent/tools/registry.py`、`demo/hermes-agent/toolsets.py` | Action/Tool/Subgraph 统一 capability profile；selector 用同一 catalog |
| 低层工具能力 | `demo/hermes-agent/tools/file_tools.py`、`demo/hermes-agent/tools/terminal_tool.py`、`demo/hermes-agent/tools/web_tools.py`、`demo/hermes-agent/tools/browser_tool.py`、`demo/hermes-agent/tools/mcp_tool.py` | 按权限和副作用拆成官方 Action/Tool；输出 artifacts、diff、revision 和错误分类 |
| Cron / Scheduler | `demo/hermes-agent/cron/jobs.py`、`demo/hermes-agent/cron/scheduler.py`、`demo/hermes-agent/tools/cronjob_tools.py` | scheduled graph jobs；每次触发生成 graph run；失败、重试和投递目标可审计 |
| 委派与 Kanban | `demo/hermes-agent/tools/delegate_tool.py`、`demo/hermes-agent/hermes_cli/kanban_db.py`、`demo/hermes-agent/tools/kanban_tools.py`、`demo/hermes-agent/hermes_cli/kanban_swarm.py` | Subgraph worker protocol；worker task/result package；并发预算；父图合并 |
| 压缩与缓存 | `demo/hermes-agent/agent/conversation_compression.py`、`demo/hermes-agent/agent/context_compressor.py`、`demo/hermes-agent/agent/prompt_caching.py` | 压缩图输出 summary refs；run 保存 prompt/context assembly snapshot；稳定上下文只影响下一轮 |
| 权限与安全 | `demo/hermes-agent/tools/approval.py`、`demo/hermes-agent/tools/path_security.py`、`demo/hermes-agent/tools/tirith_security.py`、`demo/hermes-agent/agent/file_safety.py`、`demo/hermes-agent/agent/redact.py`、`demo/hermes-agent/agent/message_sanitization.py` | operation-level approval；context scanner；secret 脱敏；资产保护；定时任务不绕过权限 |
| 插件体系 | `demo/hermes-agent/hermes_cli/plugins.py`、`demo/hermes-agent/plugins/` | TooGraph plugin manifest；安装/启用/校验/升级；插件能力进入 selector |
| 多入口与网关 | `demo/hermes-agent/gateway/run.py`、`demo/hermes-agent/gateway/session.py`、`demo/hermes-agent/gateway/platforms/`、`demo/hermes-agent/tui_gateway/` | `agent_entrypoint` 抽象；平台 session routing；CLI/API/gateway 共用 run store |
| 诊断与 TUI | `demo/hermes-agent/hermes_cli/logs.py`、`demo/hermes-agent/hermes_cli/status.py`、`demo/hermes-agent/tui_gateway/server.py`、`demo/hermes-agent/ui-tui/src/` | RunDetail/Buddy 胶囊显示关键诊断，而不是暴露 raw JSON |
| 测试与回归 | `demo/hermes-agent/tests/` | 为每个核心 Agent 能力建立 eval suite 和包级测试 |

## 9. 下一步开发建议

最合理的下一份开发计划应从阶段 A 开始：

1. 设计并实现 `agent_loop_control` state。
2. 新增 `agent_loop_guard` Tool。
3. 修改 `buddy_autonomous_loop`，把能力执行结果先送入 guard。
4. RunDetail 增加 stop reason 和 loop budget 展示。
5. 增加 Buddy main loop eval cases。

这组工作能直接提升主循环稳定性，并为后续召回、selector、scheduler、delegation 提供共同诊断基础。

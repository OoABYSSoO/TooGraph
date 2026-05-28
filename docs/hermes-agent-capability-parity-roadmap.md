# TooGraph 追上 Hermes Agent 能力路线图

最后整理日期：2026-05-29。

本文是 TooGraph 追赶 `demo/hermes-agent/` 通用 Agent 能力的长期路线事实源。本文只记录当前代码能够证明的事实、已经带来的能力增强、验证方式，以及下一步还需要怎么实现。

这里的“追上”不是复制 Hermes 的隐藏循环形态，而是在 TooGraph 的图优先架构里达到同等级能力：

- Hermes 用 Agent loop、tool calls、skills、cron、后台 fork、session store 和 provider runtime 表达能力。
- TooGraph 用图模板、Action、Tool、Subgraph、state schema、run record、revision、approval、artifact、数据库事实源和可视化运行树表达同类能力。
- 单个 LLM 节点只执行一次模型回合；多步骤智能属于整张图。
- 重要副作用需要可见、可审计、可恢复。

## 1. 当前结论

当前进度判断：

- Buddy 核心 Agent 内核：约 82%。
- 完整 Hermes Agent 外延：约 72% 到 74%。

这个判断来自当前代码事实：

- 主循环、上下文装配、历史、召回、能力选择、动态能力执行、后台复盘、权限暂停、provider fallback、节点级 provider profile override、上下文压缩、运行诊断、Buddy 胶囊重放、模型日志树和消息平台入口已经形成可用闭环。
- Scheduler、delegation、provider profile、记忆质量、能力包覆盖、Scheduler 外部投递、消息平台生产硬化和长期任务状态仍是主要缺口。
- `Gateway / 多入口 / 消息平台` 的基础链路已经合并回 `dev`：当前以 Message Platforms 页面、Telegram / Feishu-Lark bindings、消息平台 runtime、外部消息进入 Buddy 会话和可见回复投递为事实边界。
- `Plugin / Extension` 暂不作为本文档目标。
- 完整 RAG ingestion、索引构建和知识问答链路本轮只保留承载入口，不进入本轮追赶开发。
- 内部质量门禁只作为开发者验证手段保留，不作为用户可见产品能力目标继续扩展。

## 2. 代码事实索引

这些文件是当前路线判断的主要事实来源。

| 能力域 | 当前事实来源 |
| --- | --- |
| 图协议与运行记录 | `backend/app/core/schemas/node_system.py`、`backend/app/core/storage/database.py`、`backend/app/core/storage/graph_run_db_store.py`、`backend/app/core/runtime/state_io.py` |
| Buddy 主循环 | `graph_template/official/buddy_autonomous_loop/template.json`、`tool/official/agent_loop_guard/run.py`、`tool/official/buddy_history_context_loader/run.py`、`tool/official/buddy_home_context_loader/run.py` |
| 上下文装配 | `backend/app/core/storage/context_assembly_store.py`、`backend/app/core/runtime/agent_prompt.py`、`tool/official/*_context_loader/run.py` |
| 历史、搜索、记忆 | `backend/app/buddy/store.py`、`backend/app/core/storage/memory_store.py`、`backend/app/core/storage/retrieval_store.py`、`backend/app/core/storage/embedding_store.py` |
| 后台复盘与改进候选 | `backend/app/buddy/background_review.py`、`backend/app/buddy/improvement_candidates.py`、`graph_template/official/buddy_autonomous_review/template.json`、`graph_template/official/buddy_improvement_review_workflow/template.json` |
| 能力选择与能力包 | `action/official/toograph_capability_selector/`、`action/official/*`、`tool/official/*`、`scripts/official-asset-gate.mjs` |
| Scheduler | `backend/app/scheduler/store.py`、`backend/app/scheduler/runner.py`、`backend/app/scheduler/service.py`、`frontend/src/pages/SchedulerPage.vue` |
| 消息平台 / 多入口 | `backend/app/messaging/`、`backend/app/api/routes_message_platforms.py`、`frontend/src/pages/MessagePlatformsPage.vue`、`frontend/src/api/message-platforms.ts` |
| Delegation | `tool/official/delegation_worker_result_packager/`、`tool/official/delegation_worker_result_merger/`、`tool/official/delegation_kanban_board_builder/`、`graph_template/official/delegation_*` |
| Provider runtime | `backend/app/core/schemas/node_system.py`、`backend/app/core/runtime/agent_runtime_config.py`、`backend/app/tools/model_provider_client.py`、`backend/app/core/provider_fallback.py`、`backend/app/api/routes_settings.py`、`frontend/src/pages/ModelProvidersPage.vue` |
| 权限、安全、artifact | `backend/app/core/capability_permissions.py`、`backend/app/core/context_security.py`、`backend/app/core/storage/capability_artifact_store.py`、`backend/tests/test_permission_approval.py` |
| 诊断与 UI | `frontend/src/pages/RunDetailPage.vue`、`frontend/src/pages/agentDiagnosticModel.ts`、`frontend/src/buddy/buddyOutputTrace.ts`、`frontend/src/pages/EvidenceSearchPage.vue`、`frontend/src/pages/ModelLogsPage.vue` |

## 3. 总进度看板

状态定义：

- `基本完成`：核心链路已落地，有代码、模板、API/UI 或测试证据；剩余主要是覆盖面和生产硬化。
- `进行中`：骨架已落地，但闭环、质量或真实外部集成仍缺。
- `未开始`：代码事实不足，主要停留在设计层。
- `非目标`：不由本文档追踪。

| 能力域 | 状态 | 已完成增强 | 主要验证 | 下一步 |
| --- | --- | --- | --- | --- |
| Agent loop 鲁棒性 | 基本完成 | loop control、guard、stop reason、retry、预算、run detail 投影 | `backend/tests/test_agent_loop_guard_tool.py`、`backend/tests/test_agent_loop_guard_e2e.py`、`backend/tests/test_graph_run_db_store.py`、`backend/tests/test_evaluator_store_routes.py` 中 Buddy 主循环恢复路径 | 扩充更复杂组合恢复用例和 UI 聚合 |
| Prompt / Context Assembly | 基本完成 | 所有主要上下文转为 `context_package` / `context_assembly_ref`，带 source refs、budget、warnings | `backend/tests/test_context_assembly_store.py`、`backend/tests/test_agent_state_prompt_semantics.py`、各 context loader 测试 | 更多官方模板统一接入，RunDetail 上下文面板增强 |
| Session persistence 与搜索 | 基本完成 | 原子消息、会话摘要、run refs、FTS/trigram、Evidence 搜索 | `backend/tests/test_buddy_store.py`、`backend/tests/test_buddy_search_views.py`、`frontend/src/pages/EvidenceSearchPage.structure.test.ts` | 复杂 lineage、summary source refs 和 run output 召回联动 |
| 长期记忆与 Embedding 召回 | 进行中 | 文件稳定上下文与 DB memory 双线；embedding jobs/vectors；hybrid recall；rerank | `backend/tests/test_memory_store.py`、`backend/tests/test_embedding_store.py`、`backend/tests/test_hybrid_recall_context_loader_tool.py`、`backend/tests/test_buddy_search_views.py` | 弱语义去重、人工复核候选、召回质量报告 |
| Background Review | 进行中 | 可见回复后触发后台复盘图，记录 source/review run，写入 revision 和候选 | `backend/tests/test_buddy_background_review_routes.py`、`frontend/src/buddy/BuddyWidget.structure.test.ts` | 失败处理、预算隔离、周期化整理 |
| 自我改进与 Curator | 进行中 | improvement candidates、验证 run 链接、approve/reject/apply API、Curator reports 页面 | `backend/tests/test_buddy_background_review_routes.py`、`backend/tests/test_template_layouts.py`、`frontend/src/pages/CuratorReportsPage.vue` | 自动验证、真实 diff 应用路径、更多 writer 覆盖 |
| Capability Selector 与能力路由 | 进行中 | capability profile、权限过滤、selection trace、usage events、失败 fallback 输入 | `backend/tests/test_toograph_capability_selector_action.py`、`scripts/capability-selector-loop.test.mjs`、`frontend/src/buddy/buddyOutputTrace.test.ts` | 跨能力组合 fallback 和长期 usage 学习 |
| Action / Tool / Subgraph 生态 | 进行中 | 官方 Action/Tool/Subgraph 包、manifest gate、动态 Tool/Subgraph capability、artifact 输出 | `backend/tests/test_action_manifest_contract.py`、`backend/tests/test_tool_node_runtime.py`、`scripts/official-asset-gate.mjs` | 高风险写入 Action、Subgraph worker 组合、artifact 端到端覆盖 |
| Scheduler / Cron | 进行中 | job/store/API/runner/lifespan tick、retry policy、local delivery audit、权限边界、经审批 webhook/http delivery adapter、delivery attempt 审计 | `backend/tests/test_scheduler_store.py`、`backend/tests/test_scheduler_routes.py`、`backend/tests/test_scheduler_service.py`、`backend/tests/test_scheduler_delivery.py`、`frontend/src/pages/SchedulerPage.vue` | delivery 失败重试链、Scheduler/RunDetail 投递诊断 UI |
| Gateway / 多入口 / 消息平台 | 进行中 | Message Platforms 页面、Telegram / Feishu-Lark binding、runtime/adapters、外部消息进入 Buddy 会话、斜杠命令、可见回复投递、audit/dedup/session resolver | `backend/tests/test_message_platform_*.py`、`frontend/src/api/message-platforms.test.ts`、`frontend/src/pages/MessagePlatformsPage.structure.test.ts`、`frontend/src/pages/messagePlatformsPageModel.test.ts` | 多模态 `state_bundle`、生产级凭据/部署、外部投递诊断、更多平台 adapter |
| Delegation / Subagents / Kanban | 进行中 | worker packet/result/merge/board state、Batch/Subgraph worker、RunDetail/胶囊诊断 | `backend/tests/test_delegation_worker_result_packager_tool.py`、`backend/tests/test_delegation_worker_result_merger_tool.py`、`backend/tests/test_delegation_kanban_board_builder_tool.py`、`backend/tests/test_batch_node_system.py` | 持久 board、claim/ownership、长期任务状态 |
| Provider Runtime 与模型能力矩阵 | 进行中 | provider fallback trace、embedding/rerank fallback、模型能力矩阵、保存级请求超时 profile、节点级 `providerProfile.requestTimeoutSeconds` override、`cachePolicy=disabled` prompt cache 审计决策、OpenAI/Codex Responses `prompt_cache_key` payload、Gemini `cachedContents` resource payload、Gemini cachedContent 本地复用与 TTL 过期、Model Logs cache hit-rate/resource summary、cache resource retention/pruning、OpenAI-compatible `prompt_cache` capability opt-in payload、model call provider profile meta、RunDetail Provider Profile 诊断、RunDetail budget degradation diagnostic UI、provider credential pool schema、credential failure/cooldown 写回、repeated-failure credential exhausted 隔离、least-recently-used credential 轮换、跨调用成本预算累计审计、预算耗尽 preflight 阻断、`costBudget.onExceeded=request_approval` 审批请求事实、预算审批 pause/resume 放行、`costBudget.onExceeded=degrade_model` 显式模型降级、`rateProfile` 最近窗口 preflight 阻断、进程内 `rateProfile.concurrency` gate、`tokensPerMinute` 请求 token 预测阻断、rate preflight `retry_after` 诊断、显式 `rateProfile.waitStrategy=wait` 预算内多次等待重试、进程内 provider 级 FIFO wait 队列、DB-backed in-flight 请求/Token 预留、reservation meta/log 诊断事实、Model Logs reservation 诊断 UI、DB-backed provider rate wait queue、Model Logs credential diagnostic UI、Model Logs cost/rate diagnostic UI、Model Logs cache diagnostic UI、Model Logs fallback diagnostic UI、Model Logs budget degradation diagnostic UI | `backend/tests/test_agent_runtime_config.py`、`backend/tests/test_agent_response_generation.py`、`backend/tests/test_agent_action_input_generation.py`、`backend/tests/test_agent_subgraph_input_generation.py`、`backend/tests/test_node_handlers_runtime.py`、`backend/tests/test_model_request_logs.py`、`backend/tests/test_model_provider_client.py`、`backend/tests/test_settings_model_providers.py`、`backend/tests/test_provider_fallback_resolver.py`、`backend/tests/test_openai_compatible_provider_runtime.py`、`frontend/src/pages/agentDiagnosticModel.test.ts`、`frontend/src/pages/runDetailModel.test.ts`、`frontend/src/pages/settingsPageModel.test.ts`、`frontend/src/pages/RunDetailPage.structure.test.ts`、`frontend/src/pages/ModelProvidersPage.structure.test.ts`、`frontend/src/pages/modelLogProviderDiagnostics.test.ts`、`frontend/src/pages/ModelLogsPage.structure.test.ts`、`frontend/src/api/modelLogs.test.ts`、`backend/tests/test_model_provider_credentials.py`、`backend/tests/test_storage_database.py` | 更多 provider-specific cache adapter |
| 上下文压缩与 Prompt Cache | 进行中 | 上下文压力检查、压缩子图、summary source refs、prompt audit metadata | `backend/tests/test_buddy_context_pressure_tool.py`、`backend/tests/test_template_layouts.py`、`frontend/src/buddy/buddyContextCompaction.test.ts` | provider 级 cache-control、稳定前缀拆分、节点级 cache override |
| 权限、安全与注入防护 | 进行中 | context scanner、secret redaction、高风险阻断、permission approval、artifact 路径隔离 | `backend/tests/test_context_assembly_store.py`、`backend/tests/test_permission_approval.py`、`backend/tests/test_graph_run_db_store_permission_audit.py`、`backend/tests/test_capability_artifact_store.py` | 能力包保护策略、审批 review surface、外部投递审批 |
| 诊断与可观测性 | 进行中 | RunDetail 聚合 context audit、agent diagnostic、provider fallback、provider budget degradation、permission、review、run tree；Buddy 胶囊按 output 边界重放 | `frontend/src/pages/RunDetailPage.structure.test.ts`、`frontend/src/pages/runDetailModel.test.ts`、`frontend/src/pages/agentDiagnosticModel.test.ts`、`frontend/src/buddy/buddyOutputTrace.test.ts` | 后台任务 report、召回排名和失败恢复集中诊断 |
| 模型日志树 | 基本完成 | 模型请求日志写入 `graph_model_calls`，按 run tree / graph node 展示，支持保留策略、密钥脱敏和 provider fallback/cache/cost/rate/credential/预算降级诊断 | `backend/tests/test_model_request_logs.py`、`frontend/src/api/modelLogs.test.ts`、`frontend/src/pages/ModelLogsPage.structure.test.ts` | 进一步关联 provider 审批 trace |
| 内部质量门禁 | 内部保留 | 官方资产门禁、graph run 检查、包级测试、隔离运行目录 | `scripts/official-asset-gate.mjs`、`backend/app/evaluator/*`、`backend/tests/test_evaluator_store_routes.py` | 作为开发者验证保留；产品主线不扩展 |

## 4. 已完成增强详情

### 4.1 Buddy 主循环已经从“单次回复”升级为“可诊断 Agent loop”

代码事实：

- 官方主循环模板是 `graph_template/official/buddy_autonomous_loop/template.json`。
- loop 控制由 `agent_loop_control` state 和 `tool/official/agent_loop_guard/run.py` 表达。
- `backend/app/core/storage/database.py` 已有 `agent_loop_events` 和 `capability_usage_events` 表。
- RunDetail 和 Buddy 胶囊读取同一 run fact：`frontend/src/pages/agentDiagnosticModel.ts`、`frontend/src/buddy/buddyOutputTrace.ts`。

增强内容：

- 每次能力执行后都有确定性 guard 判断是否继续、重试、停止或等待权限。
- stop reason 标准化，能区分预算耗尽、权限等待、provider 失败、能力失败和上下文预算问题。
- 胶囊显示不再依赖临时文本拼接，而是从 run detail 和 output 边界重建。

验证方式：

- `pytest backend/tests/test_agent_loop_guard_tool.py backend/tests/test_agent_loop_guard_e2e.py -q`
- `pytest backend/tests/test_graph_run_db_store.py -q`
- `node --test frontend/src/pages/agentDiagnosticModel.test.ts frontend/src/buddy/buddyOutputTrace.test.ts`

### 4.2 上下文装配已经统一为可审计 context package

代码事实：

- `backend/app/core/storage/context_assembly_store.py` 负责 context assembly 和 content blobs。
- `backend/app/core/runtime/agent_prompt.py` 展开 `context_package` 与 `context_assembly_ref`。
- 官方 context loader 覆盖 history、Buddy Home、review、runtime、page、web、knowledge、memory、capability、scheduler。

增强内容：

- 模型输入不再只是散落的长文本；每段上下文都有 source refs、authority、budget、warnings 和 rendered hash。
- 长上下文可以存成引用，运行记录保留可重建信息，减少每轮重复复制全文。
- 外部内容进入 prompt 前可以经过安全扫描和脱敏。

验证方式：

- `pytest backend/tests/test_context_assembly_store.py -q`
- `pytest backend/tests/test_agent_state_prompt_semantics.py -q`
- `pytest backend/tests/test_buddy_home_context_loader_tool.py backend/tests/test_buddy_history_context_loader_tool.py backend/tests/test_runtime_context_loader_tool.py -q`

### 4.3 会话历史已经改为原子消息、摘要和引用重建

代码事实：

- `buddy_sessions`、`buddy_messages`、`buddy_message_revisions`、`buddy_message_run_refs`、`buddy_session_summaries` 已在统一数据库中。
- `backend/app/buddy/store.py` 提供 recall、browse、discover、scroll 等查询。
- Evidence 页面入口存在：`frontend/src/router/index.ts` 中 `/evidence`。

增强内容：

- 聊天历史不再要求每轮 run 存储递归累加全文。
- 当前会话窗口、摘要、历史证据和 run refs 可以按预算重新组装。
- FTS、trigram、LIKE fallback 和 embedding 投影服务历史搜索。

验证方式：

- `pytest backend/tests/test_buddy_store.py -q`
- `pytest backend/tests/test_buddy_search_views.py -q`
- `node --test frontend/src/pages/EvidenceSearchPage.structure.test.ts`

### 4.4 记忆系统已经形成“稳定文件上下文 + DB 召回”双线

代码事实：

- `memory_entries`、`memory_entry_sources`、`retrieval_documents`、`retrieval_chunks`、`embedding_models`、`embedding_vectors`、`embedding_jobs` 已在统一数据库。
- `backend/app/core/storage/memory_store.py`、`embedding_store.py`、`retrieval_store.py` 是主要存储 API。
- `tool/official/hybrid_recall_context_loader/`、`memory_search_context_loader/`、`embedding_job_processor/`、`embedding_model_registry/` 已存在。

增强内容：

- 稳定上下文由 Buddy Home 文件线注入。
- 可召回事实、来源、置信度、salience、embedding 和 rerank 由数据库线承载。
- 背景复盘能产出结构化 memory 候选和写回记录。

验证方式：

- `pytest backend/tests/test_memory_store.py backend/tests/test_embedding_store.py backend/tests/test_retrieval_store.py -q`
- `pytest backend/tests/test_hybrid_recall_context_loader_tool.py backend/tests/test_memory_search_context_loader_tool.py -q`
- `pytest backend/tests/test_buddy_search_views.py -q`

### 4.5 后台复盘和自我改进候选已经可审计

代码事实：

- `backend/app/buddy/background_review.py` 从已完成 source run 创建后台复盘 run。
- `buddy_background_review_runs`、`improvement_candidates` 已持久化。
- `/improvements` 和 curator reports 有前端入口：`frontend/src/router/index.ts`。

增强内容：

- 可见回复路径和复盘路径解耦，复盘不会阻塞主回复。
- 记忆写回、用户上下文写回、身份写回和改进候选都有 revision 或候选状态。
- 候选可以绑定验证 run、审批、拒绝、应用。

验证方式：

- `pytest backend/tests/test_buddy_background_review_routes.py -q`
- `pytest backend/tests/test_buddy_home_writer_action.py backend/tests/test_buddy_memory_writer_action.py -q`
- `node --test frontend/src/buddy/BuddyWidget.structure.test.ts`

### 4.6 能力选择已经有权限、预算和诊断 trace

代码事实：

- `action/official/toograph_capability_selector/` 负责能力候选、权限过滤和 selection trace。
- `capability_usage_events` 从 run fact 投影使用事件。
- Buddy 胶囊和 RunDetail 能展示 selection trace。

增强内容：

- 能力选择从“模型口头决定”变成带 profile、权限、评分、拒绝理由和预算的结构化输出。
- 近期失败、权限限制和 loop budget 可以影响选择。
- 动态 capability 支持 Action、Tool、Subgraph 和 none。

验证方式：

- `pytest backend/tests/test_toograph_capability_selector_action.py -q`
- `node scripts/capability-selector-loop.test.mjs`
- `node --test frontend/src/buddy/buddyOutputTrace.test.ts`

### 4.7 Scheduler 已经能运行图任务，并开始具备经审批外部投递

代码事实：

- `scheduled_graph_jobs`、`scheduled_graph_job_runs`、`scheduled_delivery_attempts` 已入库。
- `backend/app/scheduler/store.py`、`runner.py`、`service.py` 和 `routes_scheduler.py` 提供创建、到期查询、运行、retry 和 lifespan tick。
- 外部投递目标默认仍记录 `external_delivery_requires_approval`，敏感字段会脱敏；`backend/app/scheduler/delivery.py` 提供经审批 webhook/http delivery adapter，审批 API 通过后才会发送请求。
- `scheduled_delivery_attempts` 会记录每次真实外部投递的 status、reason、redacted target、redacted request、response summary 和错误，job run metadata 会回写 latest attempt、delivery approval 与 delivery result。

增强内容：

- 定时任务变成标准 graph run，有 run record、retry policy、delivery audit 和权限 profile。
- Scheduler 外部投递不再只能停留在审计文本：用户或上层 review surface 批准后，webhook/http target 可以执行真实 POST/PUT/PATCH，并留下不含 secret 的 attempt 事实。
- 官方启动会 seed 内置维护任务。

验证方式：

- `pytest backend/tests/test_scheduler_store.py backend/tests/test_scheduler_routes.py backend/tests/test_scheduler_service.py backend/tests/test_scheduler_delivery.py -q`
- `pytest backend/tests/test_scheduler_permission_policy.py backend/tests/test_scheduler_run_context_loader_tool.py -q`

### 4.8 Provider runtime 已经统一 fallback 和请求超时 profile

代码事实：

- `backend/app/tools/model_provider_client.py` 统一 chat、embedding、rerank 调用。
- `backend/app/core/provider_fallback.py` 输出 provider fallback trace。
- `backend/app/api/routes_settings.py` 持久化 `request_timeout_seconds`。
- Model Providers 页面保存模型能力矩阵和 provider profile。

增强内容：

- LLM、结构化输出修复、embedding、rerank 都可进入 provider-aware runtime。
- 请求模型、实际模型、fallback candidates、失败原因、请求超时配置进入 meta / diagnostic。
- 本地 provider 不再依赖旧环境变量配置链路。

验证方式：

- `pytest backend/tests/test_model_provider_client.py -q`
- `pytest backend/tests/test_settings_model_providers.py -q`
- `pytest backend/tests/test_provider_fallback_resolver.py backend/tests/test_provider_fallback_resolver_tool.py -q`
- `pytest backend/tests/test_openai_compatible_provider_runtime.py -q`

### 4.9 权限、安全和 artifact 边界已经进入运行时

代码事实：

- `backend/app/core/capability_permissions.py` 生成权限 profile。
- `backend/app/core/context_security.py` 负责上下文扫描和脱敏。
- `backend/app/core/storage/capability_artifact_store.py` 管理 artifact 白名单和读取边界。
- risky capability 会进入 permission approval。

增强内容：

- 文件写入、脚本执行、外部投递等操作可以进入标准审批/等待态。
- prompt、model logs、artifact preview 会进行密钥和高风险内容处理。
- 大型 artifact 通过路径和受控引用传递，减少 base64 或全文污染。

验证方式：

- `pytest backend/tests/test_permission_approval.py backend/tests/test_langgraph_permission_approval.py -q`
- `pytest backend/tests/test_context_assembly_store.py backend/tests/test_capability_artifact_store.py -q`
- `pytest backend/tests/test_graph_run_db_store_permission_audit.py -q`

### 4.10 消息平台基础入口已经合并

代码事实：

- `backend/app/messaging/` 提供 catalog、bindings、connection status、session resolver、runtime、Telegram / Feishu-Lark adapters、slash commands、dedup、audit events 和可见回复投递。
- `backend/app/api/routes_message_platforms.py` 提供 Message Platforms API。
- `frontend/src/pages/MessagePlatformsPage.vue` 和 `/message-platforms` 提供绑定和状态管理入口。
- 外部消息通过 `buddy_ingress.py` 进入 Buddy 会话，触发官方 Buddy 主循环，并把可见 output 边界投递回平台。

增强内容：

- TooGraph 不再只支持应用内 Buddy 入口；Telegram、Feishu/Lark 这类外部消息入口已经有基础承载。
- 外部会话会映射到 Buddy session，保留平台来源、外部会话 key、last run、audit event 和 dedup 记录。
- 消息平台回复使用 Buddy 可见输出投影，避免把完整运行胶囊原样塞进外部聊天。

验证方式：

- `pytest backend/tests/test_message_platform_buddy_ingress.py backend/tests/test_message_platform_runtime.py backend/tests/test_message_platform_store.py -q`
- `pytest backend/tests/test_message_platform_routes.py backend/tests/test_message_platform_session_resolver.py backend/tests/test_message_platform_slash_commands.py -q`
- `node --test frontend/src/api/message-platforms.test.ts frontend/src/pages/MessagePlatformsPage.structure.test.ts frontend/src/pages/messagePlatformsPageModel.test.ts`

剩余边界：

- 多模态平台消息还需要落到通用 `state_bundle` 或等价 schema-backed state。
- 生产部署、凭据轮换、外部平台连接恢复和 delivery diagnostics 还需要继续硬化。
- 当前只覆盖 Telegram 与 Feishu/Lark 的基础 adapter 方向，更多平台仍应按同一 adapter/runtime/store 合同扩展。

### 4.11 模型日志树已经接入统一运行事实

代码事实：

- `backend/app/core/storage/model_log_store.py` 把模型请求日志写入 `graph_model_calls`。
- `backend/app/core/runtime/model_call_context.py` 和 LangGraph runtime 为模型调用补 run/node/execution context。
- `frontend/src/pages/ModelLogsPage.vue` 支持按 run tree / graph node 查看模型请求、响应、reasoning、错误和保留策略。
- `graph_model_calls.metadata_json` 已保留 provider profile runtime context，包括 `provider_profile`、`provider_request_timeout_seconds`、`provider_cache_policy`、`provider_cache_decision`、`provider_fallback_trace`、`provider_cost_budget`、`provider_cost_budget_approval`、`provider_cost_budget_degradation` 和 `provider_rate_profile`。
- `backend/app/core/storage/model_log_store.py` 提供 `update_model_request_log_metadata`，允许 provider runtime 在模型调用返回后把已知的 fallback trace 补写回对应 model-call metadata。
- `frontend/src/types/model-log.ts` 已把这些 provider context 字段纳入模型日志 API 类型，后续 UI trace drilldown 可以直接消费同一日志事实。
- `frontend/src/pages/modelLogProviderDiagnostics.ts` 会把 `provider_cache_policy` / `provider_cache_decision` 归一化为 cache policy、mode、provider cache control、eligibility 和证据 chips；`frontend/src/pages/ModelLogsPage.vue` 会在模型日志详情中展示 Provider cache 诊断块。
- `frontend/src/pages/modelLogProviderDiagnostics.ts` 会把 `provider_fallback_trace` 归一化为 requested/selected/failed/fallback candidate 指标和 failed/fallback/rejected/capability/permission/warning 证据；`ModelLogsPage.vue` 会在模型日志详情中展示 Provider fallback 诊断块。
- `frontend/src/pages/modelLogProviderDiagnostics.ts` 会把 `provider_cost_budget_degradation` 归一化为 requested/selected model、预算上限、窗口已用成本和 preflight/on-exceeded 证据；`ModelLogsPage.vue` 会在模型日志详情中展示预算降级诊断块。

增强内容：

- 模型日志从独立请求列表升级为能回到 run、node、child run 的诊断树。
- 请求、响应和错误进入日志前会脱敏，inline media 会摘要化。
- 后续 provider profile、成本、cache、fallback 和预算降级诊断有了共同挂载点。
- 每次 LLM 调用现在可以在模型日志里追溯节点级 provider profile、prompt cache decision、成本预算和速率 profile，避免只在 node runtime config 中短暂存在。
- 模型日志详情页现在能直接解释一次调用的 prompt cache 决策：用户可以看到请求策略、provider 实际控制方式、是否 eligible、禁用或不应用原因、稳定前缀/动态后缀长度、invalidators 和 provider cache usage。
- 模型日志详情页现在能直接解释一次 provider fallback：用户可以看到原请求模型、最终选中模型、失败候选数量、fallback 候选数量、被拒候选原因、能力/权限要求和 warning，而不必展开 raw JSON 或跳转到 RunDetail 才能还原 provider 选择路径。
- 模型日志详情页现在能直接解释一次预算降级：用户可以看到原请求模型、降级后模型、预算上限、窗口已用成本、preflight 阻断原因和 `onExceeded=degrade_model` 策略证据，而不必展开 raw JSON 才能确认 primary 请求为何被跳过。

验证方式：

- `pytest backend/tests/test_model_request_logs.py -q`
- `node --test frontend/src/api/modelLogs.test.ts frontend/src/pages/ModelLogsPage.structure.test.ts`
- `node --test frontend/src/pages/modelLogProviderDiagnostics.test.ts frontend/src/pages/ModelLogsPage.structure.test.ts`

### 4.12 节点级 Provider profile override 已经进入 LLM 调用路径

代码事实：

- `backend/app/core/schemas/node_system.py` 的 `NodeSystemAgentConfig` 已支持 `providerProfile`，包含 `requestTimeoutSeconds`、`cachePolicy`、`costBudget` 和 `rateProfile`。
- `backend/app/core/runtime/agent_runtime_config.py` 会把节点级 provider profile 解析为 `provider_request_timeout_seconds`、`provider_cache_policy`、`provider_cost_budget` 和 `provider_rate_profile`。
- `backend/app/core/runtime/agent_response_generation.py`、`agent_action_input_generation.py` 和 `agent_subgraph_input_generation.py` 会把 `provider_request_timeout_seconds` 透传给模型请求；结构化输出修复也复用同一 runtime profile。
- `backend/app/tools/model_provider_client.py` 允许显式 request timeout 覆盖已保存 provider timeout，并把同一 override 用于 fallback candidate 调用。
- `backend/app/tools/local_llm.py` 支持本地 provider 调用的节点级 request timeout override。
- `frontend/src/types/node-system.ts` 已补齐 `AgentProviderProfile` 类型，避免前端图文档丢失该协议字段。
- `backend/app/core/runtime/agent_prompt.py` 的 prompt snapshot 会读取 `provider_cache_policy`，把节点级 `cachePolicy=disabled` 记录为 `requested_policy=disabled`、`mode=disabled`、`provider_cache_control=disabled`，并把 cache eligibility 置为 false。最终回复、Action 输入规划、Subgraph 输入规划和结构化输出修复都走同一审计路径。
- `backend/app/core/runtime/agent_response_generation.py` 会把 provider profile runtime context 和 prompt cache decision 注入模型调用上下文，Action 输入规划、Subgraph 输入规划和结构化输出修复复用同一 helper。
- `backend/app/core/storage/model_log_store.py` 会把这些 provider context 字段写入并读回模型日志条目，形成 run/node/model-call 级可审计事实。
- `backend/app/core/storage/model_log_store.py` 会读写 `provider_fallback_trace`，并提供 `update_model_request_log_metadata` 用于把模型返回后才确定的 fallback 选择结果补写到最新 model-call metadata；`backend/app/tools/model_provider_client.py` 会在 chat、embedding、rerank fallback 成功选中候选后调用这个补写路径。
- `backend/app/core/model_provider_credentials.py` 提供 provider credential pool 规范化 primitive，`routes_settings.py` 保存 `credential_id`、`status`、`cooldown_until` 和 `failure_count`，`model_catalog.py` 把同一结构暴露给设置页。
- `frontend/src/pages/agentDiagnosticModel.ts` 会从 node execution runtime config 汇总 provider profile，输出 request timeout、cache policy/cache decision、cost budget、cost on-exceeded strategy 和 rate profile 诊断标签。
- `frontend/src/pages/RunDetailPage.vue` 的 Agent Diagnostic 面板会展示 Provider Profile 诊断块，供用户直接查看节点级 provider profile 如何影响该 run。
- `frontend/src/pages/settingsPageModel.ts` 会在 provider draft/save payload 中保留 credential pool metadata，`ModelProvidersPage.vue` 在高级设置中展示只读凭据池摘要和每个 credential 的状态、冷却时间与失败计数。
- `frontend/src/pages/runDetailModel.ts` 和 `frontend/src/pages/RunDetailPage.vue` 会保留并展示 prompt cache `requested_policy`，避免 RunDetail 把 `default`、`prefer`、`disabled` 这类节点请求策略折叠成不可区分的 cache audit。
- `backend/app/core/runtime/agent_response_generation.py` 的 `model_provider_request_profile_kwargs` 会把 prompt snapshot 中的 cache policy 透传给远端模型调用；最终回复、Action 输入规划、Subgraph 输入规划和结构化输出修复都走同一入口。
- `backend/app/tools/model_provider_client.py` 会把 `prompt_cache_policy` 从 model ref 调用传到 provider transport 和 fallback candidate，并在 provider 不支持或 policy 不符合条件时写入 `provider_prompt_cache_result` 诊断。
- `backend/app/tools/model_provider_anthropic.py` 会在 `cachePolicy=prefer` 且 prompt snapshot 判定可缓存时，把 Anthropic Messages API 的 `system` payload 转为 text block 并写入 `cache_control: {"type": "ephemeral"}`；响应 usage 中的 cache token 字段会回写到 prompt snapshot 的 `provider_usage`。
- `backend/app/tools/model_provider_openai.py` 会在官方 OpenAI Chat Completions provider 且 `cachePolicy=prefer` 可用时，把 prompt snapshot 的 `cache_key` 下发为 `prompt_cache_key`，并把 `usage.prompt_tokens_details.cached_tokens` 归一化回 `provider_prompt_cache_result.usage.cached_tokens`。
- `backend/app/tools/model_provider_codex.py` 会在 Codex Responses transport 且 `cachePolicy=prefer` 可用时，把同一 prompt snapshot `cache_key` 下发为 Responses payload 的 `prompt_cache_key`，并把 `usage.input_tokens_details.cached_tokens` 归一化回 `provider_prompt_cache_result.usage.cached_tokens`。
- `backend/app/tools/model_provider_gemini.py` 会在 Gemini generateContent transport 且 `cachePolicy=prefer` 可用时，为稳定 system prompt 创建 `cachedContents` 资源，并在生成请求中引用 `cachedContent`；创建与读取 token 会归一化到同一个 `provider_prompt_cache_result.usage` 合同。
- `backend/app/core/storage/database.py` 和 `backend/app/core/storage/provider_prompt_cache_store.py` 会保存 provider prompt cache resource，按 provider、transport、base URL、模型、credential scope、`cache_key` 和 `stable_prefix_hash` 查找未过期资源；`backend/app/tools/model_provider_gemini.py` 会在创建前复用未过期 Gemini `cachedContents`，并在 lookup 时把过期资源标记为 `expired`。返回 meta 会区分 `cache_resource_status=created/reused`、`cached_content_name` 和 `cached_content_expires_at`，让创建/复用/TTL 事实进入同一个 cache 诊断合同。
- `frontend/src/pages/modelLogProviderDiagnostics.ts` 会把 provider cache resource 状态、资源名和过期时间展示到 Model Logs cache evidence 中，帮助用户判断某次调用是新建缓存还是复用既有 `cachedContents`。
- `backend/app/core/storage/model_log_store.py` 会在 `list_model_request_logs` 返回 `provider_cache_summary`，按当前查询范围统计 cache decision 数、provider applied 数、Gemini resource created/reused 命中率、cache creation/read token，以及 `provider_prompt_cache_resources` 的 active/expired/superseded 状态；summary 读取会复用 `provider_prompt_cache_store` 的过期标记逻辑，避免过期资源继续显示为 active。
- `backend/app/core/storage/provider_prompt_cache_store.py` 会按保留天数 pruning 已终止 cache resource：超过窗口的 expired 资源按 `expires_at` 删除，superseded 资源按 `updated_at` 删除，未过期 active 资源保留可复用；`backend/app/core/storage/model_log_store.py` 会在模型日志保留保存和常规日志 pruning 时触发同一清理。
- `frontend/src/types/model-log.ts`、`frontend/src/api/modelLogs.ts` 和 `frontend/src/pages/ModelLogsPage.vue` 会保留并展示 `provider_cache_summary`，在 Model Logs 顶部直接显示 cache hit rate、资源 active/expired/total 和 cache token read/create 汇总；同页保留设置现在也包含 cache resource 保留天数，便于用户控制 Gemini `cachedContents` 本地索引的生命周期。
- `backend/app/tools/model_provider_client.py` 会读取 saved model capabilities；只有非官方 OpenAI-compatible 模型显式打开 `prompt_cache` capability 时，才把 `cache_key` 作为 `prompt_cache_key` 下发，并在诊断里标记 `openai_compatible_prompt_cache_key`。未 opt-in 的 compatible provider 仍返回 `not_supported` cache 诊断，不会偷偷发送 provider-specific 字段。
- `frontend/src/pages/ModelProvidersPage.vue` 的能力矩阵暴露 `Prompt cache` 开关，`frontend/src/pages/settingsPageModel.ts` 和 settings API 会保留 `prompt_cache` capability，让 provider cache opt-in 成为可见、可审计的配置而不是隐藏代码路径。
- `backend/app/tools/model_provider_client.py` 会在 model-ref 调用返回后把 `provider_prompt_cache_result` 回填到最新 model-call metadata 的 `provider_cache_decision`，让 Model Logs cache 诊断看到 provider 实际应用结果，而不是只能看到调用前审计决策。
- `backend/app/core/model_provider_credentials.py` 提供可复用的 credential pool secret-preserving normalization、least-recently-used active credential selection primitive 和 `last_used_at` metadata；默认输出仍会移除 `api_key`，只有 settings 保存和 provider runtime 路径读取 secret。
- `backend/app/api/routes_settings.py` 会在 Model Providers 页面用只读 metadata 回写 credential pool 时保留已有池内 `api_key`，避免 UI 保存状态、冷却时间或失败计数时意外清除 secret。
- `backend/app/core/model_catalog.py` 会用池内可用 credential 判断 provider 是否 configured，但 catalog 输出仍只暴露 credential id/status/cooldown/failure metadata。
- `backend/app/tools/model_provider_client.py` 的远端 chat model-ref 调用会选择 active 且未冷却的 least-recently-used credential pool entry，将其 `api_key` 用于实际 provider 请求，并把不含 secret 的 `{credential_id,status,source,last_used_at?}` 写入返回 meta 与模型调用上下文。
- `backend/app/core/storage/model_log_store.py` 会把 `provider_credential` 写入 `graph_model_calls.metadata_json` 并在模型日志 API 中读回，形成不含 secret 的实际 credential 选择审计事实。
- `backend/app/core/storage/model_log_store.py` 会保留 `provider_credential_state_update`，前端 `frontend/src/pages/modelLogProviderDiagnostics.ts` 会把 credential 选择与状态更新归一化为 Model Logs 诊断模型，`ModelLogsPage.vue` 展示 credential/status/failure/timeline/evidence。
- `backend/app/core/model_provider_credentials.py` 提供 `update_provider_credential_pool_after_call`，会在保留池内 `api_key` 的同时更新选中 credential 的 `status`、`failure_count`、`cooldown_until` 和 `last_used_at`；失败按 failure count 写入短冷却，达到重复失败阈值后进入 `exhausted` 并清空 cooldown，成功会清理失败状态。过期的 `cooling_down` credential 会重新进入可选集合，并在返回 meta 中标记 `previous_status`。
- `backend/app/tools/model_provider_client.py` 会在真实 settings-backed chat model-ref 调用成功或失败后写回选中 credential 的状态；fixture-provided provider 配置不会产生 settings 副作用。
- `backend/app/core/model_provider_costs.py` 提供 provider pricing normalization、usage token normalization 和 USD cost estimate primitive；当 saved provider model 提供 `pricing.input_per_million_usd` / `pricing.output_per_million_usd` 时，runtime 可以从 provider usage 估算本次调用成本。
- `backend/app/api/routes_settings.py` 会保留已有模型 `pricing` metadata，避免 Model Providers 页面保存模型列表时冲掉手工或导入的价格配置。
- `backend/app/tools/model_provider_client.py` 会把节点级 `provider_cost_budget` 带入远端 chat model-ref 调用，结合 saved model pricing 和 provider `usage` 生成 `provider_cost_estimate`，包含 input/output/total tokens、分项成本、总成本、预算窗口和 `within_budget` / `over_budget` 决策。
- `backend/app/core/storage/model_log_store.py` 会在写入 `graph_model_calls.metadata_json` 时用同一 cost primitive 生成并读回 `provider_cost_estimate`，使模型日志能审计该次调用的预算判断。
- `backend/app/core/storage/model_log_store.py` 会在模型调用日志写入边界读取既有 `graph_model_calls`，按 `costBudget.window` 的 `node` / `run` / `day` / `month` 范围累计历史 `estimated_cost_usd`，并把 `previous_window_cost_usd`、`cumulative_cost_usd`、`cumulative_budget_status` 和 `budget_window_scope` 写回本次 `provider_cost_estimate`。
- `frontend/src/pages/modelLogProviderDiagnostics.ts` 会把 `provider_cost_estimate` 归一化为成本状态、估算成本、预算上限、窗口、token 和累计预算证据；`ModelLogsPage.vue` 会在模型日志详情中展示 Provider cost 诊断块。
- `backend/app/core/storage/model_log_store.py` 提供 `evaluate_provider_cost_budget_preflight`，可在 provider 调用前读取既有模型日志成本；当窗口内已用成本达到或超过 `costBudget.limitUsd` 时返回 `provider_cost_budget_preflight` blocked 决策。
- `backend/app/tools/model_provider_client.py` 会在真实远端 provider 调用前执行 cost budget preflight；如果窗口预算已耗尽，会抛出 `ProviderCostBudgetExceeded` 并跳过 provider 请求和 fallback，避免继续产生费用。
- `backend/app/core/schemas/node_system.py` 的 `costBudget` 支持 `onExceeded=request_approval`；`evaluate_provider_cost_budget_preflight` 会在预算耗尽时返回 `requires_approval` 和 `provider_cost_budget_approval_request`，`ProviderCostBudgetExceeded` 会携带该结构化 approval request，供后续 run/review surface 消费。
- `backend/app/core/runtime/node_handlers.py` 会把带有 approval request 的 `ProviderCostBudgetExceeded` 转为现有 `pending_permission_approval` pause；恢复时消费同一 approval record，并把 `provider_cost_budget_approval` 传给 `agent_response_generation` / provider client。`backend/app/tools/model_provider_client.py` 只在该 approval record 已批准时跳过本次 cost budget preflight，并把批准事实写入返回 meta；`backend/app/core/storage/model_log_store.py` 会保留这条 `provider_cost_budget_approval` metadata。
- `backend/app/core/schemas/node_system.py` 的 `costBudget` 还支持 `onExceeded=degrade_model`；`evaluate_provider_cost_budget_preflight` 会在预算耗尽时返回 `requires_degradation`，`backend/app/tools/model_provider_client.py` 会用现有 provider fallback resolver 选择权限和能力兼容的后备模型，跳过 primary provider 请求，并把 `provider_cost_budget_degradation`、降级触发原因和 fallback trace 写入返回 meta / model-call metadata。
- `backend/app/core/runtime/agent_response_generation.py`、`agent_action_input_generation.py` 和 `agent_subgraph_input_generation.py` 会把 `provider_cost_budget_degradation` 写入节点 runtime config，覆盖最终回复、Action 输入规划、Subgraph 输入规划以及各自结构化输出修复阶段。
- `frontend/src/pages/agentDiagnosticModel.ts` 会从 RunDetail node execution runtime config 中读取这些降级记录；`RunDetailPage.vue` 的 Agent Diagnostic 面板会展示 requested/selected model、预算上限、窗口已用成本、累计成本、preflight 状态和 `onExceeded=degrade_model` 证据。
- `backend/app/core/runtime/agent_response_generation.py`、`agent_action_input_generation.py` 和 `agent_subgraph_input_generation.py` 会把 provider cost estimate 写入各自 runtime config，结构化输出修复也保留对应成本估算。
- `backend/app/core/model_provider_rates.py` 提供 provider rate profile normalization 和单次调用 rate decision primitive；当前 decision 使用 provider usage 与节点 `rateProfile` 做 `audit_only` 判断，记录是否超过本次调用可观察到的 token/request/concurrency profile。
- `backend/app/tools/model_provider_client.py` 会把节点级 `provider_rate_profile` 带入远端 chat model-ref 调用，结合 provider `usage` 写入 `provider_rate_decision`。
- `backend/app/core/storage/model_log_store.py` 会在模型调用日志中生成并读回 `provider_rate_decision`，让模型日志能解释本次调用相对节点 rate profile 的单次判断。
- `frontend/src/pages/modelLogProviderDiagnostics.ts` 会把 `provider_rate_decision` 归一化为速率决策状态、请求/token/并发/mode 指标和 limit/reason 证据；`ModelLogsPage.vue` 会在模型日志详情中展示 Provider rate decision 诊断块。
- `frontend/src/pages/modelLogProviderDiagnostics.ts` 会把 `provider_cache_policy` / `provider_cache_decision` 归一化为缓存策略、mode、provider cache control、eligible 状态、reason、prefix/suffix 长度、invalidators 和 provider usage 证据；`ModelLogsPage.vue` 会在模型日志详情中展示 Provider cache 诊断块。
- `frontend/src/pages/modelLogProviderDiagnostics.ts` 会把 `provider_fallback_trace` 归一化为 fallback 决策、requested/selected 模型、失败候选数、fallback 候选数和候选/rejected/warning 证据；`ModelLogsPage.vue` 会在模型日志详情中展示 Provider fallback 诊断块。
- `backend/app/core/storage/model_log_store.py` 提供 `evaluate_provider_rate_profile_preflight`，可在 provider 调用前读取最近 60 秒同 provider 的 `graph_model_calls`，统计既有请求数和 usage tokens；当 `requests_per_minute` 或 `tokens_per_minute` 已经耗尽时返回 `provider_rate_profile_preflight` blocked 决策。
- `backend/app/tools/model_provider_client.py` 会在真实远端 provider 调用前执行 rate profile preflight；如果最近窗口已经耗尽请求或 token 配额，会抛出 `ProviderRateProfileExceeded` 并跳过 provider 请求和 fallback，避免明知超限仍发起网络调用。
- `backend/app/tools/model_provider_client.py` 会用节点 `rateProfile.concurrency` 获取进程内 provider 级并发 slot；当同 provider 正在执行的远端 chat 调用数达到上限时，返回 `provider_rate_profile_concurrency_gate` blocked 决策并在进入 provider transport 前阻断。
- `backend/app/tools/model_provider_client.py` 会在远端 chat 调用前按 system/user prompt、结构化输出 schema 和文本附件估算本次请求 token；`backend/app/core/storage/model_log_store.py` 的 `evaluate_provider_rate_profile_preflight` 会把该估算加到最近窗口 token 上，当 projected total 超过 `tokens_per_minute` 时返回 `provider_rate_profile_projected_window_exhausted`。
- `backend/app/core/storage/model_log_store.py` 会在 rate preflight blocked 决策中基于窗口内最早会过期的模型调用计算 `retry_after_seconds` 和 `retry_after_at`，让后续 queue/wait/retry 可以使用同一可审计决策事实，而不是重新推断等待时间。
- `backend/app/core/schemas/node_system.py` 的 `rateProfile` 支持 `waitStrategy` 和 `maxWaitSeconds`；`backend/app/tools/model_provider_client.py` 在显式 `waitStrategy=wait` 且累计等待不超过上限时会多次等待并重新执行 preflight，并用内部最大尝试次数避免零秒 retry 卡住；默认策略仍是立即阻断。
- `backend/app/tools/model_provider_client.py` 为显式 `waitStrategy=wait` 的 blocked preflight 增加进程内 provider 级 FIFO wait 队列；同一 provider 的后续 waiter 会排队进入 sleep/retry 段，避免多个调用在同一个 `retry_after_seconds` 后同时醒来并冲击 provider。
- `backend/app/core/storage/database.py` 增加 `provider_rate_reservations` 表；`backend/app/core/storage/model_log_store.py` 提供 `reserve_provider_rate_profile_capacity` / `release_provider_rate_reservation`，并让 rate preflight 把 active reservation 的请求数与预估 token 纳入最近窗口统计。
- `backend/app/tools/model_provider_client.py` 会在远端 provider 调用前创建 DB-backed rate reservation，并在 provider 调用完成或失败后释放；同一数据库上的其他进程/线程 preflight 能看到这条 in-flight 预留，避免只统计已完成日志造成并发超发。
- `backend/app/tools/model_provider_client.py` 会把本次 `provider_rate_reservation` 写入返回 meta；provider 调用期间的模型日志上下文保留 reserved 状态，调用返回 meta 会带上 released 状态和 `released_at`，便于后续 UI 解释容量预留生命周期。
- `backend/app/core/storage/model_log_store.py` 会在模型日志读写路径保留 `provider_rate_reservation` 字段，和 `provider_rate_decision` / `provider_cost_estimate` 一样成为模型调用可审计 metadata。
- `frontend/src/pages/modelLogProviderDiagnostics.ts` 会把模型日志中的 `provider_rate_reservation` 归一化为状态、容量指标、生命周期时间线和 preflight 窗口证据；`frontend/src/pages/ModelLogsPage.vue` 会在日志详情中展示速率预留诊断块，让用户能直接看到 reservation 是否已释放、预估 token 和窗口占用情况。
- `backend/app/core/storage/database.py` 增加 `provider_rate_wait_queue` 表；`backend/app/core/storage/model_log_store.py` 提供 enqueue / claim turn / release 原语，支持同 provider wait entry 的 DB FIFO 顺序、过期队首清理和 released/expired/acquired 状态审计。
- `backend/app/tools/model_provider_client.py` 会把 `rateProfile.waitStrategy=wait` 的等待段接入 DB-backed wait queue；进程内 condition 只负责本进程快速唤醒，DB 状态成为跨进程的队列事实源。
- `frontend/src/pages/agentDiagnosticModel.ts` 会在 RunDetail Provider Profile 诊断中展示 wait 策略，例如 `wait up to 3.5s`，让用户能看到节点是否允许 provider rate wait/retry。
- `backend/app/core/runtime/agent_response_generation.py`、`agent_action_input_generation.py` 和 `agent_subgraph_input_generation.py` 会把 provider rate decision 写入各自 runtime config，结构化输出修复也保留对应 rate decision。

增强内容：

- LLM 节点不再只能依赖全局 provider timeout；同一图中不同 Agent 节点可以按任务风险和耗时特征设置请求超时。
- Action 输入规划、动态 Subgraph 输入规划、最终回复和结构化输出修复都使用同一节点级 timeout profile，避免多阶段 Agent 节点出现不一致的 provider 行为。
- `cachePolicy=disabled` 已从“仅存在于 runtime config”推进到 prompt cache audit decision；RunDetail 和模型日志后续可以从同一 prompt snapshot 事实解释为什么某轮不会尝试 cache 复用。
- `cachePolicy=prefer` 在 Anthropic transport 上已从“仅审计”推进到实际 provider cache-control payload；RunDetail 和模型日志后续可以区分 provider 已应用、provider 不支持、或 policy 不符合条件。
- `cachePolicy=prefer` 在官方 OpenAI Chat Completions provider 上已从“仅审计”推进到 `prompt_cache_key` payload；返回 usage 中的 cached token 数会进入 provider cache 诊断，模型日志也会回填 provider 应用结果。
- `cachePolicy=prefer` 在 Codex Responses transport 上也会下发 `prompt_cache_key` payload；Responses 返回的 cached token 数进入同一 `provider_prompt_cache_result` 合同，让 Codex provider cache 结果可以被 Model Logs cache 诊断消费。
- `cachePolicy=prefer` 在 Gemini generateContent transport 上会先查找同 scope 未过期的 `cachedContents` 资源，命中时直接复用，未命中时才创建新资源并引用 `cachedContent`；这样 Gemini 的显式 prompt cache 也进入同一 provider cache 诊断合同，Model Logs 可以展示 cache creation/read token、资源状态、过期时间和跨 run created/reused 命中率。
- 非官方 OpenAI-compatible provider 的 prompt cache 现在有显式 opt-in：用户在 Model Providers 能力矩阵为具体模型打开 `Prompt cache` 后，runtime 才会下发 `prompt_cache_key`；没有打开时仍以 `not_supported` 记录诊断，避免对未知兼容网关发送它可能不接受的字段。
- 模型请求日志现在保留 provider profile runtime context，后续成本估算、限速执行、credential 选择和 provider cache payload 都可以写入同一个 model-call 事实源，而不需要另开隐藏诊断链路。
- RunDetail Agent Diagnostic 不再只显示 provider fallback；它现在也能展示当前节点 provider profile 的请求超时、cache 决策、成本预算、预算超限策略和速率 profile，使节点级配置变成可见诊断事实。
- Provider settings 现在拥有可审计的 credential pool schema；后续冷却诊断、失败隔离和实际 credential 选择都可以复用同一设置与 catalog 事实源，而不是临时塞入 provider client 内部状态。
- RunDetail 的上下文审计面板现在能直接展示 prompt cache 的请求策略和 provider cache control，便于区分“节点要求禁用 cache”和“provider payload 尚未应用”。
- credential pool 已从纯 metadata 前进到实际 chat provider 请求的 key 选择，并且模型日志会记录选中的 credential id；用户可以审计“本次模型调用用了哪个 credential”，同时不会把 API key 暴露到 catalog、RunDetail 或前端 payload。
- credential pool 现在会根据真实 provider 调用结果更新本地状态：失败会递增 `failure_count` 并写入 `cooling_down` / `cooldown_until`，成功会恢复为 `active` 并清空失败状态。这样后续调用可以自然避开刚失败的 key，而不是把状态永远停留在只读 UI metadata。
- credential pool 现在会记录每次真实调用的 `last_used_at`，并优先选择最久未使用或从未使用的 active credential。这样多 key provider 不再长期偏向列表中的第一把 key，冷却恢复后的 key 也会根据最近使用时间参与轮换。
- credential pool 现在会把连续失败达到阈值的 credential 标记为 `exhausted`，并从后续选择路径中隔离出去；其他 active credential 仍可继续被选择，避免一个长期坏掉的 key 在 cooldown 过后反复回到请求路径。
- `costBudget` 已从纯 profile 进入单次 provider call 的可审计成本估算：当模型有 pricing metadata 时，运行时会把 usage 变成 USD estimate，并记录预算是否超限。
- 模型日志现在能对 `costBudget` 做跨调用累计审计：同一个 root run 的父/子 run 模型调用会累加到同一个 run 窗口，第二次及之后的调用可以显示本次调用前窗口已用成本、合计成本和累计预算状态。
- `costBudget` 现在也有执行前保护：当既有窗口成本已经耗尽预算时，provider client 会在网络请求前阻断本次模型调用，并且不会尝试 fallback 绕过同一个预算窗口。
- `costBudget.onExceeded=request_approval` 现在能把预算耗尽从单纯错误升级为结构化审批请求事实：preflight decision 会说明预算窗口、limit、已用成本、requested action 和 approval request，provider client 的异常也会携带该结构，作为标准 review/resume surface 的输入。
- `costBudget.onExceeded=request_approval` 现在接入了现有 pause/resume approval surface：预算耗尽会暂停当前 Agent 节点，RunDetail/Buddy 暂停面可以用既有批准/拒绝 resume payload 继续；批准后仅放行这一次 provider 调用，并把 approval record 留在 run 和 model-call metadata 中，方便追溯“是谁批准了预算超限”。
- `costBudget.onExceeded=degrade_model` 现在把预算耗尽从“直接失败”升级为显式降级执行策略：runtime 使用现有 provider fallback 候选筛选能力和权限兼容模型，拒绝权限扩张候选，跳过 primary provider 请求，并在 meta 中记录被耗尽的预算窗口、requested/selected model ref、降级原因和 fallback trace。
- RunDetail Agent Diagnostic 现在会直接展示预算降级 trace：最终回复、Action 输入规划和 Subgraph 输入规划的 runtime config 都会保留 `provider_cost_budget_degradation`，用户可以在运行详情里看到 requested/selected model、预算窗口成本和 preflight 证据，而不需要跳到模型日志或展开 raw runtime JSON。
- `rateProfile` 已从纯 profile 进入单次 provider call 的可审计 rate decision：运行时会把 usage 与请求/Token/并发 profile 对照，记录 `within_profile` 或 `over_limit`。
- `rateProfile` 现在也有最近窗口执行前保护：provider client 会在网络请求前读取同 provider 最近 60 秒已完成模型调用；如果请求数或 token 数已经达到节点 profile 限额，会阻断本次调用并避免 fallback 绕过同一速率窗口。
- `rateProfile.concurrency` 现在有进程内执行 gate：同一 provider 的并发远端 chat 调用达到节点上限时，第二条调用会在 provider transport 前被阻断，并且不会通过 fallback 绕过同一并发限制。
- `tokensPerMinute` 不再只等 provider 返回 usage 后才发现超限：运行时会在请求前用 prompt/schema/文本附件估算本次 token，并在 projected window 会超过限额时阻断，减少明知会超限仍发送 provider 请求的情况。
- rate preflight 的 blocked 决策现在带有窗口释放时间：上层不用再次扫描模型日志就能知道可等待多久，为后续真正的 queue/wait/retry 执行器提供稳定输入。
- 节点现在可以显式选择 `rateProfile.waitStrategy=wait`：当 rate preflight 给出可接受的 `retry_after_seconds` 时，provider client 会在 `maxWaitSeconds` 预算内循环等待并重试 preflight，避免连续短窗口释放时仍直接失败；默认 `block` 仍保持原来的快速失败行为。
- 进程内 provider 级 FIFO wait 队列让多个同 provider 的等待型调用按顺序进入等待/重试段，减少局部 stampede；DB-backed reservation 则补上跨进程可见的请求/Token 占用事实。
- DB-backed in-flight reservation 让 provider 请求在网络调用期间占住请求数和预估 token 容量；同一数据库的其他 TooGraph 进程会在 preflight 中看到 `reserved_requests` / `reserved_total_tokens`，从而减少并发进程间的超发窗口。
- reservation 生命周期现在进入返回 meta 和模型日志 metadata：用户后续可以从同一个 model-call 事实源看到 reservation id、预估 token、reserved/released 状态与释放时间，而不需要查询内部表。
- Model Logs 详情页现在会把 reservation metadata 呈现为速率预留诊断：状态 pill、provider/model/预估 token/window 指标、reserved/released/expires 时间线以及 observed/reserved/projected 窗口证据都来自同一 model-call 事实源，用户无需阅读 raw JSON 才能判断一次调用是否正确持有和释放容量。
- provider rate wait queue 已从进程内 `deque` 升级为 DB-backed FIFO：多个 TooGraph 进程可以围绕同一个 provider queue key 看到等待者、队首 acquisition 和过期清理，降低跨进程等待型调用在同一释放窗口同时醒来造成的局部冲击。
- Model Logs 详情页现在会把 provider credential metadata 呈现为凭据诊断：状态 pill、credential/source/status/failure 指标、last-used/cooldown 时间线，以及 failure 后状态变化、失败计数变化、cooldown 清理等证据 chips 都来自同一 model-call 事实源。
- Model Logs 详情页现在会把 provider cost/rate metadata 呈现为成本与速率决策诊断：用户可以直接看到 estimated cost、budget limit、累计预算状态、单次请求/token 限额、over-limit reason 和触发的 limit，而不需要展开 raw JSON。
- Model Logs 详情页现在会把 provider cache metadata 呈现为缓存决策诊断：用户可以直接看到 requested policy、runtime mode、provider cache control、eligible/ineligible、禁用或不应用 reason、prefix/suffix 规模、invalidators 和 cache usage，而不需要展开 raw JSON；列表顶部还会展示当前查询范围内的 cache hit rate、cache resource active/expired/total 和 cache token read/create 汇总，保留设置会同步控制终止 cache resource 的 pruning 窗口。
- Model Logs 详情页现在会把 provider fallback metadata 呈现为 fallback 诊断：用户可以直接看到 primary provider 为什么失败、哪些 fallback/rejected 候选参与选择、最终选中哪个模型，以及能力/权限/warning 证据，而不需要展开 raw JSON。
- Model Logs 详情页现在会把 `provider_cost_budget_degradation` 呈现为预算降级诊断：用户可以直接看到 requested/selected model ref、预算上限、窗口已用成本、preflight 状态与原因、累计成本和 `onExceeded=degrade_model` 策略证据，而不需要展开 raw JSON。
- credential pool metadata 仍保留为可审计 runtime/settings profile，预算降级、Gemini cachedContent 创建/复用/TTL/pruning 生命周期和 compatible provider `prompt_cache` opt-in 已复用同一 provider fallback/runtime config/model-call metadata 事实源；后续 provider-specific cache adapter 也可以按同一 `provider_prompt_cache_result` 合同逐步扩展。

验证方式：

- `pytest backend/tests/test_agent_runtime_config.py backend/tests/test_agent_response_generation.py::AgentResponseGenerationTests::test_passes_provider_timeout_override_to_provider_client backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_explicit_request_timeout_overrides_saved_profile -q`
- `pytest backend/tests/test_agent_response_generation.py::AgentResponseGenerationTests::test_provider_cache_policy_disabled_marks_prompt_cache_decision -q`
- `pytest backend/tests/test_agent_response_generation.py::AgentResponseGenerationTests::test_model_call_context_includes_provider_profile_decisions backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_model_request_log_preserves_provider_profile_context -q`
- `node --test frontend/src/pages/agentDiagnosticModel.test.ts frontend/src/pages/runDetailModel.test.ts frontend/src/pages/RunDetailPage.structure.test.ts`
- `PYTHONPATH=backend pytest backend/tests/test_settings_model_providers.py -q`
- `node --test frontend/src/pages/settingsPageModel.test.ts frontend/src/pages/ModelProvidersPage.structure.test.ts`
- `PYTHONPATH=backend pytest backend/tests/test_agent_response_generation.py::AgentResponseGenerationTests::test_provider_cache_policy_prefer_records_provider_applied_decision backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_anthropic_applies_preferred_prompt_cache_control -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_openai_compatible_applies_prompt_cache_key_for_openai_provider backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_backfills_provider_cache_result_to_model_log -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_codex_responses_applies_prompt_cache_key -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_gemini_creates_cached_content_for_preferred_prompt_cache -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_gemini_reuses_cached_content_resource_before_expiry backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_gemini_does_not_reuse_expired_cached_content_resource backend/tests/test_storage_database.py::StorageDatabaseTests::test_initialize_storage_creates_graph_run_schema -q`
- `node --test frontend/src/pages/modelLogProviderDiagnostics.test.ts`
- `PYTHONPATH=backend pytest backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_model_request_logs_report_provider_cache_hit_rate_and_resources -q`
- `node --test frontend/src/api/modelLogs.test.ts frontend/src/pages/ModelLogsPage.structure.test.ts`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_applies_prompt_cache_key_for_compatible_provider_opt_in backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_does_not_apply_prompt_cache_key_without_compatible_opt_in -q`
- `PYTHONPATH=backend pytest backend/tests/test_agent_runtime_config.py::AgentRuntimeConfigTests::test_provider_cost_budget_degrade_model_strategy_is_exposed_for_runtime_calls backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_degrades_model_when_cost_budget_preflight_is_exhausted backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_provider_cost_budget_preflight_marks_approval_strategy_when_window_is_exhausted -q`
- `PYTHONPATH=backend pytest backend/tests/test_agent_response_generation.py backend/tests/test_agent_action_input_generation.py backend/tests/test_agent_subgraph_input_generation.py backend/tests/test_model_provider_client.py backend/tests/test_model_request_logs.py -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_selects_active_credential_from_pool backend/tests/test_settings_model_providers.py::SettingsModelProviderTests::test_update_settings_preserves_provider_credential_pool_api_keys_when_payload_omits_them backend/tests/test_settings_model_providers.py::SettingsModelProviderTests::test_catalog_exposes_provider_credential_pool_metadata backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_model_request_log_preserves_provider_profile_context -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_client.py backend/tests/test_settings_model_providers.py backend/tests/test_model_request_logs.py -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_estimates_provider_cost_from_model_pricing backend/tests/test_agent_response_generation.py::AgentResponseGenerationTests::test_passes_provider_cost_budget_and_records_cost_estimate backend/tests/test_settings_model_providers.py::SettingsModelProviderTests::test_update_settings_preserves_existing_model_pricing_when_payload_omits_it backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_model_request_log_preserves_provider_profile_context -q`
- `PYTHONPATH=backend pytest backend/tests/test_agent_response_generation.py backend/tests/test_agent_action_input_generation.py backend/tests/test_agent_subgraph_input_generation.py backend/tests/test_model_provider_client.py backend/tests/test_settings_model_providers.py backend/tests/test_model_request_logs.py -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_records_provider_rate_decision_from_profile backend/tests/test_agent_response_generation.py::AgentResponseGenerationTests::test_passes_provider_rate_profile_and_records_rate_decision backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_model_request_log_preserves_provider_profile_context -q`
- `PYTHONPATH=backend pytest backend/tests/test_agent_response_generation.py backend/tests/test_agent_action_input_generation.py backend/tests/test_agent_subgraph_input_generation.py backend/tests/test_model_provider_client.py backend/tests/test_settings_model_providers.py backend/tests/test_model_request_logs.py -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_credentials.py backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_updates_selected_credential_cooldown_after_provider_failure backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_clears_selected_credential_failure_state_after_success -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_credentials.py backend/tests/test_model_provider_client.py backend/tests/test_settings_model_providers.py -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_provider_cost_budget_accumulates_across_root_run_model_calls -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_request_logs.py -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_provider_cost_budget_preflight_blocks_when_window_is_exhausted backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_blocks_provider_call_when_cost_budget_preflight_is_exhausted -q`
- `PYTHONPATH=backend pytest backend/tests/test_agent_runtime_config.py::AgentRuntimeConfigTests::test_provider_profile_override_is_exposed_for_runtime_calls backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_provider_cost_budget_preflight_marks_approval_strategy_when_window_is_exhausted backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_cost_budget_exception_exposes_approval_request -q`
- `PYTHONPATH=backend pytest backend/tests/test_node_handlers_runtime.py::NodeHandlersRuntimeTests::test_execute_agent_node_pauses_for_provider_cost_budget_approval_request backend/tests/test_node_handlers_runtime.py::NodeHandlersRuntimeTests::test_execute_agent_node_resumes_provider_cost_budget_approval_with_runtime_override backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_approved_cost_budget_overrun_skips_preflight_block backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_model_request_log_preserves_provider_profile_context -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_provider_rate_profile_preflight_blocks_when_minute_window_is_exhausted backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_blocks_provider_call_when_rate_profile_preflight_is_exhausted -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_blocks_second_call_when_rate_profile_concurrency_is_exhausted -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_provider_rate_profile_preflight_blocks_when_projected_request_tokens_exceed_window backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_blocks_provider_call_when_estimated_request_tokens_exceed_rate_profile -q`
- `PYTHONPATH=backend pytest backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_provider_rate_profile_preflight_reports_retry_after_for_recent_window_exhaustion -q`
- `PYTHONPATH=backend pytest backend/tests/test_agent_runtime_config.py::AgentRuntimeConfigTests::test_provider_profile_override_is_exposed_for_runtime_calls backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_model_request_log_preserves_provider_profile_context backend/tests/test_model_request_logs.py::ModelRequestLogTests::test_provider_rate_profile_preflight_counts_active_reservations backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_waits_and_retries_rate_profile_preflight_when_configured backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_waits_multiple_rate_profile_windows_within_budget backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_rate_profile_wait_preflight_uses_fifo_queue_for_same_provider backend/tests/test_model_provider_client.py::ModelProviderClientTests::test_chat_with_model_ref_holds_rate_reservation_during_provider_call -q`
- `node --test frontend/src/pages/agentDiagnosticModel.test.ts`
- `node --test frontend/src/pages/modelLogProviderDiagnostics.test.ts frontend/src/pages/ModelLogsPage.structure.test.ts`
- `PYTHONPATH=backend pytest backend/tests/test_model_request_logs.py backend/tests/test_model_provider_client.py backend/tests/test_agent_response_generation.py backend/tests/test_agent_action_input_generation.py backend/tests/test_agent_subgraph_input_generation.py backend/tests/test_settings_model_providers.py backend/tests/test_model_provider_credentials.py -q`

## 5. 未完成内容与实现方案

### 阶段 A：Provider profile 完整化

目标：把 provider runtime 从“可 fallback、可设置超时”推进到“可按节点和能力精细控制”。

当前缺口：

- prompt cache 已能在 audit metadata 中体现节点级 `cachePolicy=disabled` 的实际禁用决策，`cachePolicy=prefer` 已在 Anthropic Messages transport 下发 provider-specific `cache_control`，已在官方 OpenAI Chat Completions provider 与 Codex Responses transport 下发 `prompt_cache_key`，已在 Gemini generateContent transport 创建/引用 `cachedContents`，并能把 Gemini `cachedContents` 资源保存到本地 DB，在同一 provider/model/credential/cache key 下复用未过期资源、跳过过期资源和记录资源状态；Model Logs 已能按当前查询范围展示 cache hit rate、resource status 和 token 汇总，并通过保留设置 pruning 过期或被替代的 cache resource；非官方 OpenAI-compatible 模型也已通过 `prompt_cache` capability 显式 opt-in `prompt_cache_key`。剩余工作转向更多 provider-specific cache adapter。
- credential pool 已有设置 schema、UI 诊断摘要、secret-preserving save path、catalog configured 判断、chat provider runtime 的 least-recently-used active credential 选择、真实调用后的 failure/cooldown/last-used/exhausted 写回，以及 Model Logs 与 RunDetail 的 credential/cost/rate/cache/fallback/预算降级状态诊断。
- 节点级 `providerProfile` 已经系统化到图协议和 runtime config，`requestTimeoutSeconds` 已进入实际 LLM 调用，`cachePolicy=disabled` 已进入 prompt cache 审计决策，Anthropic `cachePolicy=prefer`、官方 OpenAI Chat Completions `prompt_cache_key`、Codex Responses `prompt_cache_key`、Gemini `cachedContents` 创建/复用/TTL 过期和 compatible provider `prompt_cache` opt-in 已进入 provider payload，并且 provider profile/cache/fallback/cost/rate runtime context 已写入 model call meta；chat provider runtime 已能记录实际 credential 选择、least-recently-used credential 轮换、repeated-failure credential exhausted 隔离、基于单次 usage/pricing 的 cost estimate、模型日志中的跨调用 cost budget 累计、预算耗尽后的 preflight 阻断、预算审批放行、显式模型降级、单次 rate decision、最近 60 秒 `rateProfile` 请求/Token preflight 阻断、进程内 `rateProfile.concurrency` gate、请求 token 预测阻断、retry-after 诊断、显式预算内多次等待重试、进程内 provider 级 FIFO wait 队列、DB-backed in-flight 请求/Token 预留、reservation meta/log 诊断事实、Model Logs reservation/cache/cache-resource/hit-rate/fallback/预算降级诊断 UI、DB-backed provider rate wait queue，以及 credential failure/cooldown 状态写回。
- 预算超限后已经能生成结构化 approval request，接入标准 pause/resume approval surface 执行一次性经审批预算放行，也能在 `onExceeded=degrade_model` 时改走兼容 fallback 模型；剩余工作集中在更完整 provider-specific cache adapters。

实现方案：

1. 已完成：在 `NodeSystemAgentConfig` 增加 `providerProfile` 字段，覆盖 request timeout、cache policy、cost budget 和 rate profile。
2. 已完成：在 `backend/app/core/runtime/agent_runtime_config.py` 统一解析节点级 override，并把 `requestTimeoutSeconds` 传给 `chat_with_model_ref_with_meta` / local LLM 调用路径。
3. 已完成：把 `provider_cache_policy` 传入 prompt snapshot，让 `cachePolicy=disabled` 生成明确的 prompt cache audit decision，并覆盖最终回复、Action 输入规划、Subgraph 输入规划和结构化输出修复。
4. 已完成：RunDetail prompt snapshot 审计保留并展示 `requested_policy`，让节点请求策略与 provider cache-control 决策可以在 UI 上区分。
5. 已完成：把 provider profile runtime context 和 prompt cache decision 写入 model call context / `graph_model_calls.metadata_json`，并在模型日志 API 类型中显式暴露。
6. 已完成：RunDetail Agent Diagnostic 增加 Provider Profile 展示，覆盖请求超时、cache policy/cache decision、成本预算和速率 profile。
7. 已完成：在 provider settings 中增加 credential pool schema，记录 credential id、状态、冷却时间、失败计数，并通过 model catalog 与 Model Providers 高级设置展示只读诊断摘要。
8. 已完成：将 Anthropic `cachePolicy=prefer` 转换为 provider-specific `cache_control`，并在 prompt cache audit 中记录 provider 实际是否应用 cache-control。
9. 已完成：在 chat model-ref provider runtime 中选择 active credential pool entry，并在 model call meta / model log 中写入不含 secret 的实际 credential 选择。
10. 已完成：当 saved model 含 pricing metadata 时，在 model call meta / runtime config / model log 中写入单次 provider cost estimate 和 cost budget decision。
11. 已完成：在 model call meta / runtime config / model log 中写入单次 `audit_only` provider rate decision，记录本次调用 usage 是否超过节点 `rateProfile`。
12. 已完成：把 credential 失败后的 `failure_count` / `cooldown_until` 状态写回 settings；成功调用会清理失败状态，过期 `cooling_down` credential 会重新进入可选集合。
12a. 已完成：credential pool 写入 `last_used_at` 并按 least-recently-used 选择 active credential，避免多 key provider 长期固定使用列表第一项。
12b. 已完成：credential pool 对重复失败达到阈值的 credential 写入 `exhausted`，该状态会被 credential selection 跳过，从而隔离长期失败的 key。
13. 已完成：在模型日志写入时按 `costBudget.window` 累计既有模型调用成本，记录窗口范围、调用前成本、本次后累计成本和累计预算状态。
14. 已完成：在 provider 请求前执行 cost budget preflight；当既有窗口成本已达到 `limitUsd` 时阻断模型调用，并避免 fallback 绕过预算。
14a. 已完成：扩展 `costBudget.onExceeded=request_approval`；预算耗尽时 preflight 会返回 `requires_approval` 和 `provider_cost_budget_approval_request`，provider client 异常会携带该结构化审批请求，暂不自动放行或隐藏降级。
14b. 已完成：把 `provider_cost_budget_approval_request` 接入现有 `pending_permission_approval` pause/resume surface；批准恢复后 runtime 会传递 `provider_cost_budget_approval`，provider client 仅对这一次已批准调用跳过 budget preflight，并把 approval record 写入 meta/model log。
15. 已完成：在 provider 请求前执行 `rateProfile` 最近窗口 preflight；当同 provider 最近 60 秒请求数或 token 数已经达到节点限额时阻断模型调用，并避免 fallback 绕过速率窗口。
16. 已完成：在 provider 请求期间获取进程内 `rateProfile.concurrency` slot；当同 provider 活跃调用数达到上限时阻断后续调用，并避免 fallback 绕过并发 gate。
17. 已完成：在 provider 请求前估算本次 prompt/schema/文本附件 token，并把 projected window token 加入 `tokensPerMinute` preflight；当 projected total 超出限额时阻断本次调用。
18. 已完成：rate preflight blocked 决策会返回 `retry_after_seconds` 和 `retry_after_at`，说明当前窗口最早何时释放到可重试状态。
19. 已完成：扩展 `rateProfile.waitStrategy` / `maxWaitSeconds`；显式 `wait` 策略会在累计等待预算内多次 sleep 并重试 preflight，RunDetail 会展示 wait 策略。
20. 已完成：为 `waitStrategy=wait` 的 blocked preflight 增加进程内 provider 级 FIFO wait 队列，同一 provider 的 waiter 会按顺序进入 sleep/retry 段，减少并发等待后的局部 stampede。
21. 已完成：增加 DB-backed in-flight 请求/Token reservation；provider client 在远端调用期间持有 reservation，rate preflight 会把 active reservation 计入 `reserved_requests` / `reserved_total_tokens` 后再判断请求数与 token 窗口。
22. 已完成：把 `provider_rate_reservation` 写入 provider 调用返回 meta 和模型日志 metadata；日志保留 reserved 状态，返回 meta 合并 released 状态与释放时间。
23. 已完成：Model Logs 详情页增加 reservation 诊断 UI；前端诊断模型会归一化 `provider_rate_reservation` 的状态、容量指标、时间线和 preflight 窗口证据，页面以紧凑诊断块展示 released/reserved/blocked 状态。
24. 已完成：增加 DB-backed provider rate wait queue；等待型 rate preflight 会写入 `provider_rate_wait_queue`，按 queue key FIFO claim turn，释放后标记 released，过期队首会被清理为 expired，跨进程能共享等待顺序事实。
24a. 已完成：Model Logs 详情页增加 provider credential 诊断 UI；模型日志保留 `provider_credential_state_update`，前端诊断模型会归一化 credential 选择、状态、失败计数、last-used/cooldown 时间线和状态变化证据。
24b. 已完成：Model Logs 详情页增加 provider cost/rate 诊断 UI；前端诊断模型会归一化 `provider_cost_estimate` 和 `provider_rate_decision`，展示估算成本、预算窗口、累计预算状态、请求/token 限额、over-limit reason 和触发 limit。
24c. 已完成：Model Logs 详情页增加 provider cache 诊断 UI；前端诊断模型会归一化 `provider_cache_policy` / `provider_cache_decision`，展示 requested policy、mode、provider cache control、eligible 状态、reason、prefix/suffix 长度、invalidators 和 cache usage。
24d. 已完成：Model Logs 详情页增加 provider fallback 诊断 UI；模型日志会保留并补写 `provider_fallback_trace`，前端诊断模型会展示 requested/selected 模型、失败候选数、fallback 候选数、rejected reason、能力/权限要求和 warning。
24e. 已完成：官方 OpenAI Chat Completions provider 增加 `prompt_cache_key` payload；provider runtime 会用 prompt snapshot 的 `cache_key` 路由 prompt cache，并把 provider cache 应用结果和 cached token 用量回填到 model-call metadata。
24f. 已完成：Codex Responses transport 增加 `prompt_cache_key` payload；provider runtime 会复用 prompt snapshot 的 `cache_key`，在 Responses payload 中显式请求 prompt cache，并把 Responses usage 的 cached token 数回填到同一 `provider_prompt_cache_result` 合同。
24g. 已完成：`costBudget.onExceeded=degrade_model` 显式预算降级策略；预算 preflight 已耗尽时，provider client 会跳过 primary provider 请求，用现有 fallback resolver 选择能力和权限兼容的后备模型，拒绝权限扩张候选，并把 `provider_cost_budget_degradation` 与 fallback trace 写入返回 meta / model-call metadata。
24h. 已完成：Model Logs 详情页增加预算降级诊断 UI；前端诊断模型会归一化 `provider_cost_budget_degradation`，展示 requested/selected model ref、预算上限、窗口已用成本、preflight 状态/原因、累计成本和 `onExceeded=degrade_model` 证据。
24i. 已完成：RunDetail Agent Diagnostic 增加预算降级诊断 UI；模型调用 meta 中的 `provider_cost_budget_degradation` 会进入最终回复、Action 输入规划和 Subgraph 输入规划 runtime config，RunDetail 会展示 requested/selected model ref、预算上限、窗口成本、preflight 状态和策略证据。
24j. 已完成：Gemini generateContent transport 增加显式 `cachedContents` resource flow；当 prompt cache policy 为 `prefer` 且稳定 system prompt eligible 时，runtime 会创建缓存资源、生成请求引用 `cachedContent`，并把缓存创建/读取 token 写入 `provider_prompt_cache_result.usage`，供模型日志 cache 诊断复用。
24k. 已完成：非官方 OpenAI-compatible provider 增加显式 `prompt_cache` capability opt-in；Model Providers 能力矩阵可为具体模型打开 Prompt cache，model-ref runtime 只有看到该 capability 时才下发 `prompt_cache_key`，否则保持 `not_supported` 诊断，避免隐藏发送兼容网关可能不支持的字段。
24l. 已完成：Gemini `cachedContents` 增加 DB-backed resource lifecycle；`provider_prompt_cache_resources` 会按 provider/transport/base URL/model/credential scope/cache key/stable prefix 保存资源，Gemini runtime 创建前优先复用未过期资源，lookup 时跳过并标记过期资源，返回 meta 和 Model Logs cache evidence 会展示 created/reused、资源名和过期时间，从而减少重复创建同一稳定前缀缓存并提升跨调用可审计性。
24m. 已完成：Model Logs 增加 provider cache summary；后端按当前日志查询范围聚合 cache decision、resource created/reused 命中率、cache token 和 resource status，前端在日志页顶部展示 hit rate、active/expired/total 资源和 read/create token，让跨 run prompt cache 效果可以直接观察。
24n. 已完成：cache resource 增加真实 pruning；`provider_prompt_cache_store` 会删除超过保留窗口的 expired/superseded 资源，模型日志保留设置新增 cache resource 保留天数，保存设置和常规模型日志 pruning 都会触发清理，避免 Gemini `cachedContents` 本地索引长期堆积，同时保留仍 active 且未过期的可复用资源。
25. 下一步：继续推进更多 provider-specific cache adapter。

建议验证：

- 新增/更新 `backend/tests/test_agent_runtime_config.py`、`backend/tests/test_agent_response_generation.py`、`backend/tests/test_agent_action_input_generation.py`、`backend/tests/test_agent_subgraph_input_generation.py`、`backend/tests/test_model_provider_client.py`、`backend/tests/test_model_request_logs.py`、`backend/tests/test_settings_model_providers.py`。
- 更新 `frontend/src/pages/ModelProvidersPage.structure.test.ts`、`frontend/src/pages/modelLogProviderDiagnostics.test.ts`、`frontend/src/pages/ModelLogsPage.structure.test.ts`、`frontend/src/pages/agentDiagnosticModel.test.ts`、`frontend/src/pages/RunDetailPage.structure.test.ts` 或相关结构测试。

### 阶段 B：Scheduler 外部投递闭环

目标：让当前 `external_delivery_requires_approval` 从审计记录升级为经审批后可执行的 adapter。

当前缺口：

- 外部 webhook/http delivery 已能在审批 API 通过后真实投递，并写入 redacted attempt；剩余缺口是 delivery 失败后还没有进入统一 retry policy。
- Scheduler UI 和 RunDetail 还没有集中展示 delivery attempt、response summary 和审批记录。

实现方案：

1. 已完成：增加 `scheduled_delivery_attempts` 记录每次投递尝试，保存 redacted target、request、response summary、error 和 attempt metadata。
2. 已完成：新增 scheduler delivery adapter，输入只接受已审批 job_run，并且只支持 webhook/http 外部投递目标；未审批路径仍保留 `external_delivery_requires_approval` 事实。
3. 已完成：审批通过后执行外部投递，并把 delivery result、approval 和 latest attempt 写回 job run metadata；敏感 header、authorization、token、secret 等字段不会落入 attempt/result。
4. 下一步：delivery 失败进入 retry policy，并让 Scheduler UI 和 RunDetail 展示 approval、delivery attempt、response summary 和 redacted target。

建议验证：

- 更新 `backend/tests/test_scheduler_store.py`、`backend/tests/test_scheduler_routes.py` 和 `backend/tests/test_storage_database.py`。
- 增加或维护 `backend/tests/test_scheduler_delivery.py` 的 mock HTTP 测试，断言敏感字段不落日志。
- 更新 `frontend/src/pages/schedulerPageModel.test.ts`。

### 阶段 B2：消息平台生产硬化

目标：把已经合并的消息平台基础入口升级到可长期运行、可诊断、可扩展的多入口能力。

当前缺口：

- 平台多模态消息还没有统一转换成通用 `state_bundle`。
- 凭据轮换、连接恢复、adapter 运行健康、delivery attempt 细节和失败重试诊断还不够完整。
- 当前平台覆盖集中在 Telegram 与 Feishu/Lark，更多平台需要复用同一 adapter 合同。

实现方案：

1. 在消息平台 ingress 增加 schema-backed `state_bundle`，让文本、图片、视频、音频和文件进入同一用户消息包。
2. 将 delivery attempt、placeholder replacement、平台 message id 和失败原因写入更完整的 audit / run metadata。
3. 给 binding secrets 增加轮换、失效标记和连接冷却策略。
4. 抽象 adapter health report，并在 Message Platforms 页面和 RunDetail 展示。
5. 增加更多平台 adapter 时只扩展 `backend/app/messaging/adapters/` 和 catalog，不改 Buddy 主循环。

建议验证：

- 扩展 `backend/tests/test_message_platform_runtime.py`、`backend/tests/test_message_platform_buddy_ingress.py`、`backend/tests/test_message_platform_routes.py`。
- 扩展 `frontend/src/pages/MessagePlatformsPage.structure.test.ts` 和 `frontend/src/pages/messagePlatformsPageModel.test.ts`。

### 阶段 C：Delegation 持久协作 board

目标：把当前一次性 worker board snapshot 升级成可跨 run 追踪的长期任务状态。

当前缺口：

- worker packet/result/merge 已存在，但 board snapshot 主要跟随单次 run。
- claim、ownership、长期任务状态、重试归属还没有表结构和 UI 操作。

实现方案：

1. 新增 delegation board 表：board、task、claim、worker run refs、status history。
2. 让 `delegation_kanban_board_builder` 支持从持久 board + 当前 worker 结果合成 snapshot。
3. RunDetail 保持单次诊断；Scheduler/Improvements 可引用长期 board。
4. UI 增加 claim/release/retry/history 操作，所有变更走 command/revision 或 run record。

建议验证：

- 新增 `backend/tests/test_delegation_board_store.py`。
- 扩展 `backend/tests/test_delegation_kanban_board_builder_tool.py`、`frontend/src/pages/agentDiagnosticModel.test.ts`。

### 阶段 D：记忆召回质量提升

目标：让 memory recall 从“能召回”提升到“能解释质量、能去重、能人工复核”。

当前缺口：

- 弱语义近似去重还偏保守。
- 召回质量报告还缺长期指标。
- 人工复核候选和 memory merge/split 流程还不完整。

实现方案：

1. 在 `memory_store.py` 引入 embedding 相似度阈值和 source overlap 判断，产出去重候选。
2. 新增 memory review candidate 状态：proposed_merge、approved_merge、rejected_merge。
3. `hybrid_recall_context_loader` 输出更完整 ranking report：lexical/vector/rerank/source diversity。
4. Evidence 页面展示召回原因、相似候选和人工操作入口。

建议验证：

- 更新 `backend/tests/test_memory_store.py`、`backend/tests/test_hybrid_recall_context_loader_tool.py`、`backend/tests/test_buddy_search_views.py`。
- 更新 `frontend/src/pages/EvidenceSearchPage.structure.test.ts`。

### 阶段 E：官方能力包端到端覆盖

目标：让官方 Action/Tool/Subgraph 的真实运行覆盖足够支撑 Hermes 级自治。

当前缺口：

- 高风险写入类 Action、Subgraph worker 组合、artifact 产物检查仍不够完整。
- 部分官方模板只有结构门禁，缺真实 graph run 证明。

实现方案：

1. 给高风险 Action 增加 package-specific tests 和 manifest verification commands。
2. 给关键官方模板增加真实 graph run 检查，重点覆盖 workspace executor、graph writer、page operator、delegation worker。
3. 让官方资产门禁按 changed paths 自动跑对应 package tests 和 graph run checks。
4. RunDetail 检查 artifact refs、permission waits、child run tree 和 output boundary。

建议验证：

- `npm run verify:official-assets`
- 对变更包运行对应 `backend/tests/test_*`。
- 对关键模板运行 `backend/tests/test_template_layouts.py` 和相关 graph run 测试。

## 6. 当前数据库事实源

当前统一数据库已经覆盖这些事实源：

| 事实源 | 主要表 |
| --- | --- |
| 图运行 | `graph_runs`、`graph_run_snapshots`、`graph_model_calls`、`content_blobs` |
| Agent loop / capability | `agent_loop_events`、`capability_usage_events` |
| Buddy 会话 | `buddy_sessions`、`buddy_messages`、`buddy_message_revisions`、`buddy_message_run_refs`、`buddy_session_summaries` |
| Buddy 写回与复盘 | `buddy_revisions`、`buddy_commands`、`buddy_background_review_runs`、`improvement_candidates` |
| Scheduler | `scheduled_graph_jobs`、`scheduled_graph_job_runs` |
| 消息平台 | `message_platform_bindings`、`message_platform_connection_status`、`message_platform_secrets`、`message_platform_sessions`、`message_platform_audit_events`、`message_platform_dedup` |
| Retrieval / Embedding | `retrieval_documents`、`retrieval_chunks`、`retrieval_queries`、`retrieval_results`、`embedding_models`、`embedding_vectors`、`embedding_jobs` |
| Memory | `memory_entries`、`memory_entry_sources`、`memory_revisions`、`memory_events` |

设计结论：

- 图运行相关展示应从 run record、node executions、state snapshots、activity events、output previews、artifact refs 和 child run tree 重建。
- Buddy 聊天历史应从原子 messages、summary refs、run refs 和 context assembly refs 重建。
- 长期稳定上下文和 DB 召回线并存，分别服务稳定注入和语义召回。

## 7. 非目标

本文档暂不追踪：

- Plugin / Extension 体系。
- 完整 RAG ingestion、外部资料收集、索引构建和知识问答产品链路。
- 内部质量门禁的用户可见产品化。

## 8. 验证建议

在继续后续开发前，建议先跑下面这组验证，确认当前路线文档对应的主干能力仍健康：

```bash
pytest backend/tests/test_agent_loop_guard_tool.py backend/tests/test_agent_loop_guard_e2e.py -q
pytest backend/tests/test_context_assembly_store.py backend/tests/test_buddy_store.py backend/tests/test_buddy_search_views.py -q
pytest backend/tests/test_memory_store.py backend/tests/test_embedding_store.py backend/tests/test_hybrid_recall_context_loader_tool.py -q
pytest backend/tests/test_buddy_background_review_routes.py backend/tests/test_toograph_capability_selector_action.py -q
pytest backend/tests/test_scheduler_store.py backend/tests/test_scheduler_routes.py backend/tests/test_scheduler_service.py -q
pytest backend/tests/test_model_provider_client.py backend/tests/test_settings_model_providers.py -q
pytest backend/tests/test_message_platform_buddy_ingress.py backend/tests/test_message_platform_runtime.py backend/tests/test_message_platform_store.py -q
pytest backend/tests/test_model_request_logs.py -q
node --test frontend/src/pages/agentDiagnosticModel.test.ts frontend/src/buddy/buddyOutputTrace.test.ts frontend/src/pages/runDetailModel.test.ts
node --test frontend/src/api/message-platforms.test.ts frontend/src/pages/MessagePlatformsPage.structure.test.ts frontend/src/api/modelLogs.test.ts frontend/src/pages/ModelLogsPage.structure.test.ts
npm --prefix frontend run build
git diff --check
```

如果只做文档检查：

```bash
git diff --check
rg -n "TO[D]O|TB[D]|待[补]" docs/hermes-agent-capability-parity-roadmap.md
```

## 9. 下一步开发建议

最合理的下一轮开发顺序：

1. Provider-specific cache adapter 扩展。Provider profile 主链路已基本落地，剩余适合按具体 provider/transport 继续补齐。
2. 消息平台生产硬化。基础入口已经合并，下一步补 `state_bundle`、delivery diagnostics、凭据轮换和 adapter health。
3. Scheduler 外部投递闭环。当前已经有 store、runner、retry、权限边界、审批后 webhook/http 投递和 attempt 记录，下一步是 delivery 失败重试链和 Scheduler/RunDetail 诊断 UI。
4. Delegation 持久 board。当前 worker 协议已经能跑，下一步需要长期状态、ownership 和 UI 操作。
5. 记忆召回质量提升。当前 recall 可用，下一步提高去重、解释性和人工复核。
6. 官方能力包端到端覆盖。作为所有能力继续扩展前的防回归基础。

继续开发前的判断标准：

- 当前文档中的“已完成增强”都能通过对应测试或 UI 入口验证。
- 当前文档中的“下一步”都有明确文件落点和测试落点。
- 新开发只扩展一个能力域，不同时混做 provider、scheduler、delegation 和 memory quality。

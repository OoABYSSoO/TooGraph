# TooGraph 追上 Hermes Agent 能力路线图

最后整理日期：2026-05-28。

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

- 主循环、上下文装配、历史、召回、能力选择、动态能力执行、后台复盘、权限暂停、provider fallback、上下文压缩、运行诊断、Buddy 胶囊重放、模型日志树和消息平台入口已经形成可用闭环。
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
| Provider runtime | `backend/app/tools/model_provider_client.py`、`backend/app/core/provider_fallback.py`、`backend/app/api/routes_settings.py`、`frontend/src/pages/ModelProvidersPage.vue` |
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
| Scheduler / Cron | 进行中 | job/store/API/runner/lifespan tick、retry policy、local delivery audit、权限边界 | `backend/tests/test_scheduler_store.py`、`backend/tests/test_scheduler_routes.py`、`backend/tests/test_scheduler_service.py`、`frontend/src/pages/SchedulerPage.vue` | 经审批的真实外部投递 adapter |
| Gateway / 多入口 / 消息平台 | 进行中 | Message Platforms 页面、Telegram / Feishu-Lark binding、runtime/adapters、外部消息进入 Buddy 会话、斜杠命令、可见回复投递、audit/dedup/session resolver | `backend/tests/test_message_platform_*.py`、`frontend/src/api/message-platforms.test.ts`、`frontend/src/pages/MessagePlatformsPage.structure.test.ts`、`frontend/src/pages/messagePlatformsPageModel.test.ts` | 多模态 `state_bundle`、生产级凭据/部署、外部投递诊断、更多平台 adapter |
| Delegation / Subagents / Kanban | 进行中 | worker packet/result/merge/board state、Batch/Subgraph worker、RunDetail/胶囊诊断 | `backend/tests/test_delegation_worker_result_packager_tool.py`、`backend/tests/test_delegation_worker_result_merger_tool.py`、`backend/tests/test_delegation_kanban_board_builder_tool.py`、`backend/tests/test_batch_node_system.py` | 持久 board、claim/ownership、长期任务状态 |
| Provider Runtime 与模型能力矩阵 | 进行中 | provider fallback trace、embedding/rerank fallback、模型能力矩阵、请求超时 profile | `backend/tests/test_model_provider_client.py`、`backend/tests/test_settings_model_providers.py`、`backend/tests/test_provider_fallback_resolver.py`、`backend/tests/test_openai_compatible_provider_runtime.py` | prompt cache、credential pool、节点级 provider override、成本/速率 |
| 上下文压缩与 Prompt Cache | 进行中 | 上下文压力检查、压缩子图、summary source refs、prompt audit metadata | `backend/tests/test_buddy_context_pressure_tool.py`、`backend/tests/test_template_layouts.py`、`frontend/src/buddy/buddyContextCompaction.test.ts` | provider 级 cache-control、稳定前缀拆分、节点级 cache override |
| 权限、安全与注入防护 | 进行中 | context scanner、secret redaction、高风险阻断、permission approval、artifact 路径隔离 | `backend/tests/test_context_assembly_store.py`、`backend/tests/test_permission_approval.py`、`backend/tests/test_graph_run_db_store_permission_audit.py`、`backend/tests/test_capability_artifact_store.py` | 能力包保护策略、审批 review surface、外部投递审批 |
| 诊断与可观测性 | 进行中 | RunDetail 聚合 context audit、agent diagnostic、provider fallback、permission、review、run tree；Buddy 胶囊按 output 边界重放 | `frontend/src/pages/RunDetailPage.structure.test.ts`、`frontend/src/pages/runDetailModel.test.ts`、`frontend/src/pages/agentDiagnosticModel.test.ts`、`frontend/src/buddy/buddyOutputTrace.test.ts` | 后台任务 report、召回排名和失败恢复集中诊断 |
| 模型日志树 | 基本完成 | 模型请求日志写入 `graph_model_calls`，按 run tree / graph node 展示，支持保留策略和密钥脱敏 | `backend/tests/test_model_request_logs.py`、`frontend/src/api/modelLogs.test.ts`、`frontend/src/pages/ModelLogsPage.structure.test.ts` | 进一步关联 provider 成本、cache 决策和 trace drilldown |
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

### 4.7 Scheduler 已经能运行图任务，但外部投递仍停在审批边界

代码事实：

- `scheduled_graph_jobs`、`scheduled_graph_job_runs` 已入库。
- `backend/app/scheduler/store.py`、`runner.py`、`service.py` 和 `routes_scheduler.py` 提供创建、到期查询、运行、retry 和 lifespan tick。
- 外部投递目标当前记录为 `external_delivery_requires_approval`，敏感字段会脱敏。

增强内容：

- 定时任务变成标准 graph run，有 run record、retry policy、delivery audit 和权限 profile。
- 官方启动会 seed 内置维护任务。

验证方式：

- `pytest backend/tests/test_scheduler_store.py backend/tests/test_scheduler_routes.py backend/tests/test_scheduler_service.py -q`
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

增强内容：

- 模型日志从独立请求列表升级为能回到 run、node、child run 的诊断树。
- 请求、响应和错误进入日志前会脱敏，inline media 会摘要化。
- 后续 provider profile、成本、cache 和 fallback 诊断有了共同挂载点。

验证方式：

- `pytest backend/tests/test_model_request_logs.py -q`
- `node --test frontend/src/api/modelLogs.test.ts frontend/src/pages/ModelLogsPage.structure.test.ts`

## 5. 未完成内容与实现方案

### 阶段 A：Provider profile 完整化

目标：把 provider runtime 从“可 fallback、可设置超时”推进到“可按节点和能力精细控制”。

当前缺口：

- prompt cache 仍是 audit metadata，没有真正下发到 provider payload。
- credential pool 还没有轮换、冷却和失败隔离。
- 节点级 override 还没有系统化。
- 成本、速率限制和预算统计还没有统一进入 provider profile。

实现方案：

1. 在 `NodeSystemAgentConfig` 增加 provider override 字段：request timeout、cache policy、cost budget、rate profile。
2. 在 `backend/app/core/runtime/agent_runtime_config.py` 统一解析节点级 override，并传给 `chat_with_model_ref_with_meta`。
3. 在 provider settings 中增加 credential pool schema，记录 credential id、状态、冷却时间、失败计数。
4. 在 model call meta 中写入实际 credential、cache decision、成本估算和 rate decision。
5. RunDetail Agent Diagnostic 增加 provider profile 展示。

建议验证：

- 新增/更新 `backend/tests/test_agent_runtime_config.py`、`backend/tests/test_model_provider_client.py`、`backend/tests/test_settings_model_providers.py`。
- 更新 `frontend/src/pages/ModelProvidersPage.structure.test.ts` 或相关结构测试。

### 阶段 B：Scheduler 外部投递闭环

目标：让当前 `external_delivery_requires_approval` 从审计记录升级为经审批后可执行的 adapter。

当前缺口：

- 外部 webhook/http delivery 只记录需要审批，不真正投递。
- 审批结果和 delivery execution 没有形成统一重试链。

实现方案：

1. 增加 `scheduled_delivery_attempts` 或复用 job run metadata 记录每次投递尝试。
2. 新增受控 delivery Action 或 scheduler delivery adapter，输入只接受已审批 job_run 和 redacted-safe target。
3. 审批通过后执行外部投递；失败进入 retry policy。
4. Scheduler UI 和 RunDetail 展示 approval、delivery attempt、response summary 和 redacted target。

建议验证：

- 更新 `backend/tests/test_scheduler_store.py` 和 `backend/tests/test_scheduler_routes.py`。
- 增加外部投递 adapter 的 mock HTTP 测试，断言敏感字段不落日志。
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

1. Provider profile 完整化。它直接补 Hermes provider runtime 差距，范围清晰，能在不改主循环图结构的情况下增强所有 LLM/embedding/rerank 调用。
2. 消息平台生产硬化。基础入口已经合并，下一步补 `state_bundle`、delivery diagnostics、凭据轮换和 adapter health。
3. Scheduler 外部投递闭环。当前已经有 store、runner、retry、权限边界和 UI，下一步是把审批后的投递执行补上。
4. Delegation 持久 board。当前 worker 协议已经能跑，下一步需要长期状态、ownership 和 UI 操作。
5. 记忆召回质量提升。当前 recall 可用，下一步提高去重、解释性和人工复核。
6. 官方能力包端到端覆盖。作为所有能力继续扩展前的防回归基础。

继续开发前的判断标准：

- 当前文档中的“已完成增强”都能通过对应测试或 UI 入口验证。
- 当前文档中的“下一步”都有明确文件落点和测试落点。
- 新开发只扩展一个能力域，不同时混做 provider、scheduler、delegation 和 memory quality。

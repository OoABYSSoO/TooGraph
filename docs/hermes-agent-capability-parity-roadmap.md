# TooGraph 追上 Hermes Agent 能力路线图

最后整理日期：2026-05-27。

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

### 3.1 Agent Loop 鲁棒性

Hermes 能力：

- `AIAgent` 有 `max_iterations`，多轮 tool call loop，能处理工具调用、并发、去重、fallback、压缩和持久化。
- provider 异常、stream 解析异常、tool call 参数异常都有恢复路径。
- 达到最大迭代、工具失败、模型失败时有明确处理逻辑。

TooGraph 差距：

- 图模板能表达循环，但缺少统一的 Agent loop runtime contract。
- Condition 节点有局部 `loopLimit`，但缺少跨整张图的 capability budget、iteration budget、stop reason、retry policy。
- 失败后用户很难判断是模型问题、能力问题、权限问题、上下文问题还是图结构问题。

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
- 当前 UI 还没有一个清晰的“历史查询/证据展开”视图。

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
   - Model Providers 增加真实 embedding provider 配置。
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

- `buddy_autonomous_review` 能产出 improvement candidates，但还不能自动变成 Action、Tool、Subgraph、模板或文档 revision。
- 缺少周期性的“能力库整理者”。

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
   - 定期扫描 Action/Tool/Subgraph/template 使用记录。
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
2. 新增 scheduler runtime：
   - 应用启动后后台 tick。
   - 到点创建 graph run。
   - run 完成后写 job run record。
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
- 每次定时运行都有 run record、失败原因、下次运行时间。
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
3. Fallback policy：
   - provider failed -> model fallback。
   - structured output failed -> repair retry -> fallback parser -> fallback model。
   - embedding provider failed -> queue retry or local-hash fallback。
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

解决方案：

1. 压缩输出标准化：
   - `protected_recent_history`
   - `session_summary_candidate`
   - `summary_source_refs`
   - `omitted_refs`
   - `risk_notes`
   - `revision_id`
2. Prompt snapshot：
   - 每次 run 保存模型实际输入摘要或 artifact。
   - 保存 context assembly refs，而不是递归保存完整聊天全文。
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
4. fallback candidates。
5. 官方能力准入规范。

完成标准：

- 每次能力选择有评分、拒绝理由和预算。
- 失败后能调整选择。

### 阶段 D：自我改进闭环

目标：让 Buddy 能把运行经验沉淀成可审查改进。

工作项：

1. `improvement_candidate` schema。
2. improvement review workflow。
3. Action/Tool/template diff + validation + approval。
4. capability curator。
5. curator report UI。

完成标准：

- 后台复盘产生的候选能进入受控改进流程。
- 官方能力不会被静默修改。

### 阶段 E：调度、委派、插件

目标：追上 Hermes 的 cron、delegation、plugin 扩展能力。

工作项：

1. Scheduler store + runtime。
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
id
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
id
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
id
name
enabled
schedule_json
timezone
template_id
input_bindings_json
runtime_overrides_json
permission_policy_json
delivery_target_json
next_run_at
created_at
updated_at
```

### `improvement_candidates`

```text
id
kind
source_run_id
title
summary
evidence_refs_json
risk_level
status
proposed_change_json
approval_required
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

## 8. 下一步开发建议

最合理的下一份开发计划应从阶段 A 开始：

1. 设计并实现 `agent_loop_control` state。
2. 新增 `agent_loop_guard` Tool。
3. 修改 `buddy_autonomous_loop`，把能力执行结果先送入 guard。
4. RunDetail 增加 stop reason 和 loop budget 展示。
5. 增加 Buddy main loop eval cases。

这组工作能直接提升主循环稳定性，并为后续召回、selector、scheduler、delegation 提供共同诊断基础。

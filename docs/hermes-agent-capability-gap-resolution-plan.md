# TooGraph 追上 Hermes Agent 能力差距解决方案

最后更新：2026-05-27。

本文是一份独立开发文档，用来指导 TooGraph 逐步追上 `demo/hermes-agent/` 的通用 Agent 能力。它不是要复制 Hermes 的代码形态，而是把 Hermes 已验证的能力翻译成 TooGraph 的图优先产品架构。

阅读方式：

- Hermes 能力：`demo/hermes-agent/` 里已经具备的能力。
- TooGraph 差距：TooGraph 当前还缺少或成熟度不足的部分。
- 解决方案：在 TooGraph 中应该落到哪些图模板、Action、Tool、数据库表、API、UI 和测试。
- 验收标准：如何判断该差距已经被真正补齐。

## 1. 总体判断

Hermes Agent 的优势不是某一个工具，而是完整闭环：

```text
多入口会话
-> 稳定上下文与记忆召回
-> 多轮 Agent loop
-> 工具/技能/插件能力调用
-> 后台复盘
-> 记忆与技能自我改进
-> 周期 curator
-> 搜索、诊断、评测与安全边界
```

TooGraph 的优势是图模板、状态、运行记录、可视化、revision 和 approval。追赶 Hermes 的正确路线是：

```text
把 Hermes 的隐式 Agent loop
翻译成 TooGraph 的显式图流、schema-backed state、Action、Tool、Subgraph、run record 和 review surface。
```

因此本方案坚持这些原则：

- Buddy 主循环只把“当前用户消息”作为真正外部输入。
- 历史、记忆、Buddy Home、session id、知识库、网页、工具结果都由图中 Tool/Input/Action 组装成显式 state。
- 图运行记录是运行事实源。Buddy 胶囊、RunDetail、后台复盘和记忆召回都从运行记录重新拼装。
- 长期文件记忆与数据库召回记忆双线并存：文件用于稳定上下文注入，数据库用于检索召回。
- 自我改进走图：候选 -> 验证 -> diff -> approval -> revision -> eval。
- Scheduler、curator、delegation 都产生标准 graph run，而不是隐藏后台逻辑。

## 2. 能力追赶分层

追赶 Hermes 应按六层推进：

```text
L1 可信主循环
   Agent loop budget、stop reason、上下文组装、运行诊断

L2 记忆与检索
   Buddy messages、session summaries、FTS、embedding、hybrid recall、长期文件记忆

L3 能力调用
   capability selector、Action/Tool/Subgraph catalog、权限、usage stats、fallback

L4 后台学习
   background review、memory writeback、improvement candidates、revision restore

L5 自我改进与调度
   improvement workflow、curator、scheduled graph jobs、eval case 生成

L6 多入口与生态
   CLI/API/webhook/gateway、plugins、MCP、delegation、observability
```

## 3. 差距 1：Agent Loop 鲁棒性

Hermes 能力：

- `AIAgent` 管理多轮模型调用、工具调用、重试、最大迭代、provider fallback、工具错误恢复和上下文压缩。
- 每个 run 能知道为什么停止：完成、达到预算、工具失败、模型失败、用户中断、权限等待等。
- 工具调用失败后有明确重试和 fallback 策略。

TooGraph 差距：

- 图可以表达循环，但缺少跨整张图统一的 Agent loop contract。
- Condition 节点的局部循环限制不足以表达整体 iteration budget、capability budget 和失败分类。
- RunDetail 还需要更完整地解释一次 Agent run 的停止原因和预算消耗。

解决方案：

1. 标准化 `agent_loop_control` state。
   - 字段：`iteration_index`、`max_iterations`、`capability_call_count`、`max_capability_calls`、`failure_count_by_node`、`retry_budget`、`last_stop_reason`、`warnings`。
   - 每次进入能力选择、能力执行、失败处理、最终回复前都更新该 state。
2. 标准化 `agent_loop_report` state。
   - 字段：`decision`、`stop_reason`、`should_continue`、`should_retry`、`capability_budget_remaining`、`iteration_budget_remaining`、`failure_summary`。
   - 该 report 作为 RunDetail、Buddy 胶囊和后台复盘的事实输入。
3. 强化 `agent_loop_guard` Tool。
   - 输入：当前 loop control、最近 capability result、最近错误、context budget。
   - 输出：继续、重试、降级、进入最终回复、进入失败解释、请求人工审批。
4. 新增标准 stop reason 枚举。
   - `completed`
   - `needs_user_clarification`
   - `max_iterations_reached`
   - `capability_budget_exhausted`
   - `permission_required`
   - `provider_failed`
   - `tool_failed`
   - `graph_validation_failed`
   - `context_budget_exhausted`
   - `cancelled`
5. 运行记录写入 `agent_loop_events`。
   - 每次 guard 决策写一条事件。
   - 事件包含 node id、iteration、decision、stop reason、预算快照、capability ref、错误摘要。
6. UI 侧新增 Agent Diagnostic 面板。
   - 展示循环次数、能力调用次数、预算、停止原因、失败分类、fallback 路径。
   - Buddy 胶囊只按 output 边界分段，但胶囊内部可以展示 loop event 标签。

开发产物：

- `agent_loop_control` / `agent_loop_report` schema。
- `agent_loop_guard` Tool。
- `agent_loop_events` 数据库投影。
- RunDetail Agent Diagnostic。
- Buddy 胶囊 loop 标签。
- 模板测试和 Tool 单测。

验收标准：

- 任意 Buddy run 都能看到循环次数、能力调用次数和停止原因。
- 达到预算时输出明确结果，而不是卡死或静默失败。
- 同一能力连续失败时能触发重试耗尽、fallback 或最终解释。
- 后台复盘能读取 stop reason 判断是否需要生成改进候选。

优先级：P0。

## 4. 差距 2：Prompt 与 Context Assembly

Hermes 能力：

- `prompt_builder.py` 统一组装 `SOUL.md`、`MEMORY.md`、`USER.md`、skills、工具说明、项目上下文和模型提示。
- memory snapshot、session history、skills guidance 和 tool guidance 有稳定边界。
- 外部上下文进入 prompt 前有来源和注入风险处理。

TooGraph 差距：

- Buddy Home、聊天历史、数据库记忆、知识库、网页和能力结果已有不同入口，但需要全部收敛成统一 `context_package`。
- 用户需要在 RunDetail 中明确看到每个 LLM 节点实际读取了哪些上下文、来源是什么、被裁剪了什么。

解决方案：

1. 标准化 `context_package`。
   - `source_kind`: `buddy_home|session|memory|knowledge|web|capability|page|runtime`
   - `authority`: `instruction|identity|preference|history|evidence|context_only|candidate`
   - `items[]`: `id`、`title`、`content`、`summary`、`score`、`source_ref`、`metadata`
   - `budget`: `used_chars`、`source_chars`、`omitted_count`
   - `warnings`
2. Buddy Home loader 输出四类稳定上下文。
   - `AGENTS.md`: 项目/运行说明。
   - `SOUL.md`: Buddy 身份、语气、长期个性。
   - `USER.md`: 用户偏好和事实。
   - `MEMORY.md`: 稳定长期记忆和重要背景。
3. 历史上下文由 `buddy_history_context_loader` 生成。
   - 输入：`runtime_context.buddy_session_id`。
   - 输出：完整或压缩历史 context package、message refs、summary refs、omitted reason。
4. 召回上下文由 `buddy_session_recall` 或后续 memory recall Tool 生成。
   - 输出：记忆条目、历史消息、相关 run outputs、分数、证据来源。
5. LLM prompt assembly 只消费 schema-backed state。
   - Input 节点负责当前用户消息和固定文件输入。
   - Tool 节点负责运行时上下文和历史组装。
   - LLM 节点只看明确连接过来的 state。
6. RunDetail 增加 Context Assembly 视图。
   - 每个 LLM 节点展示输入 context packages。
   - 展示 source refs、authority、预算、裁剪原因。
   - 支持从 source refs 回跳到消息、记忆条目、run output、Buddy Home revision。

开发产物：

- `context_package` schema。
- Buddy Home、history、memory、knowledge、web、capability、runtime loader。
- `context_assemblies` 表或 run detail 投影。
- RunDetail Context Assembly 面板。
- Prompt assembly 渲染测试。

验收标准：

- 任意 LLM 节点可以说明“它看到了什么”。
- 历史、召回和网页材料不会被混成用户指令。
- Buddy Home 文件与 DB memory 的边界清晰。
- 后台复盘能复用同一 context assembly，而不是重新拼一套隐藏输入。

优先级：P0。

## 5. 差距 3：Session Persistence、FTS 与历史搜索

Hermes 能力：

- 会话、消息、搜索索引和摘要持久化。
- FTS5 支持跨会话搜索历史。
- 历史不是每轮复制全文，而是 message、summary、lineage 和引用组合。

TooGraph 差距：

- 需要把 Buddy 主循环中的聊天历史完全引用化，避免 Q1/A1、Q1/A1/Q2/A2 这种嵌套复制。
- 需要统一 DB 成为 Buddy session、messages、run refs、context assembly 的事实源。
- 需要 FTS + embedding 的混合检索能力。

解决方案：

1. 消息原子化存储。
   - `buddy_messages`: 一条用户消息或 Buddy 回复一条记录。
   - 字段：`message_id`、`session_id`、`role`、`content`、`created_at`、`run_id`、`parent_message_id`、`metadata_json`。
2. run 与消息建立链接。
   - `graph_runs` 记录每次图运行。
   - `buddy_message_run_links` 或在消息中保存 `run_id`。
   - 每轮输入只保存当前用户消息，历史通过 session id 查询。
3. 摘要独立存储。
   - `session_summaries`: `summary_id`、`session_id`、`source_message_start_id`、`source_message_end_id`、`summary_text`、`summary_kind`、`revision_id`。
   - 压缩后的历史是 summary + 最近消息引用，不是新的完整历史复制。
4. FTS 表。
   - `buddy_messages_fts`: message content。
   - `session_summaries_fts`: summary text。
   - `memory_entries_fts`: memory content。
   - FTS 查询返回 refs，调用方再展开原始记录。
5. 历史组装。
   - `buddy_history_context_loader` 根据 `session_id` 查询 summaries 和 recent messages。
   - 输出 context package，并在 `context_assembly_items` 中记录 refs。
6. 搜索 API。
   - `GET /api/buddy/search?q=...`
   - 支持 session filter、time filter、source type、role filter。
   - 返回 message refs、summary refs、run refs 和 snippet。

开发产物：

- `buddy_messages`、`session_summaries`、`context_assemblies`、FTS 虚表。
- 历史 loader。
- Buddy session search API。
- RunDetail 历史来源回跳。

验收标准：

- 第 N 轮运行记录中不复制前 N-1 轮完整全文。
- 可以从 run detail 通过 message refs 还原当时历史输入。
- FTS 搜索能定位历史消息、摘要和记忆条目。
- 删除或修订某条摘要不会破坏原始消息记录。

优先级：P1。

## 6. 差距 4：长期记忆与 Embedding 召回

Hermes 能力：

- 后台复盘能写 memory。
- 记忆召回与会话搜索结合。
- 用户偏好、纠正和重要事实会进入长期上下文。

TooGraph 差距：

- 已确定需要双线记忆：长期文件记忆 + DB 召回记忆。
- 需要完整 embedding pipeline、hybrid recall、rerank 和 evidence refs。
- 需要明确“什么进入文件，什么进入 DB memory”。

解决方案：

1. 长期文件记忆职责。
   - `SOUL.md`: Buddy 身份、表达风格、稳定行为倾向。
   - `USER.md`: 用户长期偏好、事实、工作方式。
   - `MEMORY.md`: 高价值长期背景、项目状态、持续目标。
   - `AGENTS.md`: 项目或运行说明，不作为普通记忆池。
2. DB memory 职责。
   - 可召回、可评分、可过期、可关联证据。
   - 不负责稳定注入全部内容。
3. `memory_entries` 表。
   - `memory_id`
   - `kind`: `user_fact|preference|project_context|workflow_lesson|conversation_summary|capability_lesson`
   - `content`
   - `summary`
   - `confidence`
   - `importance`
   - `source_refs_json`
   - `created_from_run_id`
   - `supersedes_memory_id`
   - `status`: `active|archived|superseded`
4. Embedding pipeline。
   - `embedding_models`: provider、model、dimension、normalization。
   - `embedding_jobs`: target type、target id、status、error、model id。
   - `embedding_vectors`: target type、target id、vector、model id、created_at。
   - 新消息、summary、memory、capability output 入库后 enqueue embedding job。
5. Hybrid recall。
   - Query -> FTS candidates。
   - Query -> embedding nearest neighbors。
   - Merge by source type、score、recency、importance。
   - Rerank 输出最终 context package。
6. 复盘写入规则。
   - 稳定身份/偏好变化写 Buddy Home 文件 revision。
   - 可检索事实、技巧、历史线索写 `memory_entries`。
   - 两边都需要时，文件写摘要，DB memory 保存证据和细节。
7. RunDetail recall report。
   - 展示召回 query、候选数、FTS 命中、embedding 命中、rerank 结果、被注入项。

开发产物：

- `memory_entries`、`embedding_jobs`、`embedding_vectors`。
- Embedding maintenance 官方模板或后台 job。
- Hybrid recall Tool。
- Rerank Tool 或 LLM rerank 子图。
- Memory Review 输出合同。

验收标准：

- 文件记忆和 DB 记忆职责不重叠。
- 每条 DB memory 都能追溯到 source run/message。
- 召回结果可解释：为什么召回、分数多少、证据是什么。
- embedding 失败不阻塞主 run，但失败可见且可重试。

优先级：P1。

## 7. 差距 5：Background Review

Hermes 能力：

- 每轮主对话后 fork 后台 Agent。
- 后台 Agent 读取 conversation snapshot。
- 用受限工具更新 memory 和 skill。
- 主回复路径不被后台复盘阻塞。

TooGraph 差距：

- 已有 `buddy_autonomous_review` 和后台记录，但需要让复盘产物成为完整事实链。
- 需要显示复盘输入 state、写回 revision、跳过原因、改进候选。
- 需要失败可见、可重跑、可恢复。

解决方案：

1. 后台队列。
   - 可见 Buddy run 完成后 enqueue review run。
   - 记录：`source_run_id`、`review_run_id`、`template_id`、`trigger_reason`、`status`、`error`、`created_at`、`completed_at`。
2. Review input contract。
   - `source_run_snapshot`
   - `source_context_assemblies`
   - `buddy_home_context`
   - `recent_memory_recall`
   - `capability_usage_trace`
3. Review output contract。
   - `review_report`
   - `memory_write_plan`
   - `buddy_home_write_plan`
   - `structured_memory_writes`
   - `improvement_candidates`
   - `skipped_commands`
   - `warnings`
4. 写回边界。
   - 低风险记忆写入可自动执行，但必须有 revision。
   - Action、Tool、模板、官方文件改动只产出 candidate。
   - 文件写回必须走 command/revision path。
5. RunDetail 后台复盘面板。
   - 展示 review run link。
   - 展示 writeback summary、revision ids、skipped commands。
   - 展示 improvement candidates。
   - 提供手动重跑和 revision restore。

开发产物：

- `buddy_background_reviews` 表/API。
- `buddy_autonomous_review` 官方模板合同。
- RunDetail Background Review 面板。
- 复盘写回 summary builder。
- 复盘重跑和 revision restore。

验收标准：

- 主回复完成后，后台复盘可独立查询。
- 复盘失败不会回滚或污染主回复。
- 每个写入都能追溯到 source run。
- 用户能看到复盘到底读了什么 state、写了什么、跳过了什么。

优先级：P1。

## 8. 差距 6：自我改进与 Curator

Hermes 能力：

- 后台复盘会更新 skill。
- Curator 周期整理 skill library：归并、归档、评分、修复引用、产出报告。
- 保护 bundled/hub/pinned skills。

TooGraph 差距：

- `buddy_autonomous_review` 能产出 improvement candidates，基础候选已经能进入验证、人工决策和 command-backed revision apply；更广的 Action、Tool、Subgraph、模板和 eval 闭环仍需扩展。
- 缺少周期性能力库整理者。

当前落地进展：

- 已新增 `improvement_candidates` 持久化表；后台复盘完成后会把 review run state 中的 `improvement_candidates` 投影为可查询对象。
- 已新增 `GET /api/buddy/improvement-candidates`，支持按 `source_run_id`、`review_id`、`review_run_id` 和 `status` 查询候选。
- 后台复盘列表仍从 run state 还原候选摘要，同时叠加数据库中的候选状态、验证 run 和应用 revision 字段；RunDetail 候选卡会显示当前状态。
- 已新增官方 `buddy_improvement_review_workflow` 模板和 RunDetail 的“开始验证”入口，用标准 graph run 验证候选，不走隐藏后端应用路径。
- RunDetail 启动候选验证 run 后会把 `validation_run_id` 写回候选表并标记为 `validating`；验证 run 完成后，后端从 `candidate_status_recommendation.recommended_status` 同步为 `validated`、`needs_changes`、`rejected` 或 `waiting_for_approval`。失败或取消的验证 run 会同步为 `failed`。
- 候选记录会持久化 `status_reason` 和 `validation_result`，其中包含 `candidate_validation_plan`、`proposed_diff`、`validation_report`、`test_plan`、`approval_request`、`candidate_status_recommendation` 和 `final_summary`，供后续审批和应用流读取。
- 官方验证模板可在 `approval_request.apply_command` 中声明后续可由受控 Buddy command 应用的单步命令，模板本身仍只产出验证和审批材料。
- 已新增候选 approve / reject 决策 API 和 RunDetail 操作入口；人工决策会写入 `decision`、`decided_at` 和 `status_reason`，只推进候选状态。
- 已新增候选 apply API 和 RunDetail 操作入口；状态为 `approved` 且带 `has_apply_command` 的候选会读取验证产物中的 `approval_request.apply_command`，通过 allowlist Buddy command 执行改动，记录 `applied_revision_id`、`applied_command` 和 `applied_at`，并把候选标记为 `applied`。
- 已新增独立改进候选队列页面 `/improvements`，集中展示所有候选，支持状态筛选、搜索、来源/验证 run 跳转、验证、状态同步、批准、拒绝和可应用候选的 apply。

解决方案：

1. 定义 `improvement_candidate` schema。
   - `candidate_id`
   - `kind`: `memory|action_revision|tool_revision|template_revision|subgraph_proposal|docs_update|eval_case|policy_suggestion`
   - `source_run_id`
   - `review_id`
   - `review_run_id`
   - `target_ref`
   - `evidence_refs`
   - `risk_level`
   - `expected_benefit`
   - `proposed_change_summary`
   - `approval_required`
   - `validation_run_id`
   - `validation_result`
   - `status_reason`
   - `applied_revision_id`
   - `applied_command`
   - `applied_at`
   - `payload`
   - `status`: `proposed|validating|validated|needs_changes|waiting_for_approval|approved|rejected|applied|failed|superseded`
2. 新增官方模板 `buddy_improvement_review_workflow`。
   - 输入：candidate、source run refs、target refs。
   - 读取目标 Action/Tool/template/doc。
   - 生成候选 diff 或 proposal artifact。
   - 运行 validator/test 或生成人工验证清单。
   - 输出 approval request。
3. 新增官方模板 `buddy_capability_curator`。
   - 扫描 Action、Tool、Subgraph、template、memory、eval 使用记录。
   - 找到失败率高、重复、长期未用、说明过期、缺少测试的能力。
   - 输出 curator report 和 improvement candidates。
4. 应用改动。
   - 用户 Action/Tool/template：通过 writer Action + revision 应用。
   - 官方资产：默认只生成候选和 diff，等待人工 approval。
   - 高风险改动：需要显式确认和可恢复 revision。
5. Curator scheduler。
   - 以 scheduled graph job 运行。
   - 支持 pause、manual run、dry run。
   - 每次 curator run 产出 report artifact。

开发产物：

- `improvement_candidates` 表。已完成基础表、复盘投影、查询 API、RunDetail 状态展示、验证 run 关联、验证结果状态同步、验证产物投影、人工决策记录和 command-backed apply 记录。
- `buddy_improvement_review_workflow` 官方模板。已完成验证模板、可选 `approval_request.apply_command` 产出和从候选启动验证 run 的入口。
- `buddy_capability_curator` 官方模板。
- Candidate Review UI。已完成 RunDetail 候选入口和独立 `/improvements` 候选队列。
- Candidate approve/reject/apply API 已完成；后续重点是扩大 apply writer 覆盖范围。
- Curator report 页面。

验收标准：

- 复盘候选可以进入验证流程。
- 候选验证能产出 diff、测试结果和 approval request。
- Curator 能定期产出能力库健康报告。
- 官方模板和高风险能力不会被静默修改。

优先级：P2。

## 9. 差距 7：Capability Selector 与能力路由

Hermes 能力：

- 模型直接看到工具 schema。
- tool registry 提供 schema、availability、dispatch、error wrapping。
- 工具选择有可用性检查、失败包装、参数修复和 fallback。

TooGraph 差距：

- `toograph_capability_selector` 已能发现 Action/Subgraph/Tool，但评分、失败学习、权限和 fallback 需要继续强化。
- 能力使用结果需要反哺下一次选择。

解决方案：

1. 定义 `capability_profile`。
   - `kind`: `action|tool|subgraph`
   - `key`
   - `display_name`
   - `description`
   - `input_schema`
   - `output_schema`
   - `permissions`
   - `risk_level`
   - `task_tags`
   - `produces`
   - `usage_stats`
2. selector 输出完整 trace。
   - `selected_capability`
   - `selection_reason`
   - `score_breakdown`
   - `rejected_candidates`
   - `fallback_candidates`
   - `permission_summary`
   - `missing_capability_reason`
3. capability usage events。
   - 每次执行后写 `capability_usage_events`。
   - 字段：capability key、run id、node id、success、error class、latency、artifact count、user correction refs。
4. 失败学习。
   - selector 读取近期失败率。
   - 连续失败降低分数或提示 fallback。
   - 成功率高的能力优先。
5. 权限路由。
   - selector 不授予权限，只说明候选需要的权限。
   - runtime 根据 Action/Tool/Subgraph manifest 和审批策略执行。

开发产物：

- capability catalog profile。
- usage events 表。
- selector trace state。
- RunDetail Capability Selection 面板。
- selector eval suite。

验收标准：

- 每次能力选择都有可解释评分和拒绝理由。
- 能力失败会影响后续选择。
- selector 不能绕过权限。
- 缺能力时能输出明确的 capability gap，供自我改进候选使用。

优先级：P1。

## 10. 差距 8：Action / Tool / Subgraph 生态

Hermes 能力：

- 丰富工具集：终端、文件、搜索、浏览器、记忆、技能、cron、MCP、平台消息等。
- 技能系统承载过程知识。
- 插件可以扩展工具、命令和 hooks。

TooGraph 差距：

- TooGraph 需要把低层操作变成 Action/Tool/Subgraph，并让能力目录可发现、可测试、可审计。
- 不能把多步骤自治塞进单个 Action。

解决方案：

1. 能力分层。
   - Core Tools：纯计算、上下文加载、检索、压缩、评分。
   - Workspace Actions：读写文件、生成 artifact、运行命令。
   - Web Actions：搜索、抓取、下载。
   - Graph Actions：创建/编辑模板、校验图、生成 diff。
   - Buddy Actions：写 Buddy Home、写 memory、写 session summary。
   - Subgraphs：多步骤工作流，如研究、代码修改、模板创建、复盘。
2. Manifest 增强。
   - `permissions`
   - `risk_level`
   - `artifact_contract`
   - `state_output_schema`
   - `eval_cases`
   - `failure_modes`
   - `examples`
3. Action 生命周期。
   - `before_llm.py` 准备审计上下文。
   - LLM 节点准备一次 Action 参数。
   - `after_llm.py` 执行受控操作并返回结构化输出。
   - Action 不拥有多步骤 Agent loop。
4. Subgraph 能力。
   - 需要多个 LLM 回合、多个能力调用、人工审批或验证的流程都做成 Subgraph/模板。
5. 能力准入。
   - 每个官方能力需要合同测试。
   - 高风险能力需要审批路径。
   - artifact 输出必须是路径或结构化引用，避免 base64 塞入 state。

开发产物：

- 能力包规范文档。
- 官方 Action/Tool/Subgraph catalog。
- Action/Tool/template validator。
- 能力包测试夹具。
- 能力详情页面。

验收标准：

- 常用低层操作都能通过显式能力调用完成。
- 单个 Action 不包含隐藏多步骤自治。
- 每次能力调用都有输入、输出、权限、artifact 和错误记录。
- 新能力能被 selector 发现，也能被 curator 评估。

优先级：P1-P2。

## 11. 差距 9：Scheduler / Cron / 后台任务

Hermes 能力：

- 内置 cron 调度器。
- 定时任务可以向消息平台投递。
- Curator 和后台维护任务能周期运行。

TooGraph 差距：

- 缺少通用 scheduled graph job。
- 后台任务需要成为标准 graph run，并进入运行记录与审计系统。

解决方案：

1. `scheduled_graph_jobs` 表。
   - `job_id`
   - `name`
   - `template_id`
   - `input_bindings_json`
   - `schedule_kind`: `interval|cron|manual`
   - `schedule_expr`
   - `timezone`
   - `enabled`
   - `last_run_id`
   - `next_run_at`
   - `delivery_target_json`
2. `scheduled_graph_job_runs` 表。
   - job id、run id、trigger reason、status、error、started_at、completed_at。
3. Scheduler runtime。
   - 单端口服务启动时启动 tick。
   - 到点创建标准 graph run。
   - 失败写 job run，不影响主进程。
4. UI。
   - Scheduler 页面列出 job。
   - 支持 pause、resume、run now、dry run、查看历史。
5. 官方 scheduled templates。
   - `buddy_capability_curator`
   - embedding maintenance
   - memory hygiene
   - periodic session summary

开发产物：

- scheduler store/runtime。
- Scheduler API/UI。
- scheduled graph run integration。
- curator scheduled job。

验收标准：

- 定时任务每次运行都有 graph run id。
- 失败可见可重试。
- 用户可以暂停和手动触发。
- 调度任务不能绕过能力权限和 approval。

优先级：P2。

## 12. 差距 10：Delegation / Subagents / Kanban

Hermes 能力：

- 可委派子代理处理并行工作。
- 子任务有隔离上下文、预算、结果合并。
- Kanban/任务结构可承载多任务进展。

TooGraph 差距：

- TooGraph 的 Subgraph 能表达 worker，但需要标准 worker packet、并发预算和结果合并。
- 需要任务状态、依赖、结果链接和失败处理。

解决方案：

1. `worker_task_packet` schema。
   - `task_id`
   - `goal`
   - `constraints`
   - `context_refs`
   - `allowed_capabilities`
   - `budget`
   - `expected_outputs`
2. `worker_result_package` schema。
   - `task_id`
   - `status`
   - `summary`
   - `outputs`
   - `artifacts`
   - `errors`
   - `followups`
3. Worker subgraph。
   - 接收 task packet。
   - 运行受限能力。
   - 输出 result package。
4. 主图 orchestration。
   - LLM 拆任务。
   - Subgraph 节点并发或顺序执行 worker。
   - Merge LLM 汇总结果。
   - Review 节点检查完整性。
5. Task board。
   - `agent_tasks` 表记录 task、status、parent run、worker run。
   - UI 显示任务树和 worker run links。

开发产物：

- worker packet/result schema。
- delegation subgraph templates。
- task store/API/UI。
- 并发预算和取消机制。

验收标准：

- 主 run 能委派多个 worker，并保留每个 worker run 详情。
- worker 无法访问未授权上下文。
- merge 结果可追溯到 worker outputs。
- 失败 worker 不会让主 run 丢失诊断信息。

优先级：P2-P3。

## 13. 差距 11：Provider Runtime 与模型能力矩阵

Hermes 能力：

- 支持多个 provider、模型切换、fallback、credential refresh、模型能力判断。
- 统一调用路径供主 Agent、后台 review、curator、辅助任务使用。

TooGraph 差距：

- Model Providers 页面已有基础，但需要更完整的 provider capability matrix。
- LLM 节点、Action planning、review、embedding、rerank、scheduler 应共用 resolver。

解决方案：

1. Provider profile。
   - `provider_id`
   - `base_url`
   - `api_kind`
   - `supports_tools`
   - `supports_structured_output`
   - `supports_vision`
   - `supports_streaming`
   - `context_window`
   - `default_temperature`
2. Model capability matrix。
   - 每个模型的 context window、tool use、JSON mode、reasoning、vision、embedding dimension。
3. Runtime resolver。
   - 输入用途：`main_loop|review|curator|embedding|rerank|action_planning`。
   - 输出 provider/model/client config。
4. Fallback policy。
   - provider failed 时记录错误类型。
   - 可配置 fallback model。
   - fallback 事件写 run record。
5. Structured output repair。
   - JSON parse failure -> repair attempt -> fallback。
   - repair trace 可见。

开发产物：

- provider capability schema。
- model capability matrix。
- runtime resolver service。
- fallback event/run detail。
- provider eval fixtures。

验收标准：

- 任意模型调用能说明选择了哪个 provider/model。
- 结构化输出失败有 repair trace。
- 后台复盘和 embedding 不依赖主循环硬编码。
- provider fallback 不吞掉原始错误。

优先级：P2。

## 14. 差距 12：上下文压缩与 Prompt Cache

Hermes 能力：

- 上下文压力超过阈值时压缩。
- 压缩后保持可行动摘要。
- memory snapshot 和稳定上下文避免频繁破坏 prompt cache。

TooGraph 差距：

- 已有 `buddy_context_compaction`，需要把压缩输出与 session summaries、source refs、prompt budget 彻底打通。
- 需要避免把压缩历史再作为下一轮完整文本嵌套复制。

解决方案：

1. 压缩触发。
   - `buddy_context_pressure_check` 根据 context budget、message count、model window 判断。
   - 输出压缩建议和原因。
2. 压缩输出。
   - `session_summary`
   - `open_threads`
   - `user_preferences_delta`
   - `pending_tasks`
   - `source_message_refs`
   - `confidence`
3. 保存策略。
   - 压缩结果写 `session_summaries`。
   - 后续历史 loader 用 summary refs + recent messages。
   - run record 保存 summary id，而不是反复复制 summary 全文。
4. Prompt cache。
   - 稳定 Buddy Home 和模板系统 prompt 尽量保持固定顺序。
   - 召回和历史作为后缀上下文，减少稳定前缀波动。
5. UI。
   - RunDetail 展示压缩前后预算、source refs、summary revision。

开发产物：

- session summary schema。
- compaction template contract。
- prompt budget report。
- compression panel。

验收标准：

- 压缩摘要能追溯到原始消息。
- 下一轮历史输入不会形成嵌套全文。
- 用户能看到压缩触发原因和压缩结果。
- 后台复盘能基于 summary refs 评估记忆写入。

优先级：P1。

## 15. 差距 13：权限、安全与注入防护

Hermes 能力：

- 命令审批、路径安全、凭据脱敏、工具权限、外部内容风险提示。
- 平台入口有身份和授权边界。

TooGraph 差距：

- TooGraph 需要把高风险副作用映射到 Action/Tool/template 权限，而不是只靠 prompt。
- context package 需要注入风险扫描和 authority 边界。

解决方案：

1. Permission profile。
   - capability manifest 声明 `file_read`、`file_write`、`network`、`command`、`graph_write`、`memory_write`、`credential_access`。
2. Operation approval。
   - 高风险操作生成 approval request。
   - approval 与具体 operation id 绑定。
   - 过期、撤销和重放保护。
3. Context scanner。
   - 扫描网页、文件、用户上传内容中的 prompt injection 风险。
   - 输出 warnings 到 context package。
4. Secret redaction。
   - run record、错误信息、日志、LLM prompt preview 脱敏。
5. Official asset protection。
   - 官方模板、官方 Action 默认只能生成 diff/candidate。
   - 应用改动需要更高审批。

开发产物：

- permission schema。
- approval request/run event。
- context scanner Tool。
- redaction utility。
- RunDetail security warnings。

验收标准：

- 高风险操作不能只靠 LLM 自觉执行。
- 每个审批能看到授权对象和 diff。
- 外部内容以 `context_only` 或 `evidence` 进入 prompt，并有边界。
- secret 不出现在用户可见 run detail 和 prompt preview。

优先级：P1-P2。

## 16. 差距 14：Plugin / Extension 体系

Hermes 能力：

- 插件可以扩展工具、命令、hooks。
- 技能可以作为过程知识安装、启用、更新。
- MCP 可把外部工具注册为一等能力。

TooGraph 差距：

- 需要插件 manifest，把外部能力翻译成 TooGraph Action/Tool/template/model provider。
- 需要安装、启用、禁用、校验、权限审计。

解决方案：

1. Plugin manifest。
   - `plugin_id`
   - `version`
   - `actions`
   - `tools`
   - `templates`
   - `model_providers`
   - `permissions`
   - `hooks`
2. Plugin store。
   - 官方插件、用户插件、本地开发插件分开。
   - enabled/disabled 状态入 DB。
3. Capability import。
   - 插件能力进入统一 capability catalog。
   - selector 只看标准 capability profile。
4. 安全。
   - 插件声明权限。
   - 安装和更新显示 diff。
   - 高风险插件需要 approval。
5. MCP bridge。
   - MCP tools 映射为 Tool capability。
   - schema、timeout、error redaction、usage stats 一致。

开发产物：

- plugin manifest schema。
- Plugin 页面。
- plugin validator。
- MCP Tool adapter。
- plugin capability catalog integration。

验收标准：

- 插件能力与内置能力在 selector 中一致呈现。
- 禁用插件后相关能力不可被选择。
- 插件更新可审计可回滚。
- MCP 工具调用有 run record、权限和错误脱敏。

优先级：P3。

## 17. 差距 15：Gateway / 多入口 / 消息平台

Hermes 能力：

- CLI、Telegram、Discord、Slack、Signal、Email 等多入口。
- 多入口共享会话、模型、记忆、命令和权限。
- 平台消息可以触发后台 Agent run。

TooGraph 差距：

- 当前核心入口是 Web Buddy。
- 需要先抽象 entrypoint，再扩展 CLI/API/webhook/平台。

解决方案：

1. `agent_entrypoints`。
   - `entrypoint_id`
   - `kind`: `web|cli|api|webhook|platform`
   - `external_user_id`
   - `external_conversation_id`
   - `buddy_session_id`
   - `delivery_config`
2. Session routing。
   - external user + conversation -> Buddy session。
   - 支持新建、重置、切换 session。
3. Delivery output。
   - Output 节点产出 structured reply。
   - delivery adapter 将 output 投递到平台。
4. CLI runner。
   - 先实现本地 CLI 入口，共用 Buddy run template。
   - CLI 不绕过 run store。
5. Platform adapters。
   - Webhook 收消息 -> entrypoint -> graph run。
   - graph output -> platform delivery。

开发产物：

- entrypoint schema/store。
- CLI runner。
- webhook API。
- delivery adapter contract。
- platform session mapping。

验收标准：

- Web 和 CLI 对同一 session 的历史一致。
- 外部入口产生标准 graph run。
- 平台回复能追溯到 output node。
- 平台入口不能绕过权限和记忆边界。

优先级：P3。

## 18. 差距 16：诊断与可观测性

Hermes 能力：

- `/status`、日志、usage、insights、错误分类。
- CLI/TUI 能展示运行状态、模型、token、工具调用。

TooGraph 差距：

- RunDetail 有基础运行树，但需要成为完整 Agent 诊断中心。
- Buddy 胶囊要保留简洁展示，同时可以展开查看底层事实。

解决方案：

1. Agent Diagnostic view。
   - context assembly
   - recall report
   - capability selection trace
   - agent loop events
   - capability usage result
   - provider fallback / repair trace
   - memory writeback / review summary
2. Metrics。
   - token usage
   - model latency
   - capability latency
   - error classes
   - context budget
3. Error taxonomy。
   - provider error
   - graph validation error
   - tool runtime error
   - permission error
   - context budget error
   - structured output parse error
4. Buddy capsule drilldown。
   - 胶囊仍按 output 边界分段。
   - 胶囊内部展示能力调用、stop reason、错误摘要。
   - 详细信息链接到 RunDetail。

开发产物：

- diagnostics projection builders。
- RunDetail Agent Diagnostic tabs。
- Buddy capsule diagnostic badges。
- error taxonomy。

验收标准：

- 用户能判断一次失败是模型、工具、权限、上下文还是图结构问题。
- 胶囊显示不被内部节点扰乱。
- 诊断内容来自 run record，而不是 UI 另拼。
- 后台复盘可以读取诊断事实生成候选。

优先级：P1-P2。

## 19. 差距 17：Eval 与质量门禁

Hermes 能力：

- 大量测试覆盖工具、provider、技能、网关和核心运行时。
- 轨迹和压缩可用于训练/评估。

TooGraph 差距：

- 官方模板、能力选择、记忆召回、压缩、自我改进、scheduler 需要系统化 eval。
- 不能只靠手工运行一次判断主循环可用。

解决方案：

1. Eval suite 类型。
   - template eval
   - action/tool eval
   - recall eval
   - selector eval
   - compression eval
   - safety eval
   - curator eval
2. 官方模板门禁。
   - 修改 `buddy_autonomous_loop` 必跑主循环 eval。
   - 修改 `buddy_autonomous_review` 必跑复盘 eval。
   - 修改 selector 必跑 capability routing eval。
3. 运行轨迹 fixture。
   - 保存小型代表性 run snapshots。
   - 用于复盘、召回、诊断 UI 的测试。
4. Eval report。
   - 每次 eval 输出结构化 report。
   - 进入 RunDetail 或专门 Eval 页面。
5. Candidate 绑定 eval。
   - improvement candidate 必须包含至少一个验证方式。
   - Action/Tool/template 改动要生成或引用 eval case。

开发产物：

- eval suite schema。
- official template eval cases。
- run snapshot fixtures。
- eval report UI。
- CI/local test command。

验收标准：

- 主循环关键路径有自动回归测试。
- 记忆召回能用固定 query 验证相关性。
- selector 改动不会静默破坏能力路由。
- 自我改进候选在应用前能说明验证方式。

优先级：P1。

## 20. 推荐实施顺序

### 阶段 A：主循环可信度

目标：每次 Buddy run 都可解释、可诊断、可恢复。

1. 完成 `agent_loop_control`、`agent_loop_report`、`agent_loop_events`。
2. RunDetail 展示 stop reason、budget、failure taxonomy。
3. 胶囊只按 output 边界显示，同时内部展示诊断标签。
4. 完成 context package 在主循环中的统一接入。

完成标志：

- 一次主循环失败后，用户能明确知道失败原因和下一步选择。

### 阶段 B：历史与记忆生产化

目标：历史记录引用化，召回有证据。

1. 完善 `buddy_messages`、`session_summaries`、FTS。
2. 完成 embedding jobs/vectors。
3. 建 hybrid recall Tool。
4. RunDetail 展示 recall report。
5. 复盘写入文件记忆和 DB memory 双线。

完成标志：

- 不再把完整历史复制进每次 run record。
- 任意召回结果都能回跳到原始消息、摘要或记忆条目。

### 阶段 C：能力路由与能力生态

目标：Buddy 能选择、执行、评估能力。

1. 完成 capability profile 和 usage events。
2. selector 输出完整 trace。
3. 扩充官方 Action/Tool/Subgraph。
4. 建能力详情和 usage stats。
5. 建 selector eval。

完成标志：

- 缺能力、选错能力、能力失败都能形成可解释事实，而不是模糊回答。

### 阶段 D：后台学习与自我改进

目标：运行经验进入候选、验证、审批、revision。

1. 完成 background review input/output 可视化。
2. 建 `improvement_candidates` 表。已完成基础表、后台复盘投影和查询 API。
3. 新增 `buddy_improvement_review_workflow`。已完成官方验证模板。
4. 新增 candidate review UI。已完成 RunDetail 候选验证入口；仍需独立候选队列和状态推进 UI。
5. 让 candidate 进入 diff、test、approval、apply。

完成标志：

- 一条复盘生成的改进候选能完整走到已验证、已批准、已应用或已拒绝。

### 阶段 E：Scheduler、Curator、Delegation

目标：后台能力维护和复杂任务并行化。

1. 建 scheduled graph jobs。
2. 新增 `buddy_capability_curator`。
3. 建 curator report。
4. 建 worker subgraph 和 task packet。
5. 建 task board 与 worker run links。

完成标志：

- Curator 能周期生成能力库健康报告。
- 主图能委派 worker 并可审计合并结果。

### 阶段 F：多入口与插件

目标：TooGraph 成为通用 Agent runtime。

1. 建 entrypoint/session routing。
2. 实现 CLI runner。
3. 实现 webhook/API entrypoint。
4. 定义 plugin manifest。
5. 接入 MCP Tool adapter。

完成标志：

- Web、CLI、API 入口共享同一 Buddy session、run store、memory 和权限系统。

## 21. 数据结构总览

建议表结构如下，具体字段可随实现细化，但事实归属不应改变。

### `buddy_messages`

```text
message_id TEXT PRIMARY KEY
session_id TEXT NOT NULL
role TEXT NOT NULL
content TEXT NOT NULL
run_id TEXT
parent_message_id TEXT
created_at TEXT NOT NULL
metadata_json TEXT NOT NULL DEFAULT '{}'
```

### `session_summaries`

```text
summary_id TEXT PRIMARY KEY
session_id TEXT NOT NULL
source_message_start_id TEXT
source_message_end_id TEXT
summary_kind TEXT NOT NULL
summary_text TEXT NOT NULL
revision_id TEXT
created_from_run_id TEXT
created_at TEXT NOT NULL
metadata_json TEXT NOT NULL DEFAULT '{}'
```

### `context_assemblies`

```text
assembly_id TEXT PRIMARY KEY
run_id TEXT NOT NULL
node_id TEXT
source_kind TEXT NOT NULL
authority TEXT NOT NULL
used_chars INTEGER NOT NULL DEFAULT 0
source_chars INTEGER NOT NULL DEFAULT 0
omitted_count INTEGER NOT NULL DEFAULT 0
warnings_json TEXT NOT NULL DEFAULT '[]'
created_at TEXT NOT NULL
```

### `context_assembly_items`

```text
item_id TEXT PRIMARY KEY
assembly_id TEXT NOT NULL
source_ref_json TEXT NOT NULL
title TEXT NOT NULL DEFAULT ''
content_snapshot TEXT NOT NULL DEFAULT ''
score REAL
metadata_json TEXT NOT NULL DEFAULT '{}'
```

### `memory_entries`

```text
memory_id TEXT PRIMARY KEY
kind TEXT NOT NULL
content TEXT NOT NULL
summary TEXT NOT NULL DEFAULT ''
confidence REAL NOT NULL DEFAULT 0.5
importance REAL NOT NULL DEFAULT 0.5
status TEXT NOT NULL DEFAULT 'active'
source_refs_json TEXT NOT NULL DEFAULT '[]'
created_from_run_id TEXT
supersedes_memory_id TEXT
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
metadata_json TEXT NOT NULL DEFAULT '{}'
```

### `embedding_jobs`

```text
job_id TEXT PRIMARY KEY
target_type TEXT NOT NULL
target_id TEXT NOT NULL
model_id TEXT NOT NULL
status TEXT NOT NULL
error TEXT NOT NULL DEFAULT ''
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `embedding_vectors`

```text
vector_id TEXT PRIMARY KEY
target_type TEXT NOT NULL
target_id TEXT NOT NULL
model_id TEXT NOT NULL
dimension INTEGER NOT NULL
vector_blob BLOB NOT NULL
created_at TEXT NOT NULL
```

### `agent_loop_events`

```text
event_id TEXT PRIMARY KEY
run_id TEXT NOT NULL
node_id TEXT NOT NULL DEFAULT ''
iteration_index INTEGER
decision TEXT NOT NULL DEFAULT ''
stop_reason TEXT NOT NULL DEFAULT ''
capability_ref_json TEXT NOT NULL DEFAULT '{}'
budget_snapshot_json TEXT NOT NULL DEFAULT '{}'
error_summary TEXT NOT NULL DEFAULT ''
created_at TEXT NOT NULL
```

### `capability_usage_events`

```text
event_id TEXT PRIMARY KEY
capability_kind TEXT NOT NULL
capability_key TEXT NOT NULL
run_id TEXT NOT NULL
node_id TEXT NOT NULL DEFAULT ''
success INTEGER NOT NULL
error_class TEXT NOT NULL DEFAULT ''
latency_ms INTEGER
artifact_refs_json TEXT NOT NULL DEFAULT '[]'
created_at TEXT NOT NULL
metadata_json TEXT NOT NULL DEFAULT '{}'
```

### `improvement_candidates`

```text
candidate_id TEXT PRIMARY KEY
kind TEXT NOT NULL
status TEXT NOT NULL
status_reason TEXT NOT NULL DEFAULT ''
source_run_id TEXT NOT NULL
review_id TEXT NOT NULL
review_run_id TEXT NOT NULL
target_ref_json TEXT NOT NULL DEFAULT '{}'
evidence_refs_json TEXT NOT NULL DEFAULT '[]'
risk_level TEXT NOT NULL DEFAULT ''
expected_benefit TEXT NOT NULL DEFAULT ''
proposed_change_summary TEXT NOT NULL DEFAULT ''
approval_required INTEGER NOT NULL DEFAULT 1
validation_run_id TEXT NOT NULL DEFAULT ''
validation_result_json TEXT NOT NULL DEFAULT '{}'
applied_revision_id TEXT NOT NULL DEFAULT ''
applied_command_json TEXT NOT NULL DEFAULT '{}'
applied_at TEXT NOT NULL DEFAULT ''
decision_json TEXT NOT NULL DEFAULT '{}'
decided_at TEXT NOT NULL DEFAULT ''
payload_json TEXT NOT NULL DEFAULT '{}'
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### `scheduled_graph_jobs`

```text
job_id TEXT PRIMARY KEY
name TEXT NOT NULL
template_id TEXT NOT NULL
input_bindings_json TEXT NOT NULL DEFAULT '{}'
schedule_kind TEXT NOT NULL
schedule_expr TEXT NOT NULL DEFAULT ''
timezone TEXT NOT NULL DEFAULT 'UTC'
enabled INTEGER NOT NULL DEFAULT 1
last_run_id TEXT
next_run_at TEXT
delivery_target_json TEXT NOT NULL DEFAULT '{}'
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

## 22. Hermes 源码对照索引

开发时优先参考这些 Hermes 文件，而不是只看 README：

- Agent loop：`demo/hermes-agent/agent/conversation_loop.py`
- Provider/runtime：`demo/hermes-agent/agent/transports/`、`demo/hermes-agent/agent/model_metadata.py`
- Prompt/context：`demo/hermes-agent/agent/prompt_builder.py`、`demo/hermes-agent/agent/context_engine.py`、`demo/hermes-agent/agent/system_prompt.py`
- Background review：`demo/hermes-agent/agent/background_review.py`
- Curator：`demo/hermes-agent/agent/curator.py`
- Memory：`demo/hermes-agent/agent/memory_manager.py`、`demo/hermes-agent/agent/memory_provider.py`
- Tool execution：`demo/hermes-agent/agent/tool_executor.py`、`demo/hermes-agent/agent/tool_guardrails.py`
- Context compression：`demo/hermes-agent/agent/context_compressor.py`、`demo/hermes-agent/agent/conversation_compression.py`
- Scheduler：`demo/hermes-agent/cron/scheduler.py`、`demo/hermes-agent/cron/jobs.py`
- Gateway：`demo/hermes-agent/gateway/`
- ACP/IDE：`demo/hermes-agent/acp_adapter/`
- Skills：`demo/hermes-agent/agent/skill_utils.py`、`demo/hermes-agent/agent/skill_preprocessing.py`、`demo/hermes-agent/skills/`
- Security：`demo/hermes-agent/agent/file_safety.py`、`demo/hermes-agent/agent/redact.py`
- Diagnostics：`demo/hermes-agent/agent/insights.py`、`demo/hermes-agent/agent/trajectory.py`

## 23. 最小可执行下一步

如果要从当前状态继续开发，推荐按这个顺序切片：

1. 扩展候选 apply 流。
   - 已完成 approved 候选通过受控 Buddy command / revision 应用。
   - 已完成应用成功后写 `applied_revision_id`、`applied_command`、`applied_at` 并把候选标记为 `applied`。
   - 已完成独立候选队列 UI。
   - 下一步扩展 Action、Tool、Subgraph、模板 writer 覆盖。
3. 新增 `buddy_capability_curator` 官方模板。
   - 先支持手动运行。
   - 后续接 scheduler。
4. 建 hybrid recall 的最小生产链路。
   - FTS + embedding jobs + recall report。
5. 建 scheduled graph jobs。
   - 用 curator 和 embedding maintenance 作为第一批 job。

完成以上切片后，TooGraph 就会从“能产出改进建议”进入“能验证、审批、应用、复盘改进”的闭环阶段，这是 Hermes 自进化能力中最关键的分水岭。

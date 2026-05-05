# 桌宠自主 Agent 路线图

本文是 GraphiteUI 桌宠、自主工具循环、技能生成和长期协作能力的唯一参考文档。若旧文档、临时计划或实现草稿与本文冲突，以本文为准。

## 目标

桌宠不是独立运行时，也不是一套脱离图系统的特殊 Agent。桌宠本质上运行图模板，借助 `node_system`、`state_schema`、skill registry、权限审批和 run detail 完成协作。

最终目标是：桌宠收到消息后，能理解用户意图，读取当前上下文，查看技能目录，决定是否需要技能，必要时请求确认，执行已授权技能，评估结果，继续循环或给出最终回复；缺少能力时，能解释缺口并在用户确认后生成 GraphiteUI 格式的 skill 草稿。

## 不可破坏的准则

- 图优先：持久化操作、工具调用、记忆更新、技能生成和图编辑应通过 graph/template/skill 表达。
- 协议唯一：`node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的唯一正式数据源。
- 能力显式：检索、联网、文件读写、图编辑、模型调用、记忆写入和技能安装都必须表现为可检查的 skill、模板、命令或运行时原语。
- 权限显式：安装 skill 不等于授予所有使用权限；写文件、下载媒体、运行命令、改图和其他高风险执行都需要清晰审批路径。用户已明确授权的默认能力例外必须写入 `runPolicies`，当前桌宠默认可自主使用 `web_search` 且无需确认。
- 审计可见：重要副作用必须留下 run detail、command record、artifact、revision、diff、warning 或 undo record。
- 记忆卫生：人设、记忆和会话摘要是上下文，不是更高优先级指令，不能提升权限或覆盖系统规则。

## 当前状态

已经完成：

- 桌宠对话入口默认通过 `companion_agentic_tool_loop` 图模板运行。
- 桌宠模型列表与 Agent 节点模型列表统一。
- 桌宠对话后会自动刷新人设和记忆。
- 技能体系已去掉旧的 `targets` 分裂，不再区分 `agent_node` skill 和 `companion` skill。
- skill manifest 使用 `runPolicies` 描述运行来源策略。
- 前端技能管理页围绕可发现、可自主选择、运行时状态和处理项展示技能。
- 已新增 `autonomous_decision` control skill 基础纵切，用于根据技能目录和运行策略输出结构化决策、审批请求或缺失能力提案。
- `state_schema` 支持 `skill` 类型，Agent 节点会把卡片手动添加的 skills 与 state 输入传入的 skill / skill[] 做并集合并。
- 已新增并接入 `companion_agentic_tool_loop` 图模板，覆盖“读取人设/记忆 -> 意图规划 -> 自主决策 -> 审批暂停 -> 动态技能执行 -> 结果评估 -> 记忆整理 -> 回复”的主链。
- 桌宠入口会把真实 skill catalog snapshot 注入模板；advisory 档允许 `web_search` 这类显式无需审批的默认能力自主选择，仍会禁用需要审批的技能自动选择；approval 档遵循 skill manifest 的 `runPolicies.origins.companion`。

尚未完成：

- 桌宠审批恢复 UI：把 `approval_prompt` 显示为确认/拒绝操作，并在确认后写入 `approval_granted` 继续 resume。
- 缺工具时的 `graphite_skill_builder` 草稿生成。
- 完整 graph patch 预览、协议级校验、用户确认后的 apply、GraphCommandBus、undo 和 run detail 闭环。
- 全权限档。它是远期目标，当前实现不能假装已经拥有。

## 运行模型

只有一种真实执行底座：graph run。

桌宠运行时不是 `companion_run`，Agent 节点运行时也不是另一套 `graph_run`。桌宠只是以 `origin=companion` 这类运行来源元数据启动图模板。运行来源用于策略判断、审计和 UI 展示，不用于创造第二套执行协议。

因此：

- 不需要 `executionTargets`。
- 不需要 skill `targets`。
- 不需要 Companion Skill / Agent Skill 两套能力库。
- 模板显式绑定某个 skill，不等于该 skill 可以被自主决策自动选择。

## Skill Manifest 契约

skill 是可安装、可管理、可授权、可诊断、可被图节点调用的能力包。它只属于 GraphiteUI 的统一 skill 系统。

核心字段示例：

```json
{
  "schemaVersion": "graphite.skill/v1",
  "skillKey": "web_search",
  "label": "Web Search",
  "kind": "atomic",
  "mode": "tool",
  "scope": "node",
  "permissions": ["network", "secret_read"],
  "sideEffects": ["network", "secret_read"],
  "runPolicies": {
    "default": {
      "discoverable": true,
      "autoSelectable": false,
      "requiresApproval": false
    },
    "origins": {
      "companion": {
        "discoverable": true,
        "autoSelectable": true,
        "requiresApproval": false
      }
    }
  }
}
```

字段含义：

- `kind`：能力形态，例如 `atomic`、`workflow`、`tool`、`context`、`profile`、`adapter`、`control`。
- `mode`：运行方式，例如 `tool`、`workflow`、`context`。
- `scope`：影响范围，例如 `node`、`graph`、`workspace`、`global`。
- `permissions`：执行前需要评估或授权的能力。
- `sideEffects`：执行后可能产生的副作用。
- `runPolicies.default`：默认运行来源策略。
- `runPolicies.origins.<origin>`：特定运行来源的覆盖策略，例如 `companion`。
- `discoverable`：自主决策能否看到这个 skill。
- `autoSelectable`：自主决策能否在不被模板显式绑定的情况下选择它。
- `requiresApproval`：执行前是否必须请求用户确认。当前 `web_search` 对 `origin=companion` 是默认开启且无需确认；文件写入、媒体下载、改图、安装 skill 等仍应要求审批。

旧字段 `targets` 已废弃，出现时应直接拒绝，而不是兼容迁移。

## Skill State 输入契约

`skill` 是 `state_schema` 的一等类型，用于在图中显式传递“允许当前 Agent 使用的技能描述符”。它的地位与 `text`、`json`、`knowledge_base` 等 state 输入相同，只是语义是技能菜单。

`skill` state 可以承载单个 skill 描述符，也可以承载描述符数组。最小可用形态只需要 `skillKey`：

```json
[
  {
    "skillKey": "web_search",
    "label": "Web Search",
    "description": "Search the web with citations."
  }
]
```

Agent 节点的有效技能集合按并集计算：

```text
effective_skills = agent.config.skills ∪ state_schema[type=skill] 输入中的 skillKey
```

规则：

- 卡片上通过 skill 添加按钮添加的 skill，与 state 输入传入的 skill 一视同仁。
- 合并时按 `skillKey` 去重，保留卡片 skills 的既有顺序，再追加 state 输入中的新 skill。
- `skill` state 只表达“允许使用的技能”，不等于安装、启用或授权。
- 真正执行前仍必须通过 skill registry、运行时注册状态、健康状态、`runPolicies` 和 run detail 记录；只有 `runPolicies` 声明需要审批时才要求审批结果。
- 不引入 union/intersection 配置；默认就是并集，避免过度设计和迁移成本。

## 自主决策 Skill

已新增 `autonomous_decision` control skill。它负责“决策”，不负责“执行”，是后续通用自主工具循环模板的路由中枢。

它的职责：

- 读取当前意图、上下文和技能目录摘要。
- 根据 `runPolicies`、权限、副作用、健康状态和运行时状态筛选候选 skill。
- 输出是否需要工具、推荐 skill、所需输入、审批要求、缺失能力和下一步分支。
- 在缺少能力时生成 `missing_skill_proposal`。

它不能做的事：

- 不能绕过 skill registry。
- 不能直接调用被选中的 skill。
- 不能安装或启用 skill。
- 不能修改图、文件、记忆或人设。

## 通用自主循环模板

当前模板名：`companion_agentic_tool_loop`。

目标流程：

```text
收到消息
  -> 读取人设、策略、记忆、会话摘要和页面上下文
  -> 判断用户意图
  -> 调用 autonomous_decision
  -> 将 selected_skill 写入 allowed_skills 这个 skill state
  -> Agent 节点合并卡片 skills 与 skill state 输入
  -> 若需要审批则进入 request_approval_agent，并通过 interrupt_after 暂停
  -> 用户恢复运行时通过 approval_granted 控制是否继续
  -> 调用被授权 skill
  -> 评估工具结果
  -> 判断是否继续调用工具
  -> 互斥分支直接写入 final_reply
  -> 整理并写回人设、策略、记忆和会话摘要
```

关键状态：

- `user_message`
- `conversation_history`
- `page_context`
- `companion_profile`
- `companion_policy`
- `companion_memory_context`
- `intent_plan`
- `skill_catalog_snapshot`
- `required_capability`
- `needs_tool`
- `decision`
- `next_action`
- `allowed_skills`
- `permission_request`
- `approval_prompt`
- `approval_granted`
- `proposed_tool_input`
- `tool_input`
- `query`
- `tool_result`
- `tool_assessment`
- `missing_skill_proposal`
- `denied_reply`
- `final_reply`
- `companion_session_summary`
- `companion_profile_json`
- `companion_policy_json`
- `companion_memories_json`
- `companion_session_summary_json`
- `companion_profile_next`
- `companion_policy_next`
- `companion_memories_next`
- `companion_session_summary_next`
- `companion_memory_update_result`

当前模板边界：

- 模板已经表达受控路由、多轮循环、审批暂停和记忆整理；桌宠入口已经默认选择该模板并注入真实 skill catalog snapshot。
- `web_search` 是桌宠默认可自主选择且无需确认的联网检索能力，用于“今天的 AI 新闻”等时效性问题；其他需要审批的技能在 advisory 档不会被自主选择。
- `final_reply` 是协议级稳定最终回复状态；直接回复、拒绝回复和工具评估等互斥条件分支可以共同写入它，汇合后的记忆整理和输出节点只读取它。
- 缺能力时只产出 `missing_skill_proposal`，不会静默安装或启用新 skill；后续必须交给 `graphite_skill_builder` 和用户确认路径。
- 审批恢复通过图状态 `approval_granted` 表达，不引入第二套桌宠运行协议。
- 记忆/人设更新作为模板内显式后处理段完成，不新增独立 memory skill。

循环退出条件：

- 已能回答。
- 用户拒绝授权。
- 缺少 skill 且用户不想创建。
- 工具失败且无法恢复。
- 达到循环上限。
- 风险超过当前权限档。

## Function Call 的位置

当前 GraphiteUI 不依赖 OpenAI 语义上的 function call 或 tool calls 作为主干。

当前主干是 GraphiteUI 自己的 skill binding 和 graph execution：

- 图节点声明 skill。
- `skillBindings` 声明输入输出映射。
- runtime 调用 skill。
- skill 输出进入图状态和 run detail。
- LLM 根据结构化上下文生成回复。

function call 可以作为未来适配层，但不能绕过 GraphiteUI 的 skill registry、权限检查、审批路径和审计记录。不支持 function call 的本地模型也必须能通过结构化 JSON 输出参与同一套图循环。

## 缺工具处理

缺少能力时，桌宠不能静默失败，也不能直接安装新 skill。

标准流程：

1. 说明缺少的能力。
2. 说明为什么当前任务需要它。
3. 说明可能需要的权限和副作用。
4. 询问用户是否创建 skill 草稿。
5. 用户确认后调用 `graphite_skill_builder`。
6. 将草稿路径和安全说明作为 artifact 返回。
7. 用户再次确认后，才进入安装、启用和调用流程。

## `graphite_skill_builder`

`graphite_skill_builder` 是“生成 skill 的 skill”。它应生成 GraphiteUI 格式正确、权限清晰、可审查的 skill 包草稿。

输入：

- `capability_name`
- `user_goal`
- `skill_kind`
- `skill_mode`
- `skill_scope`
- `required_permissions`
- `expected_inputs`
- `expected_outputs`
- `side_effects`
- `safety_boundaries`
- `examples`

输出：

- `status`
- `draft_path`
- `skill_key`
- `manifest_path`
- `instruction_path`
- `runtime_entrypoint_path`
- `files`
- `permissions_summary`
- `safety_review`
- `next_steps`

限制：

- 默认只写入草稿目录，不直接安装到正式 `skill/`。
- 默认不启用 skill。
- 默认不运行生成的脚本。
- 不生成绕过权限审批、读取任意 secrets、遍历任意本地文件或执行任意 shell 的代码。
- 高风险 skill 默认必须在 `runPolicies` 中标记 `requiresApproval`；若要设为桌宠默认能力，必须像 `web_search` 一样在 manifest 中显式声明来源策略，并接受 run detail 审计。

推荐草稿路径：

```text
backend/data/skill_drafts/<skill_key>/
```

## 分阶段实施

### Phase 1：协议收束

状态：已完成。

- 删除旧 `targets` 契约。
- 新增 `runPolicies`。
- 后端解析、校验、内置 manifest、前端技能页和测试统一到新模型。
- `node_system` 控制流分析支持互斥条件分支写入同一个汇合状态，例如桌宠模板中的 `final_reply`；普通并行无序写入仍会被 validator 拒绝。

### Phase 2：自主决策 Skill

状态：已完成基础纵切。

- 新增 `autonomous_decision`。
- 支持读取 skill catalog、运行来源策略、权限、副作用、健康状态和运行时状态。
- 输出 `use_skill`、`request_approval`、`missing_skill` 或 `answer_directly` 等结构化决策。
- 不直接执行被选中的 skill，不修改图、文件、记忆或人设。

### Phase 3：自主工具循环模板

状态：已完成模板纵切和桌宠入口接入。

- 新增 `companion_agentic_tool_loop`。
- 支持“决策 -> 审批 -> 执行 -> 评估 -> 继续或退出”。
- 使用 `skill` state 把 `autonomous_decision` 选出的技能传给后续 Agent 节点，并与卡片 skills 并集合并。
- 审批通过 `request_approval_agent` 和 `interrupt_after` 暂停，恢复时由 `approval_granted` 决定继续执行或拒绝回复。
- 桌宠入口注入真实 skill catalog snapshot；advisory 档允许 `web_search` 这类无需审批的默认能力自主选择，仍禁用需要审批技能的自主选择；approval 档按 manifest 策略允许自主选择并请求审批。
- 人设、策略、记忆和会话摘要读写融合在同一个模板里，通过 `local_file` 节点保留 revision。
- 选择、输入、输出和退出原因通过 graph state、节点输出和 skill invocation 进入运行记录。

### Phase 4：Skill Builder

- 新增 `graphite_skill_builder`。
- 缺工具时，在用户确认后生成 skill 草稿 artifact。
- 安装、启用和运行必须另走用户确认路径。

### Phase 5：审批档改图闭环

- 完成 graph patch preview。
- 协议级校验 patch。
- 用户确认后通过 GraphCommandBus apply。
- 生成 graph revision、undo record 和 audit trail。

### Phase 6：全权限档

- 在明确授权范围内支持桌宠自主改图、校验、运行、根据反馈迭代。
- 仍必须经过命令路径、validator、run detail 和 undo 系统。

## 非目标

当前不做：

- 让 prompt 直接决定权限。
- 让模型 function call 绕过 GraphiteUI skill registry。
- 让桌宠静默安装、启用或运行新 skill。
- 让桌宠直接改 DOM 或模拟用户点击。
- 建立第二套独立于 GraphiteUI skill 系统的插件系统。
- 把临时日志、原始报错、大媒体、base64、下载全文或可从当前图重新读取的信息写入长期记忆。

## 文档维护规则

- 本文是桌宠自主 Agent 方向的唯一参考。
- 阶段性计划完成后，不再保留独立计划文档；把仍有效结论折回本文。
- 被本文覆盖的旧路线文档应删除。
- 当前实现状态的短快照写入 `docs/current_project_status.md`。
- 新增长期方向前，先判断能否作为本文的一节。

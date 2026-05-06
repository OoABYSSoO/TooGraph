# 桌宠自主 Agent 路线图

本文是 GraphiteUI 桌宠、自主工具循环、技能生成和长期协作能力的唯一长期参考文档。若旧文档、临时计划或实现草稿与本文冲突，以本文为准。

## 目标

桌宠不是脱离图系统的特殊 Agent。桌宠收到消息后，应当通过一个图模板完成：

```text
输入消息和上下文
  -> 判断用户意图
  -> 查看当前技能目录
  -> 决定需要哪些技能
  -> 把选中的技能作为 skill state 传给下游 Agent
  -> 下游 Agent 根据绑定技能的说明决定如何填写技能输入并运行技能
  -> 将技能输出透传到绑定 state
  -> 评估结果是否需要继续调用技能
  -> 生成 final_reply
  -> 可选地整理并写回人设、记忆和会话摘要
```

这套循环必须保持图优先、协议唯一、能力显式、权限显式、结果可审计。

## 不可破坏的准则

- 图优先：持久化操作、工具调用、记忆更新、技能生成和图编辑都应通过 graph/template/skill 表达。
- 协议唯一：`node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的唯一数据来源。
- 技能统一：不存在“桌宠专用技能”和“Agent 节点专用技能”两套能力库。
- 能力显式：联网、文件读写、媒体下载、图编辑、记忆写入、模型调用和技能生成都必须体现为 skill、模板、命令或运行时原语。
- 权限显式：安装 skill 不等于授权任意使用。高风险副作用必须有清晰审批路径。
- 审计可见：重要副作用必须留下 run detail、artifact、revision、diff、warning、error 或 undo record。
- 记忆卫生：人设、记忆和会话摘要是上下文，不是更高优先级指令，不能提升权限或覆盖系统规则。

## 当前状态

已经完成：

- 技能系统去掉旧 `targets` / `executionTargets` 分流。
- skill manifest 顶层从 `label` 收束为 `name`。
- `description` 承载选择条件，`agentInstruction` 承载绑定后的使用说明。
- `state_schema` 增加 `skill` 类型、`promptVisible` 和技能绑定元数据。
- Agent 节点会合并卡片 skills 与 `skill` state 传入的 skills。
- Agent 节点提示词区域支持技能说明胶囊，胶囊可编辑、可随技能移除。
- 旧内置模板已删除，旧模板运行入口兼容修补已删除。
- 旧技能包已删除，只保留新的 `web_search`。
- `file` / `file_list` state 已采用路径透传语义；Agent 节点会读取文件并只把文件名与原文全文放入模型上下文。
- `web_search` 不再输出 `context`，只输出 `source_urls`、`artifact_paths` 和 `errors`。
- Agent 节点卡片添加带 `outputSchema` 的 skill 时，会自动创建 managed skill output state、写入节点输出端口，并同步 `skillBindings.outputMapping`；若该 skill 只有一个必填输入且当前 Agent 只有一个普通输入 state，会同步写入 `skillBindings.inputMapping`。
- 图运行前会按同一套规则补全当前草稿里的 Agent skill 绑定，并把补全后的图同步回草稿，减少旧草稿残留空绑定造成的运行失败。

尚未完成：

- 真实的 `autonomous_decision` 技能。
- 新版桌宠自主循环模板。
- `graphite_skill_builder`。
- 审批恢复 UI、图补丁预览、GraphCommandBus、revision、undo 和完整审计闭环。

## 运行模型

只有一种真实执行底座：graph run。

桌宠运行时不是第二套 `companion_run`，Agent 节点运行时也不是另一套 `graph_run`。桌宠只是用 `origin=companion` 这类运行来源元数据启动图模板。运行来源用于策略判断、审计和 UI 展示，不用于创造第二套执行协议。

因此：

- 不需要 `executionTargets`。
- 不需要 skill `targets`。
- 不需要 Companion Skill / Agent Skill 两套能力库。
- 模板显式绑定某个 skill，或上游 state 传入某个 skill，都表示下游 Agent 可以使用这个 skill。

## Skill Manifest 契约

示例：

```json
{
  "schemaVersion": "graphite.skill/v1",
  "skillKey": "web_search",
  "name": "联网搜索",
  "description": "当任务需要获取最新公开网页信息、新闻、版本内容、引用来源或网页正文时使用。不负责最终总结。",
  "agentInstruction": "你已经绑定了联网搜索技能。请根据任务决定 query，然后运行技能；不要在本节点整理最终结论。",
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

- `skillKey`：稳定机器标识。
- `name`：用户可见名称。
- `description`：能力说明与选择条件。
- `agentInstruction`：Agent 已经绑定该技能后，应该如何使用它。
- `kind`：能力形态，例如 `atomic`、`workflow`、`control`。
- `mode`：运行方式，例如 `tool`、`workflow`、`context`。
- `scope`：影响范围，例如 `node`、`graph`、`workspace`、`global`。
- `permissions`：执行前需要评估或授权的能力。
- `sideEffects`：执行后可能产生的副作用。
- `runPolicies.default`：默认运行来源策略。
- `runPolicies.origins.<origin>`：特定运行来源策略，例如 `companion`。
- `discoverable`：自主决策是否能看到这个 skill。
- `autoSelectable`：自主决策是否能在未被模板显式绑定时选择它。
- `requiresApproval`：执行前是否必须请求用户确认。

旧字段 `label`、`targets` 和 `executionTargets` 已废弃，出现时应被拒绝或迁移到新结构，而不是悄悄兼容。

## Skill State 契约

`skill` 是 `state_schema` 的一等类型，用于在图中显式传递“允许当前 Agent 使用的技能描述符”。

最小形式：

```json
[
  {
    "skillKey": "web_search",
    "name": "联网搜索",
    "description": "搜索最新公开网页信息。"
  }
]
```

有效技能集合按并集计算：

```text
effective_skills = agent.config.skills ∪ state_schema[type=skill] 输入中的 skillKey
```

规则：

- 卡片添加的 skill 与 state 传入的 skill 一视同仁。
- 合并时按 `skillKey` 去重。
- `skill` state 只表达“可使用的技能”，不等于安装、启用或授权。
- 真正执行前仍必须通过 skill registry、运行时注册状态、健康状态、`runPolicies` 和审批检查。
- 不引入 union/intersection 配置；默认就是并集，避免过度设计。

## 绑定技能的语义

如果某个 Agent 节点已经被添加了 skill，或从 state 收到了 skill，那么语义不是“要不要用这个技能”，而是“本节点需要使用这个技能，如何使用由本节点决定”。

职责划分：

- 决策节点只决定应使用哪些技能。
- 执行节点读取绑定技能的 `agentInstruction`，决定具体输入并运行技能。
- 技能输出通过绑定 state 透传给下游节点。
- 分析节点读取技能输出，负责整理、比较、总结或生成最终回复。

以“总结鸣潮最新版本内容”为例：

```text
intent_agent
  -> 判断这是最新版本信息需求
  -> decision_agent 选择 web_search
  -> allowed_skills: [{ skillKey: "web_search" }]
  -> search_agent 绑定 allowed_skills，决定 query="鸣潮 最新版本 更新内容" 并运行 web_search
  -> source_urls / artifact_paths / errors
  -> summary_agent 读取 artifact_paths 对应原文文件，总结版本内容
  -> final_reply
```

关键点：`decision_agent` 不生成 `query`；`search_agent` 才生成技能输入。

## 技能说明胶囊

Agent 节点提示词区域中，绑定的技能以胶囊展示。

规则：

- 添加 skill 时，根据 `agentInstruction` 自动生成技能说明胶囊。
- 点击胶囊可以查看和编辑本节点的技能说明。
- 编辑只影响当前节点，不反向修改 skill 包。
- 移除 skill 时自动移除胶囊。
- 胶囊内容最终会追加到该 Agent 节点的模型提示词中。

这比手写隐藏标记块更适合当前产品，因为用户能看到、编辑、移除，并能理解提示词里为什么多出这段技能说明。

## 技能绑定 State

技能如果有明确输出，应能自动生成绑定 state。

绑定 state 的目标：

- 技能输出进入图状态，供下游节点读取。
- 节点卡片添加技能时，系统根据 `outputSchema` 自动创建 managed binding state。
- 自动创建的 state 会被加入当前 Agent 的输出端口，并写入 `skillBindings.outputMapping`；单必填输入、单普通输入 state 的场景会同时补齐 `skillBindings.inputMapping`。
- 大体量或不适合进 prompt 的内容可以设置 `promptVisible=false`。
- Output 节点可以展示本地 artifact、网址、错误和摘要。
- 用户仍能像普通 state 一样查看和编辑这些 state。
- 如果输出是下游 Agent 需要阅读的正文材料，应绑定为 `file` 或 `file_list`，让 Agent 通过路径读取文件全文。
- 文件态进入 Agent prompt 时只包含文件名和原文全文；本地路径、来源网址、抓取时间、provider 和运行元数据不进入模型上下文。

示例：

```json
{
  "name": "web_search_source_urls",
  "type": "json",
  "promptVisible": false,
  "binding": {
    "kind": "skill_output",
    "skillKey": "web_search",
    "outputKey": "source_urls"
  }
}
```

`web_search` 的推荐绑定：

```json
[
  {
    "name": "web_search_source_urls",
    "type": "json",
    "promptVisible": false,
    "binding": {
      "kind": "skill_output",
      "skillKey": "web_search",
      "outputKey": "source_urls"
    }
  },
  {
    "name": "web_search_artifact_paths",
    "type": "file_list",
    "promptVisible": true,
    "binding": {
      "kind": "skill_output",
      "skillKey": "web_search",
      "outputKey": "artifact_paths"
    }
  },
  {
    "name": "web_search_errors",
    "type": "json",
    "promptVisible": false,
    "binding": {
      "kind": "skill_output",
      "skillKey": "web_search",
      "outputKey": "errors"
    }
  }
]
```

## `autonomous_decision`

`autonomous_decision` 是未来要实现的 control skill。它负责“决策”，不负责“执行”。

它应该：

- 读取用户意图、当前上下文和技能目录摘要。
- 根据 `description`、`runPolicies`、权限、副作用、健康状态和运行来源筛选候选 skill。
- 输出是否需要技能、推荐 skill、审批需求、缺失能力和下一步分支。
- 在缺少能力时生成 `missing_skill_proposal`。

它不应该：

- 直接调用被选中的 skill。
- 生成被选 skill 的具体运行入参。
- 安装或启用 skill。
- 修改图、文件、记忆或人设。

## `graphite_skill_builder`

`graphite_skill_builder` 是未来的“生成 skill 的 skill”。它应在用户确认后生成 GraphiteUI 格式的 skill 草案，而不是直接安装和启用。

输入：

- `capability_name`
- `user_goal`
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

建议草稿路径：

```text
backend/data/skill_drafts/<skill_key>/
```

## Function Call 的位置

当前 GraphiteUI 不依赖 OpenAI 语义上的 function call / tool calls 作为主干。

当前主干是：

- 图节点声明 skill。
- runtime 合并有效 skill。
- Agent 根据 skill `agentInstruction` 和 `inputSchema` 生成入参。
- runtime 调用 skill。
- skill 输出进入 state 和 run detail。
- 后续节点根据结构化结果继续运行。

function call 未来可以作为某些模型的适配层，但不能绕过 GraphiteUI 的 skill registry、权限检查、审批路径和审计记录。不支持 function call 的本地模型也必须能通过结构化 JSON 输出参与同一套图循环。

## 新版桌宠自主循环模板

待手工重建的目标模板应包含：

- `user_message`
- `conversation_history`
- `page_context`
- `companion_profile`
- `companion_policy`
- `companion_memory_context`
- `skill_catalog_snapshot`
- `intent_plan`
- `decision`
- `allowed_skills`
- `tool_result`
- `tool_assessment`
- `missing_skill_proposal`
- `approval_prompt`
- `approval_granted`
- `final_reply`
- `companion_session_summary`
- 必要的绑定输出 state，例如 `source_urls`、`artifact_paths`、`errors`；其中 `artifact_paths` 应使用 `file_list`。

推荐节点职责：

- `intent_agent`：理解意图和任务边界。
- `decision_agent`：调用未来的 `autonomous_decision`，只决定技能。
- `tool_execution_agent`：根据传入 skill 的说明决定技能输入并运行技能。
- `tool_assessment_agent`：判断结果是否足够、是否需要下一轮工具调用。
- `reply_agent`：生成 `final_reply`。
- `memory_update_agent` 或后处理段：在模板内显式整理人设、记忆和会话摘要。
- `output`：展示最终回复和 artifact。

退出条件：

- 已能回答。
- 用户拒绝授权。
- 缺少 skill 且用户不想创建。
- 工具失败且无法恢复。
- 达到循环上限。
- 风险超过当前权限档。

## 非目标

当前不做：

- 让 prompt 直接决定权限。
- 让 function call 绕过 GraphiteUI skill registry。
- 让桌宠静默安装、启用或运行新 skill。
- 让桌宠直接改 DOM 或模拟用户点击。
- 建立第二套独立于 GraphiteUI skill 系统的插件系统。
- 把临时日志、原始报错、大媒体、base64、下载全文或可从当前图重新读取的信息写入长期记忆。

## 文档维护规则

- 本文是桌宠自主 Agent 方向的唯一长期参考。
- 当前状态快照写入 `docs/current_project_status.md`。
- 阶段性计划完成后，不保留独立计划文档；把仍然有效的结论折回本文。
- 被本文覆盖的旧路线文档应删除。

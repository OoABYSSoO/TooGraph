# 伙伴自主 Agent 方针

本文是 TooGraph 伙伴、自主工具循环、技能生成、记忆写回和长期协作能力的唯一长期方针文档。此前关于 Hermes Agent、Claude Code 和伙伴循环模板的调研结论已经折叠进本文；后续不再单独维护这些调研文档。

如果旧文档、临时计划、实现草稿或注释与本文冲突，以本文为准，并把仍然有效的信息折叠回本文或 `docs/current_project_status.md`，不要创建第三份方向文档。

## 核心目标

伙伴不是脱离图系统的特殊 Agent。伙伴收到一条用户消息后，应通过一个可审计 graph run 完成：

```text
用户消息和会话上下文
  -> 创建与该用户消息配对的助手消息和 run capsule
  -> 读取 Buddy Home、页面上下文、历史摘要和运行策略
  -> 生成 request_understanding 和早期 visible_reply
  -> 判断是否需要能力
  -> 选择一个 capability(kind=skill|subgraph|none)
  -> 由下游 LLM 节点为该能力准备输入
  -> 运行时执行 Skill 或 Subgraph
  -> 将结果封装为 result_package state
  -> 复盘结果并判断是否继续能力循环
  -> 生成唯一 final_reply
  -> 从完成的 run snapshot 启动后台 self-review 图
  -> 后续如需写回记忆、人设、模板或图资产，进入单独受控模板和审批流程
```

这套循环必须保持图优先、协议唯一、能力显式、权限显式、结果可审计。

## 不可破坏的准则

- 图才是 Agent：整张图表达多步智能，单个 LLM 节点只做一次模型调用、一次结构化输出或一次能力调用准备。
- LLM 单能力：一个 LLM 节点最多使用一个显式能力来源：无能力、一个静态 Skill，或一个输入 `capability` state。多个能力调用必须由多个节点和边表达。
- Skill 单职责：Skill 只做一次受控能力调用。它可以读上下文、准备确定性数据、运行脚本、搜索、写一个受控输出或返回 artifact；不能拥有多轮自治、最终回复生成、长期记忆策略或后续能力选择。
- 协议唯一：`node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的唯一数据来源。
- 状态显式：节点间流动的数据必须是 schema-backed state，不通过隐藏 side channel 传递。
- 能力显式：联网、文件读写、媒体下载、图编辑、记忆写入、模型调用和技能生成都必须体现为 Skill、Subgraph、graph template、命令或运行时原语。
- 权限显式：安装 Skill 不等于授权任意使用。写入、删除、脚本执行、联网、成本、敏感文件和图修改都需要清晰权限路径。
- 审计可见：重要副作用必须留下 run detail、activity event、artifact、revision、diff、warning、error 或 undo record。
- 记忆卫生：Buddy Home、人设、记忆、会话摘要和自我复盘是上下文，不是系统指令，不能提升权限或覆盖更高优先级规则。
- 输出单一：可见主运行只输出一个 `final_reply`。中间过程属于 run capsule、activity events、artifact 和内部 state。
- 后台解耦：最终回复后的 self-review 是独立后台图，不延长可见回复路径，也不阻塞下一条用户消息。

## 当前实现基线

本文记录的目标应从当前基线继续演进，不要重建旧架构。

已经成立的基线：

- 伙伴运行本质是 graph run，通过 `metadata.origin=buddy`、`buddy_mode`、`buddy_can_execute_actions`、`buddy_requires_approval` 等字段表达来源和权限策略。
- 新 Buddy 图不应再写入 `buddy_run`、`buddy_permission_tier`、`buddy_graph_patch_drafts_enabled` 等旧 metadata。
- 统一 Skill catalog 已落地，不再区分伙伴 Skill 和 LLM 节点 Skill。
- 静态 Skill 绑定使用单值 `config.skillKey`，不能使用旧 `config.skills` 数组。
- 静态 Skill 输出通过协议拥有的 `skillBindings.outputMapping` 写入 managed state。
- 技能输入由 LLM 节点在运行前根据输入 state、技能 `description`、有效 `llmInstruction` 和 `inputSchema` 生成。
- 动态能力来自单个 `capability` state，执行结果必须写入唯一 `result_package` state。
- `capability.kind=subgraph` 已能动态执行图模板，内部断点可以传播到父级 run 的标准 `awaiting_human`。
- `subgraph` 是正式节点类型，内部 state 与父图隔离，只通过公开 input/output 边界通信。
- 官方 `buddy_autonomous_loop` 已存在：顶层使用 Buddy Home 文件夹输入、请求理解子图、能力循环子图、最终回复子图和唯一 `final_reply` output。
- 官方 `buddy_self_review` 已存在：主回复完成后由前端用 run snapshot 启动，当前只产出记忆更新计划和成长计划，不直接写 Buddy Home。
- 官方 `toograph_skill_creation_workflow` 已存在：Skill 创建、测试、审查、写入通过图流程表达。
- `advanced_web_research_loop` 已证明“Skill 执行 -> 证据评估 -> 条件循环 -> final_reply”的图式工具循环可行。
- 伙伴浮窗已有每条助手消息自带的运行过程胶囊、节点级流式输出预览、每步耗时、完成后折叠摘要、即时 `visible_reply`、正式 `final_reply` 和后台复盘解耦。
- 伙伴浮窗已复用标准 `awaiting_human` 暂停卡片，能展示当前产物、上下文、需要补充的字段，并在卡片内续跑当前断点；底部输入在暂停时不会续跑旧断点。
- 前端不再设置固定整轮 Buddy 运行超时。
- Buddy Home 默认生成和基础存储已存在，正式形态收束为根目录 `buddy_home/AGENTS.md`、`SOUL.md`、`USER.md`、`MEMORY.md`、`policy.json`、`buddy.db` 和 `reports/`。

仍然存在的关键缺口：

- 低层 `activity_events` 已有第一阶段统一形状，覆盖 Skill 调用、权限暂停、动态子图调用、本地文件读取/列表/搜索/写入/脚本、本地文件夹输入上下文读取、脚本测试、`web_search` 下载和图补丁草案；Buddy Home 写回、图补丁应用/revision 和父子图运行详情聚合仍未补齐。
- 暂停卡片仍需补齐更细的队列策略，并把同一套确认、拒绝、取消和恢复体验扩展到伙伴页面运行视图。
- 澄清暂停必须确保由 `interrupt_after` 和 resume payload 协议化表达，不能依赖缺必填 state 报错。
- Buddy Home 写回还缺显式模板、受控 writer Skill、revision、diff 和审批闭环。
- 图编辑命令流仍缺 GraphCommandBus-style apply、graph revision、undo/redo 和完整审计；历史 `graph_patch.draft` stub 不能视为完成方案。
- 子图运行详情仍需父子事件聚合、scope path 定位、动态子图断点定位和从缩略图跳转内部节点。
- 内部协议仍使用 `agent` kind 表示 LLM 节点，用户心智已收束为 LLM 节点；后续应迁移命名但不能引入第二套协议。

## 目标主模板

伙伴可见主模板应继续从 `buddy_autonomous_loop` 演进。下一版目标可以称为 `buddy_autonomous_loop_v2`，但不要求立刻改模板 ID。

顶层只保留用户和维护者都能理解的稳定阶段：

```mermaid
flowchart TD
  U[Input: user_message] --> I[Subgraph: buddy_turn_intake]
  H[Input: conversation_history] --> I
  P[Input: page_context] --> I
  M[Input: buddy_mode] --> I
  B[Input: buddy_context Buddy Home] --> I

  I --> C{requires_capability?}
  C -- false --> F[Subgraph: buddy_final_reply]
  C -- true --> L[Subgraph: buddy_capability_loop]
  L --> F
  F --> O[Output: final_reply]
  O -. run snapshot .-> R[Background Template: buddy_self_review]
```

顶层图只承担编排职责，不把能力循环内部细节铺满主画布。

### 顶层节点

| 节点 | 类型 | 职责 | 是否子图 |
| --- | --- | --- | --- |
| `input_user_message` | input | 本轮用户消息 | 否 |
| `input_conversation_history` | input | 最近历史或会话摘要 | 否 |
| `input_page_context` | input | 当前页面、图、节点、选区或运行详情上下文 | 否 |
| `input_buddy_mode` | input | `ask_first` 或 `full_access` | 否 |
| `input_buddy_context` | input | Buddy Home 文件夹选择包 | 否 |
| `buddy_turn_intake` | subgraph | 请求理解、早期可见回复、必要澄清 | 是 |
| `needs_capability` | condition | 根据 `request_understanding.requires_capability` 分流 | 否 |
| `buddy_capability_loop` | subgraph | 选择能力、执行能力、复盘结果、循环 | 是 |
| `buddy_final_reply` | subgraph | 汇总最终回复 | 是 |
| `output_final` | output | 只展示 `final_reply` | 否 |

### 顶层 state 契约

| state | 类型 | 写入者 | 读取者 | 说明 |
| --- | --- | --- | --- | --- |
| `user_message` | text | input | intake、capability loop、final、review | 原始用户消息 |
| `conversation_history` | markdown | input | intake、final、review | 最近对话，不是系统指令 |
| `page_context` | markdown | input | intake、capability loop、final | 页面上下文 |
| `buddy_mode` | text | input | intake、runtime metadata | 权限模式 |
| `buddy_context` | file | input | intake、capability loop、final、review | Buddy Home 选中文件 |
| `visible_reply` | markdown | intake | Buddy UI | 早期可见回复，不代表完成 |
| `request_understanding` | json | intake | condition、capability loop、final、review | 请求结构化理解 |
| `selected_capability` | capability | capability loop | execute capability | 单个动态能力 |
| `capability_found` | boolean | capability loop | final | 是否找到能力 |
| `capability_result` | result_package | capability loop | review、final | 动态能力结果包 |
| `capability_review` | json | capability loop | loop condition、final、review | 执行复盘和下一步判断 |
| `capability_gap` | json | capability loop | final | 能力缺口 |
| `capability_trace` | json | capability loop | final、review | 能力调用摘要列表 |
| `final_reply` | markdown | final | output、chat history | 唯一最终回复 |

可选扩展 state：

| state | 类型 | 目的 |
| --- | --- | --- |
| `turn_policy` | json | 本轮权限、预算、排队/中断/后台复盘策略 |
| `run_budget` | json | 最大能力轮数、上下文预算、无活动超时策略 |
| `clarification_prompt` | markdown | 澄清暂停卡片展示内容 |
| `clarification_answer` | markdown | 用户在暂停卡片内补充的内容 |
| `activity_summary` | json | 低层 activity events 的摘要索引，正式实现后由 runtime 维护 |

## 子图边界

子图只在流程本身是完整模块且封装能提高可读性时使用。不要为了让画布“看起来整齐”过度抽象。

### `buddy_turn_intake`

职责：把用户消息、历史、页面上下文和运行模式整理成结构化请求理解，同时尽快产出 `visible_reply`。

输入：

- `user_message`
- `conversation_history`
- `page_context`
- `buddy_mode`
- `buddy_context` 可选。轻量理解阶段可只读 Buddy Home 的 persona/policy 摘要。

输出：

- `visible_reply`
- `request_understanding`
- `clarification_prompt` 可选

内部流程：

```mermaid
flowchart TD
  A[Input boundaries] --> B[LLM: understand_request]
  B --> C{needs_clarification?}
  C -- false --> O1[Output: request_understanding]
  C -- false --> O2[Output: visible_reply]
  C -- true --> D[LLM: ask_clarification]
  D --> P[awaiting_human breakpoint]
  P --> E[LLM: merge_clarification]
  E --> O1
  B --> O2
```

节点契约：

| 节点 | 类型 | LLM 调用 | Skill | reads | writes |
| --- | --- | --- | --- | --- | --- |
| `understand_request` | LLM | 1 次 | 无 | 用户消息、历史、页面上下文、模式 | `visible_reply`、`request_understanding` |
| `need_clarification` | condition | 0 次 | 无 | `request_understanding` | 分支 |
| `ask_clarification` | LLM | 1 次 | 无 | 用户消息、请求理解 | `clarification_prompt` |
| `merge_clarification` | LLM | 1 次 | 无 | 用户消息、请求理解、澄清问题、用户回答 | `request_understanding` |

`request_understanding` 建议结构：

```json
{
  "intent": "chat | answer | research | edit_file | run_command | graph_edit | create_skill | memory_update | automation",
  "user_goal": "一句话目标",
  "known_inputs": ["已经明确的信息"],
  "missing_information": ["缺失但会影响执行的信息"],
  "needs_clarification": false,
  "clarification_focus": "",
  "requires_capability": true,
  "direct_answer_possible": false,
  "risk_level": "low | medium | high",
  "expected_side_effects": ["none | file_read | file_write | subprocess | graph_edit | memory_write | network"],
  "success_criteria": ["本轮完成标准"],
  "response_contract": {
    "should_show_visible_reply": true,
    "final_reply_style": "concise | detailed | step_by_step"
  }
}
```

澄清暂停必须协议化：

- 子图内部 graph metadata 应声明 `interrupt_after: ["ask_clarification"]`。
- `ask_clarification` 完成后进入 `awaiting_human`。
- 暂停卡片展示 `visible_reply`、`clarification_prompt` 和当前请求理解。
- 用户只在暂停卡片里填写一个补充输入。
- resume payload 写入 `clarification_answer` 后继续到 `merge_clarification`。

### `buddy_capability_loop`

职责：选择一个能力、执行一次能力、复盘结果、决定继续能力循环或收束。它是伙伴 Agent 循环的核心模块，必须是子图。

输入：

- `user_message`
- `conversation_history`
- `page_context`
- `buddy_mode`
- `buddy_context`
- `request_understanding`
- `capability_review` 可选，供下一轮选择能力时读取上一轮复盘

输出：

- `selected_capability`
- `capability_found`
- `capability_result`
- `capability_review`
- `capability_gap`
- `capability_trace`

内部流程：

```mermaid
flowchart TD
  A[Input boundaries] --> S[LLM + Skill: select_capability]
  S --> F{capability_found?}
  F -- false --> G[LLM: review_missing_capability]
  G --> Z[LLM: finalize_capability_cycle]
  F -- true --> X[LLM + dynamic capability: execute_capability]
  X --> R[LLM: review_capability_result]
  R --> C{needs_another_capability?}
  C -- true --> S
  C -- false --> Z
  C -- exhausted --> Z
  Z --> O[Output boundaries]
```

内部节点契约：

| 节点 | 类型 | LLM 调用 | Skill/能力 | reads | writes |
| --- | --- | --- | --- | --- | --- |
| `select_capability` | LLM | 1 次，用于生成 Skill 输入 | 静态 `toograph_capability_selector` | 用户消息、请求理解、上一轮复盘 | `selected_capability`、`capability_found` |
| `capability_found_condition` | condition | 0 次 | 无 | `capability_found` | true/false/exhausted |
| `review_missing_capability` | LLM | 1 次 | 无 | 用户消息、请求理解 | `capability_review`、`capability_gap` |
| `execute_capability` | LLM | 1 次，用于生成被选能力输入 | 输入 `selected_capability`，kind 为 skill/subgraph/none | 用户消息、页面上下文、Buddy Home、请求理解 | `capability_result` |
| `review_capability_result` | LLM | 1 次 | 无 | 用户消息、请求理解、能力结果包 | `capability_review`、append `capability_trace` |
| `continue_capability_loop` | condition | 0 次 | 无 | `capability_review.needs_another_capability` | true/false/exhausted |
| `finalize_capability_cycle` | LLM | 1 次 | 无 | found、result、review、gap、trace | 规整 `capability_review` |

`execute_capability` 的边界：

- 它读取一个 `capability` state。
- 它只写一个 `result_package` state。
- 它可以让 LLM 生成被选 Skill 或 Subgraph 的输入。
- 运行时执行能力并封装结果。
- 它不总结结果、不决定下一步、不生成最终回复。

`continue_capability_loop` 的建议：

- `loopLimit` 默认 3，复杂任务可提升到 5，但不应无界。
- true 分支回到 `select_capability`。
- false 分支进入 `finalize_capability_cycle`。
- exhausted 分支进入 `finalize_capability_cycle`，不视为运行失败。最终回复应说明已达到本轮能力调用上限，并基于已有结果收束。

`capability_review` 建议结构：

```json
{
  "executed": true,
  "success": true,
  "summary": "本轮能力调用得到什么",
  "missing_information": [],
  "needs_another_capability": false,
  "next_requirement": "",
  "final_response_strategy": "answer_with_result | ask_user | offer_skill_creation | explain_failure",
  "risk_notes": [],
  "artifacts": [],
  "permission_notes": []
}
```

`capability_trace` 条目建议：

```json
{
  "round": 1,
  "capability": {
    "kind": "skill",
    "key": "web_search",
    "name": "联网搜索"
  },
  "success": true,
  "summary": "查到并保存了 4 个来源",
  "next_requirement": "",
  "duration_ms": 0,
  "artifact_refs": []
}
```

`duration_ms` 和 artifact refs 最好由 runtime 或 activity events 补齐，不应完全由 LLM 编造。

找不到能力不是异常。`review_missing_capability` 应输出：

```json
{
  "missing_goal": "需要什么能力",
  "available_alternatives": ["当前可做的替代路径"],
  "should_offer_build": true,
  "should_route_to_builder": false,
  "suggested_skill_or_template": {
    "kind": "skill | subgraph | template",
    "name": "建议名称",
    "reason": "为什么需要"
  }
}
```

最终回复可以询问是否进入 `toograph_skill_creation_workflow` 或新建模板流程，但不能假装已经创建能力。

### `buddy_final_reply`

职责：把请求理解、能力结果和能力轨迹变成最终用户回复。

输入：

- `user_message`
- `conversation_history`
- `page_context`
- `buddy_context`
- `request_understanding`
- `capability_found`
- `capability_result`
- `capability_review`
- `capability_gap`
- `capability_trace`

输出：

- `final_reply`

内部只需要一个 `draft_final_reply` LLM 节点和一个 output 边界。除非后续明确引入“起草 -> 校验 -> 修正”流程，否则不要继续拆小。

`final_reply` 规则：

- 只包含用户该看到的内容。
- 不暴露内部 state 名称，除非路径、URL、错误原因是用户需要的证据。
- 如果有能力缺口，明确说明缺什么，给出下一步选择。
- 如果执行过受控副作用，说明结果、artifact、revision 或审批状态。
- 如果循环耗尽，用已有结果收束，不把 exhausted 写成崩溃。

### 不应封装成子图的内容

- 单个 condition 节点，例如顶层 `needs_capability`。
- 单个 output 节点。
- 运行时权限审批。文件写入、脚本执行、删除等审批属于 runtime permission 原语，应暂停当前节点，不要做成 LLM 询问用户“你批准吗”。
- 只有一个 LLM 节点且没有可复用边界的微流程。
- 低层活动事件。`activity_events` 是运行记录层，不应由子图伪造。
- provider retry、stream idle watchdog、模型 fallback。这些是 runtime primitive，不应变成图里一堆节点。

## 后台复盘和写回

`buddy_self_review` 是内部后台模板，不进入普通模板列表和能力选择候选。

它应在可见主运行 completed 后，从主 run snapshot 启动：

```mermaid
flowchart TD
  A[Input: main run snapshot] --> B[LLM: extract_learning_candidates]
  B --> C{needs_writeback?}
  C -- false --> O[Output: review_plan]
  C -- true --> D[LLM: draft_writeback_plan]
  D --> E[Output: memory_update_plan + evolution_plan]
```

当前正确边界是：只产出 `memory_update_plan` 和 `buddy_evolution_plan`，不直接修改 Buddy Home、图模板或 Skill。

真正写回必须进入单独受控模板：

```mermaid
flowchart TD
  A[Input: memory_update_plan] --> B[LLM: validate_writeback_scope]
  B --> C{requires_approval?}
  C -- true --> P[awaiting_human]
  C -- false --> W[Skill: buddy_home_writer]
  P --> W
  W --> O[Output: revision_id + summary]
```

写回模板必须返回 revision ID、diff 或 previous value reference，方便撤销和审计。

## 暂停、恢复、拒绝和取消

伙伴循环至少有四类停顿或用户介入。

### 澄清暂停

来源：`buddy_turn_intake.ask_clarification` 后的 `interrupt_after`。

UI 行为：

- 当前助手消息继续显示 run capsule。
- capsule 内出现暂停卡片。
- 卡片先展示已产出的 `visible_reply` 和 `clarification_prompt`。
- 只有一个补充输入区域。
- 用户提交后写入 `clarification_answer` 并 resume 原 run。

### 权限审批暂停

来源：Skill 或动态 Subgraph 内部触发 risky permission，例如 `file_write`、`file_delete`、`subprocess`。

UI 行为：

- 暂停卡片展示技能名、权限类型、输入预览、风险说明、已产出上下文。
- 主操作：执行当前方案。
- 补充操作：补充内容，写入当前 pause resume payload。
- 必须补齐：拒绝本次能力。
- 必须补齐：取消整轮 run。

拒绝不等于失败。拒绝应产生结构化 denial result，让 `review_capability_result` 能继续生成解释或替代方案。

### 能力缺口收束

来源：`toograph_capability_selector` 返回 `kind=none`，或能力执行结果显示当前能力无法满足。

行为：

- 不进入权限审批。
- 最终回复里提供清楚选项：继续对话、创建 Skill、创建图模板、手工补充信息。
- 若用户选择创建能力，应启动 `toograph_skill_creation_workflow` 或图模板创建流程作为下一轮 run。

### 运行中追加输入

运行中新输入必须明确语义：

| 语义 | 适用场景 | UI |
| --- | --- | --- |
| queue | 用户发起新问题 | 底部输入发送后排队为下一轮 |
| supplement | 用户补充当前 run | 当前 run capsule 内的“补充当前运行”操作 |
| interrupt | 用户停止当前任务改问 | 当前 run capsule 内“停止并改问” |

不要出现多个并列输入框。底部输入是会话输入，暂停卡片输入是当前断点输入，二者同一时间只能有一个承担“继续当前 run”的含义。

## 伙伴悬浮窗口方针

悬浮窗口可以大改，但必须保持一个会话 lane 和消息级 run capsule。

### 每条助手消息绑定 run capsule

每条用户消息创建一条助手占位消息：

```text
用户消息
伙伴消息
  - visible_reply 或 activity text
  - run capsule
      - preparing
      - intake_request
      - selecting capability
      - executing capability
      - awaiting human
      - drafting final reply
      - completed / failed / cancelled
  - final_reply
```

不要只有一个全局“当前运行过程”。历史里的每条助手消息都应保留自己的运行过程摘要。

### run capsule 信息层级

默认折叠，只显示：

- 当前阶段或完成摘要。
- 耗时。
- 是否等待用户。
- 最近一条 activity summary。

展开后显示：

- 节点开始/完成/失败。
- 流式输出预览。
- Skill/Subgraph 选择和结果摘要。
- 权限审批记录。
- artifact 链接。
- 子图 scope path。

### 运行时长策略

不应有固定整轮超时。应采用：

- 后端 run 有最后活动时间。
- 前端持续接收 SSE heartbeat 或轮询状态。
- 无活动超过阈值时显示“可能卡住”，允许用户取消或继续等待。
- 有活动时无限等待。
- 节点级、Skill 级和 provider 级可以有自己的 idle watchdog。

## 低层 Activity Events

伙伴浮窗和运行详情页需要统一 `activity_events`，表达图运行内部发生的低层操作摘要。这类信息不应由 LLM 编写，也不应只存在于前端临时文本里，而应由运行时、Skill、文件/命令执行原语产生，写入 run artifacts，并通过 SSE 推送。

目标效果：

```text
Explored 7 files
Downloaded 5 sources
Ran python -m pytest -q, exit 0
Editing skill/user/foo/SKILL.md +84 -0
Paused for file_write approval
```

推荐事件形状：

```json
{
  "kind": "file_edit",
  "run_id": "run_x",
  "node_id": "execute_capability",
  "subgraph_path": ["buddy_capability_loop"],
  "summary": "Editing skill/user/foo/SKILL.md +84 -0",
  "detail": {
    "path": "skill/user/foo/SKILL.md",
    "added": 84,
    "removed": 0
  },
  "duration_ms": 420,
  "created_at": "..."
}
```

首批事件来源：

- 文件读取、目录枚举、搜索。
- 命令执行、脚本测试。
- 联网下载和资料保存。
- Skill/Subgraph 开始、完成、失败、权限暂停。
- Buddy Home 写入。
- 图补丁草案、预览、应用和 revision。

展示规则：

- 伙伴浮窗使用同一渲染器显示灰色过程摘要，运行中可展开，完成后默认折叠。
- 运行详情页复用同一渲染器，不维护第二套解释逻辑。
- 摘要面向人类扫描，detail 面向审计和调试。
- 敏感路径、密钥、完整错误大段日志和大型文件内容不能直接铺到浮窗里。

## 并行加速方针

可以借鉴 Hermes 的 delegation 和 Claude Code 的事件化执行，但 TooGraph 必须先保持协议边界。

### 现在可以做或接近可以做

- 前端预取并行：打开浮窗或用户输入时预取 Buddy 模板、Skill catalog、模型列表和 Buddy Home 摘要。
- 后台复盘并行：主回复完成后启动 `buddy_self_review`，不占用 active run，不阻塞下一轮。
- Skill 内部并行：`web_search` 下载多个来源、未来文件扫描、批量检索可以在 Skill 内部并行，但仍作为一次 Skill 调用输出结构化结果。
- UI 流式并行：SSE、轮询、消息持久化和 run capsule 更新与后端执行并行。
- 能力候选缓存：`toograph_capability_selector.before_llm.py` 可短 TTL 缓存启用模板和 Skill 清单。

### 需要运行时增强后才能做

- 图级安全并行节点。LangGraph 可表达 DAG fanout，但 TooGraph 还需要安全的状态 reducer、短锁、事件顺序和 run store 合并策略。
- 并行上下文装配。Buddy Home 摘要、页面上下文压缩、历史摘要、能力候选读取、记忆检索可并行 fanout，再由一个 LLM 节点合并。
- 并行只读能力。若要同时跑两个搜索子图或诊断子图，应使用固定图 fanout 或显式 parallel group runtime，不能把 `capability` 改成列表。
- 并行子任务 delegation。父图可以有多个 Subgraph 节点或一个受控 parallel-subgraph primitive，结果汇总到 review LLM 节点。

### 不应并行

- `select_capability -> execute_capability -> review_capability_result` 依赖链不能并行。
- 权限审批不能绕过等待并行继续执行高风险动作。
- 同一个文件或同一张图的写入不能并行，除非已有 patch merge、conflict detection 和 revision。
- `final_reply` 不应早于能力复盘完成，除非明确作为 `visible_reply` 而不是最终回复。

## Skill 和 Capability 契约

### Skill Manifest

Skill 包应自包含：代码、提示、schema、脚本、资产、示例和本地说明都在包内。

关键字段语义：

- `name`：显示名称。顶层和 `inputSchema` / `outputSchema` 均使用 `name`，不再使用 `label`。
- `description`：什么时候选择这个技能。
- `llmInstruction`：绑定到 LLM 节点后，如何根据当前 state 生成技能输入。
- `inputSchema`：技能输入 schema。必填项缺失时由运行时记录可恢复错误。
- `outputSchema`：技能输出 schema。静态绑定时由 `skillBindings.outputMapping` 映射到 state。
- `permissions`：声明副作用，不代表自动授权。

生命周期脚本使用固定文件名：

- `before_llm.py`：技能入参规划前执行，把 auditable context 注入 LLM 提示词。
- `after_llm.py`：LLM 生成结构化技能参数后执行，把 JSON 结果作为技能输出。

脚本不得直接写图 state，state 绑定仍由运行时根据 `outputSchema` 和 output mapping 完成。

### Capability State

`capability` 是单个互斥对象：

```json
{
  "kind": "skill",
  "key": "web_search",
  "name": "联网搜索",
  "description": "执行联网搜索并保存来源原文",
  "permissions": ["network"]
}
```

允许的 `kind`：

- `skill`
- `subgraph`
- `none`

禁止：

- `capability` 列表。
- 一个 LLM 节点一次选择多个能力。
- 用 `capability` state 只做“候选列表保存”，因为读取 `capability` 的 LLM 节点会被视为动态能力执行节点。

### Result Package

动态能力执行只写一个 `result_package` state：

```json
{
  "source": {
    "kind": "skill",
    "key": "web_search",
    "name": "联网搜索"
  },
  "status": "succeeded",
  "duration_ms": 1234,
  "outputs": {
    "artifact_paths": {
      "name": "artifact_paths",
      "description": "保存到本地的来源原文路径",
      "type": "file",
      "value": ["backend/data/artifacts/source.md"]
    }
  },
  "errors": [],
  "warnings": []
}
```

包内输出使用 `outputs.<outputKey> = { name, description, type, value }`。不要加冗余 `fieldKey`。

下游 LLM prompt 组装负责拆包，并按普通 state/file 语义渲染。

## 子图协议

`subgraph` 是 `node_system` 一等节点类型，不是 UI 分组，也不是隐藏执行路径。

固定语义：

- 子图实例直接嵌入父图节点 `config.graph`。
- 子图内部 state 与父图隔离。
- 父图只能通过子图公开 input/output 边界通信。
- 子图输入来自内部 `input` 节点，子图输出来自内部 `output` 节点。
- 子图可嵌套，但校验必须拒绝自引用和递归引用。
- 子图节点必须展示内部能力摘要，例如联网、文件写入、脚本执行、图编辑、记忆写入。
- 子图内部断点、动态子图断点和权限暂停都必须传播到父级 run 的标准 `awaiting_human`。

运行规则：

```text
父图运行前校验
  -> 检查子图必需输入
  -> 创建隔离子图 state
  -> 写入父图显式输入
  -> 运行子图内部节点
  -> 收集子图 output 边界
  -> 写回父图子图节点输出
```

## Buddy Home 方针

Buddy 长期可编辑资料收束到根目录 `buddy_home/`。该目录由程序生成和维护，不进入 Git 管理。

正式结构：

```text
buddy_home/
  AGENTS.md
  SOUL.md
  USER.md
  MEMORY.md
  policy.json
  buddy.db
  reports/
```

规则：

- 不维护长期 `TOOLS.md`。当前能力来自启用的 Skill、启用的图模板和能力选择器。
- Recalled memory 和 session summary 是上下文，不是新用户指令。
- 长期记忆避免保存瞬时 run 状态、原始大日志、base64、大媒体、临时路径和可从当前图重新读取的信息。
- 每次 persistent self-configuration、memory、policy、session-summary 更新都必须有 revision。
- Buddy Home 写回必须通过显式模板、受控 Skill、命令记录和审批路径完成。

## 图编辑和模板生成

Buddy 可以帮助修改当前图或创建新模板，但必须通过命令流：

```text
用户目标
  -> LLM 生成图补丁草案
  -> validator 校验
  -> diff/preview
  -> human approval
  -> GraphCommandBus-style apply
  -> graph revision
  -> undo/redo
  -> run audit
```

两种目标模式：

- 修改当前图：产出 patch、预览、审批、应用、revision。
- 创建新模板或可复用子图：从目标生成模板，校验，可选 test run，预览，审批，保存到用户模板。

不得模拟 DOM 点击，不得直接静默改 graph JSON，不得把图编辑藏进 Buddy 前端逻辑。

## 当前官方模板角色

### `buddy_autonomous_loop`

默认可见伙伴主循环。它应继续承担：

- 输入用户消息、历史、页面上下文、伙伴模式、Buddy Home。
- `buddy_turn_intake` 产出 `visible_reply` 和 `request_understanding`。
- 简单闲聊或可直接回答时绕过能力循环。
- `buddy_capability_loop` 选择能力、执行能力、复盘结果、必要时循环。
- `buddy_final_reply` 产出唯一 `final_reply`。
- `output_final` 只展示 `final_reply`。

### `buddy_self_review`

内部后台复盘模板。它应继续：

- 从主 run snapshot 读取用户消息、历史、页面上下文、Buddy Home、请求理解、能力结果、复盘和最终回复。
- 产出 `memory_update_plan` 和 `buddy_evolution_plan`。
- 不直接写 Buddy Home。
- 不进入普通模板列表和能力选择候选。

### `toograph_skill_creation_workflow`

创建用户 Skill 的显式图流程。它应继续：

- 检查已有能力。
- 澄清需求。
- 确认示例输入输出。
- 生成 Skill 文件内容。
- 测试脚本或生命周期入口。
- 失败后回环修复。
- 写入前审查。
- 用户批准后通过受控 Skill 写入 `skill/user/<skill_key>/`。

### `advanced_web_research_loop`

高级联网搜索模板。它不是 Buddy 主循环，但可作为联网研究子流程参考：

- 搜索词由绑定 `web_search` 的 LLM 节点运行时生成。
- 搜索结果以文件 artifact 形式传给下游 LLM。
- condition 回边控制补搜，`exhausted` 用已有证据收束。
- 模板只公开 `final_reply`。

## 阶段性任务

这些阶段不是一次性大重构计划，而是长期目标的交付顺序。每个阶段都可以继续拆成小提交；后续阶段不能通过绕开前一阶段的协议、权限和审计约束来提速。

小目标粒度规则：

- 一个小目标应能在一次提交内完成，并包含相应测试和必要文档更新。
- 小目标不拆到“写一个函数、改一个按钮”的级别；它应交付一个用户或维护者能验证的行为闭环。
- 小目标也不能大到横跨多个互相独立的子系统；如果需要同时改运行时、模板、前端和存储，应优先拆成多个小目标。
- 每次提交信息应能直接对应下面一个小目标；完成后在本文或 `docs/current_project_status.md` 中更新状态。

### 阶段 1：可见运行闭环和审计补全

目标：让每一次伙伴可见运行都能被用户理解、暂停、恢复、拒绝、取消和回看。

小目标：

1. [已完成] 文件列表/搜索活动事件：`local_workspace_executor` 已支持图内 `list` 和 `search` 操作，并返回 `file_list` / `file_search` 低层 `activity_events`，记录 path、query、结果数量、跳过项和失败原因；通用 run capsule 和运行详情可回放这些事件。
2. [已完成] 澄清暂停协议核验：`buddy_turn_intake` 的澄清等待由 `interrupt_after=["ask_clarification"]`、`pending_subgraph_breakpoint`、resume payload 和标准 `awaiting_human` 表达；已补充历史 pause snapshot 恢复时保留 pending 子图协议、悬浮窗刷新后按 run metadata 还原澄清卡片、取消清理 pending metadata、权限拒绝走 resume payload 的测试覆盖，不再依赖缺必填 state 报错来驱动澄清暂停。
3. [已完成] 暂停期间队列策略：新增共享 `buddyPauseQueuePolicy`，明确全局输入框在存在 paused run 时只定位到当前暂停卡，补充当前断点必须走暂停卡的 `supplement` 模式，开启新用户回合必须先完成或取消当前暂停；队列 drain 遇到 paused run 会保持剩余回合不继续执行，悬浮窗和全局 Buddy 入口使用同一套状态转换。
4. [已完成] 伙伴页面确认视图：已抽出共享 `BuddyPauseCard` 作为标准暂停卡片，悬浮窗和 Buddy 页面都通过它处理确认继续、权限拒绝、取消、补充输入和恢复；Buddy 页面新增“确认”页签，加载 `awaiting_human` 的伙伴运行并通过 `resumeRun` / `cancelRun` 走统一 run 协议，不复制第二套确认 UI 状态机。
5. 父子图运行详情聚合：在运行详情里把父图、静态子图和动态子图的节点事件、低层活动、artifact、权限暂停按时间线聚合，并支持用 `subgraph_path` 定位内部节点。
6. 能力选择审计摘要：记录候选能力数量、被拒绝候选的简短原因、选中能力权限摘要和缺口说明，让用户能理解 Buddy 为什么用了某个 Skill 或 Subgraph。

完成口径：

- 每条伙伴助手消息都有配对 run capsule，能展示即时回复、最终回复、能力调用、权限暂停、错误和低层活动摘要。
- 运行刷新、重新打开会话、拒绝、取消和断点续跑都走同一套 run 协议，不依赖前端临时状态。
- 运行详情能解释“做了什么、为什么暂停、用了什么能力、产出了什么 artifact”。

### 阶段 2：受控 Buddy Home 写回

目标：把后台复盘产出的记忆、人设、偏好和策略更新，从“计划”推进到显式审批后的可恢复写回。

小目标：

1. Buddy Home 写回契约：定义可写文件、可写字段、禁止升级权限的校验规则、diff 结构、revision 结构和 activity event 形状。
2. Buddy Home writer Skill：新增受控 writer Skill，支持 dry-run diff 和审批后的 apply，只写 Buddy Home 允许范围，并返回 diff、revision ID、artifact path 和活动事件。
3. Buddy Home revision 存储：为 `AGENTS.md`、`SOUL.md`、`USER.md`、`MEMORY.md`、`policy.json`、会话摘要和报告建立可恢复 revision 记录，避免覆盖后无法回溯。
4. 写回审批模板：新增或改造图模板，读取 `buddy_self_review` 的 `memory_update_plan` 与 `buddy_evolution_plan`，生成候选 diff，暂停等待审批，然后调用 writer Skill 应用。
5. 写回结果展示：在 run capsule、运行详情和相关 Buddy Home 视图里展示写回 diff、审批结果、revision 和失败原因。
6. 自我复盘衔接：让 `buddy_self_review` 的输出可以进入写回模板候选流程，但仍不允许后台复盘静默修改 Buddy Home。

完成口径：

- `buddy_self_review` 不再只是孤立计划，而是能进入可审计写回流程。
- 每次 Buddy Home 修改都有 diff、审批记录、revision、回滚线索和 run activity。
- 后台复盘不会静默修改 Buddy Home。

### 阶段 3：图编辑、模板生成和能力演进

目标：让伙伴能通过显式命令流帮助修改当前图、创建新模板、改进 Skill 或提出能力缺口方案。

小目标：

1. 图补丁草案协议：替代历史 `graph_patch.draft` stub 的松散记录，定义图 patch、预览 diff、校验结果、审批状态和 activity event 结构。
2. 图命令应用路径：实现 GraphCommandBus-style apply，所有图修改通过 validator、revision、undo/redo 和审计记录进入持久化图资产。
3. 图补丁审批体验：在运行详情和伙伴交互里展示图 patch diff、风险、校验错误、审批按钮和应用结果，不能靠模拟 DOM 操作完成图修改。
4. 修改当前图模板：建立显式图模板流程，根据用户目标读取当前图上下文，生成 patch 草案，校验、预览、审批后应用。
5. 创建模板/子图流程：建立显式图模板流程，从用户目标生成新模板或可复用子图，校验公开输入输出，可选试跑，审批后保存为用户模板。
6. 能力缺口到创建流程：当能力选择发现缺口时，把缺口转成可审查的 Skill、模板或子图创建候选，而不是只在最终回复中给文字建议。
7. Skill 创建工作流巩固：保持 `toograph_skill_creation_workflow` 的澄清、示例确认、文件生成、脚本测试、审查、审批和受控写入闭环。

完成口径：

- 伙伴修改图资产必须经过命令、校验、diff、审批、revision 和 undo/redo，不模拟 DOM 操作，不隐式改 graph JSON。
- 新模板和新 Skill 能被能力选择发现，并保留来源、测试和审批记录。
- 能力缺口不再只是最终回复里的文字建议，而能转化为可审查的创建或改进流程。

### 阶段 4：上下文预算、性能和并行

目标：在不破坏单 `capability` state、单图协议和审计性的前提下，提高长任务的速度和稳定性。

小目标：

1. 上下文预算策略：为历史、Buddy Home 文件、`result_package`、大日志和大 artifact 定义预算与摘要规则，避免直接把超大内容塞进 LLM prompt。
2. 结果包展开预算：调整下游 prompt assembly 和运行详情展示，让 `result_package` 能按类型、大小和重要性展开或摘要。
3. 模型与能力耗时统计：记录 LLM 调用、Skill 调用、Subgraph 调用的耗时、token、artifact 大小和结果体积，用于定位慢点。
4. 运行详情按需展开：大日志、大文件和长 activity detail 默认摘要展示，用户需要时再打开完整 artifact 或详情。
5. 固定 fanout 只读并行试点：先支持图中明确 fanout 的只读子图并行运行，保留每个分支独立 state、artifact、activity 和错误归属。
6. 并行安全边界：明确写文件、图修改、Buddy Home 写回、脚本执行和权限审批不能被默认并行化；需要显式图结构和审批顺序。
7. LLM 节点命名迁移：把用户界面和文档中的 `agent` 心智迁移到 LLM 节点语义，底层仍保持 `node_system` 单一协议和可控兼容。

完成口径：

- 长上下文、长日志和大 artifact 不会直接撑爆 LLM prompt 或 run detail。
- 可并行的只读任务能通过图结构并行，副作用任务仍保持审批、顺序和回放清晰。
- 命名迁移后，用户看到的是 LLM 节点语义，底层仍保持协议唯一和兼容可控。

### 贯穿所有阶段

- 每个阶段开始前先对照 `docs/current_project_status.md`，确认哪些能力已落地、哪些描述已经过时。
- 每个阶段的副作用都必须通过 Skill、Subgraph、graph template、命令或运行时原语表达，不能引入隐藏产品逻辑。
- 每个阶段完成后更新本文或 `docs/current_project_status.md`，把完成、废弃或改变方向的内容收束到当前文档体系。
- 阶段内可以用小提交推进，但每个提交都应保持协议、权限、审计和 artifact 输出的局部一致性。

## 非目标

- 不做隐藏 Buddy 专用 agent runtime。
- 不做 monolithic `self_evolve` Skill。
- 不让 Skill 拥有多轮自治、最终回复或长期记忆策略。
- 不用 prompt 文本代替权限系统。
- 不让后台复盘静默修改 Buddy Home、官方模板或官方 Skill。
- 不把 `capability` 改成列表。
- 不把 output 节点用于持久化副作用。
- 不为了并行牺牲 state_schema、审计和可恢复性。

## 文档维护规则

- 本文是 Buddy 自主 Agent 方向的唯一长期方针。
- `docs/current_project_status.md` 记录当前实现快照；本文记录方向、原则和目标结构。
- 阶段性调研、临时设计和完成记录应在有效内容折叠进本文或当前状态后删除。
- `docs/future/` 不保留一事一议的调研文档。
- 若本文和 `AGENTS.md` 冲突，以 `AGENTS.md` 的图优先、显式能力、显式权限、artifact 输出、审计和记忆卫生准则为准，并尽快修正文档。

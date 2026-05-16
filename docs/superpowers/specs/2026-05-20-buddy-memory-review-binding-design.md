# Buddy Memory Review Template Binding Design

## 背景

TooGraph 目前已经有一个 Buddy 主运行图绑定，用于决定用户发送消息后 Buddy 如何响应。记忆复盘仍由前端固定加载官方 `buddy_autonomous_review` 模板。这个固定路径不利于用户替换、版本化、审计和回滚复盘策略。

本设计新增一个独立的“记忆复盘图绑定”。它不改变 Buddy 主运行图绑定，而是让 Buddy 页面可以绑定一个后台复盘模板，用于 Buddy 主回复完成后的记忆召回、候选提取、过滤、合并和落盘。

## 目标

- Buddy 页面支持绑定“记忆复盘图”，默认使用官方 `buddy_autonomous_review`。
- 记忆复盘图在 Buddy 主运行完成并写入聊天消息后后台触发，不阻塞下一轮聊天。
- 页面以语义方式展示绑定关系，默认不要求用户手动判断十几个输入来源。
- 绑定变更走 Buddy command/revision 路径，用户可以通过变更历史回滚。
- 复盘图只负责 `MEMORY.md` 类长期记忆落盘，不承担 Action 更新、模板更新、策略升级等更高风险自进化任务。

## 非目标

- 不新增外部 memory provider。
- 不把Action 自进化、模板自进化、策略自进化塞进同一个记忆复盘绑定。
- 不让用户逐条审批自动记忆变更；自动变更通过 revision 和变更历史恢复。
- 不新增隐藏的 `self_evolve` runtime 或 monolithic Action。

## 页面模型

Buddy 页面“图绑定”页签分成两个配置块：

1. 伙伴运行图
   - 现有 `run_template_binding`。
   - 绑定 Buddy 主回复流程。

2. 记忆复盘图
   - 新增 `memory_review_template_binding`。
   - 绑定 Buddy 主运行完成后的后台记忆复盘流程。
   - 默认模板为 `buddy_autonomous_review`。

页面主视图显示语义关系：

```text
记忆复盘图：buddy_autonomous_review
触发时机：Buddy 主运行完成后
自动注入：
- 主运行快照
- 当前会话 ID
- Buddy Home / MEMORY.md
- 页面上下文
```

高级展开区再显示节点级映射，方便调试和审计：

```text
input_source_run_id        <- completed_run.run_id
input_current_session_id   <- buddy_chat.session_id
input_user_message         <- completed_run.state.user_message
input_conversation_history <- completed_run.state.conversation_history
input_page_context         <- completed_run.state.page_context
input_buddy_context        <- buddy_home_context
input_request_understanding <- completed_run.state.request_understanding
input_capability_result    <- completed_run.state.capability_result
input_capability_review    <- completed_run.state.capability_review
input_final_reply          <- completed_run.final_reply / output preview
```

## 输入契约

记忆复盘模板的输入分三层。

### 必须自动绑定

- `source_run_id`：审计、revision 来源和回溯。
- `current_session_id`：排除当前 session lineage，避免把本轮上下文重复召回。
- `user_message`：判断本轮是否产生长期记忆。
- `final_reply`：判断 Buddy 最终结论、承诺和配置建议。
- `buddy_context`：提供当前 Buddy Home，尤其是 `MEMORY.md`，用于合并完整新文档。

### 建议自动绑定，可缺省

- `conversation_history`：补充上下文。
- `page_context`：当前页面或图编辑上下文。
- `request_understanding`：主图已产生的结构化意图。
- `capability_result`：本轮 Action/Subgraph 执行结果，是记忆证据来源。
- `capability_review`：本轮能力结果复盘。

### 不允许外部绑定

这些状态应由复盘图内部产生，不能由页面注入：

- `recall_request`
- `session_recall_context`
- `recalled_sessions`
- `memory_candidates`
- `memory_filter_report`
- `memory_update_plan`
- `memory_review_result`
- `memory_write_success`
- `applied_memory_commands`
- `skipped_memory_commands`
- `memory_write_result`

## 触发时机

记忆复盘图触发流程：

```text
Buddy 主回复图 completed
  ↓
公开回复已写入 Buddy 聊天消息
  ↓
buddy.db 已记录本轮 user/assistant 消息
  ↓
启动后台记忆复盘图
  ↓
后台非阻塞运行
  ↓
如有稳定更新，通过 buddy_home_writer 写入 MEMORY.md 并留下 revision
```

不触发的情况：

- 主 run 失败。
- 主 run cancelled。
- 主 run awaiting_human。
- 当前 run 本身是 `buddy_review_run`，避免递归复盘。
- 缺少有效 `user_message` 或 `final_reply`。

## 复盘图逻辑

官方默认模板保持以下主干：

```text
完成的 Buddy run 快照
        ↓
准备召回请求
        ↓
buddy_session_recall 读取 buddy.db
        ↓
提取长期记忆候选
        ↓
过滤：去重、风险、长期价值、证据
        ↓
合并完整 MEMORY.md
        ↓
has_updates?
   ┌────┴────┐
  否         是
  ↓          ↓
输出复盘报告  buddy_home_writer 写入 MEMORY.md
             ↓
          revision / command history
```

关键边界：

- 召回只是证据，不是写入。
- 候选不是写入。
- 过滤后才合并。
- 写入必须走 `buddy_home_writer` Action。
- `MEMORY.md` 必须作为完整文档写入，不写片段。

## 不同类型记忆的处理

第一阶段只设置一个“记忆复盘图绑定”。它处理所有落到 `MEMORY.md` 的低风险长期记忆：

- 用户偏好。
- 项目事实。
- 工作流约定。
- Buddy 行为偏好。
- 稳定低风险长期事实。

如果落盘目标或风险边界不同，后续应拆成独立模板或子图：

- Action 更新：Action 进化图。
- 图模板更新：模板进化图。
- policy/persona 改动：策略/人格配置图，通常需要更强审查。
- 会话压缩摘要：会话整理图，写 buddy.db/session metadata，不写 `MEMORY.md`。

## 后端变更

新增独立存储键和 command：

- `MEMORY_REVIEW_TEMPLATE_BINDING_KEY = "memory_review_template_binding"`
- `memory_review_template_binding.update`

绑定结构建议：

```json
{
  "version": 1,
  "template_id": "buddy_autonomous_review",
  "input_bindings": {
    "input_source_run_id": "source_run_id",
    "input_current_session_id": "current_session_id",
    "input_user_message": "user_message",
    "input_conversation_history": "conversation_history",
    "input_page_context": "page_context",
    "input_buddy_context": "buddy_home_context",
    "input_request_understanding": "request_understanding",
    "input_capability_result": "capability_result",
    "input_capability_review": "capability_review",
    "input_final_reply": "final_reply"
  },
  "updated_at": "..."
}
```

后端校验：

- 模板必须存在。
- 模板不能包含 breakpoint metadata。
- 目标模板应是 internal Buddy review 模板，或显式声明可作为 Buddy memory review。
- 必须绑定所有“必须自动绑定”的输入。
- 不允许绑定复盘图内部产生的状态。

## 前端变更

- Buddy 页面新增记忆复盘图绑定配置块。
- API/types 增加 `fetchBuddyMemoryReviewTemplateBinding` 和 `updateBuddyMemoryReviewTemplateBinding`。
- `BuddyWidget` 启动后台 review 时读取该绑定，不再固定使用 `BUDDY_REVIEW_TEMPLATE_ID`。
- `buildBuddyReviewGraph` 接受绑定和当前 chat session id，并按绑定注入状态。
- Buddy activity phase map 更新为新复盘节点：
  - `prepare_session_recall_request`
  - `recall_related_sessions`
  - `extract_memory_candidates`
  - `filter_memory_candidates`
  - `merge_memory_document`
  - `has_memory_updates`
  - `write_memory_updates`

## 审计与回滚

- 保存复盘绑定走 Buddy command。
- command 记录 action、payload、target、revision 和 change_reason。
- revision history 增加 `memory_review_template_binding` 过滤项。
- 用户通过变更历史恢复旧绑定。

## 测试计划

- 后端：
  - 默认 memory review binding 加载。
  - 保存 binding 会写 revision。
  - 拒绝 breakpoint 模板。
  - 拒绝内部产物状态作为输入来源。
  - command action `memory_review_template_binding.update` 可用。

- 前端：
  - Buddy API 调用新 binding endpoint/command。
  - Buddy 页面展示两个独立绑定块。
  - `buildBuddyReviewGraph` 使用 binding 注入状态和 `current_session_id`。
  - activity phase map 覆盖新复盘节点。
  - BuddyWidget 使用绑定模板启动后台复盘。

- 回归：
  - Buddy 主运行图绑定不受影响。
  - 官方 `buddy_autonomous_review` 仍可验证和运行。
  - 变更历史可显示并过滤复盘绑定 revision。

# Buddy 主循环聊天历史存储调研报告

调研日期：2026-05-26。

本文记录当前 TooGraph Buddy 主循环中聊天历史输入、对话记录存储、图运行记录关联，以及 `demo/hermes-agent` 会话存储方式的调研结论。本文只讨论事实和设计边界，不是开发计划。

## 结论

当前 TooGraph 没有把聊天历史保存成“组合 1 + Q2，再组合 2 + Q3”的嵌套累加文本。现有实现更接近合理方向：

- Buddy 消息按原子记录逐条保存到数据库。
- 每轮图运行只把当前用户消息作为 `current_message`。
- 历史上下文通过 `context_assembly_ref` 引用历史消息，而不是把完整历史全文作为下一轮事实源。
- Assistant 消息保存 `run_id`，从聊天消息可以反查当时的图运行记录。
- 图运行记录保存 state snapshot、节点执行、state reads/writes、output 和 artifact，用于重建运行详情和 Buddy 胶囊。

主要问题不是存储模型已经嵌套，而是模板和 UI 表达不够直观：`conversation_history` 在官方模板里仍声明为 `markdown`，所以编辑器显示成文本输入框；但 Buddy 实际运行时会写入一个 `context_assembly_ref` 对象。

## 当前主循环为什么显示文本输入框

官方 Buddy 主循环模板中，`conversation_history` state 目前声明为：

```json
{
  "name": "会话历史",
  "type": "markdown",
  "value": ""
}
```

对应输入节点 `input_conversation_history` 的 `boundaryType` 也是 `markdown`。

相关位置：

- `graph_template/official/buddy_autonomous_loop/template.json`
- `state_schema.conversation_history`
- `nodes.input_conversation_history`

因此，模板编辑器和输入节点 UI 会按 markdown/text 输入来渲染它。

但运行 Buddy 主循环时，前端并不会让用户手填这段文本，而是在 `buildBuddyRuntimeSourceValues()` 中把 `conversation_history` 替换成 `buildBuddyConversationHistoryContextRef(input)` 的结果。

实际运行值形态类似：

```json
{
  "kind": "context_assembly_ref",
  "assembly_id": "ctx_pending_xxx",
  "target_state_key": "conversation_history",
  "renderer_key": "buddy_history",
  "renderer_version": "1",
  "source_count": 3,
  "source_refs": [
    {
      "source_kind": "buddy_message",
      "source_id": "msg_xxx",
      "role": "user",
      "ordinal": 0
    }
  ],
  "budget": {
    "max_messages": 12,
    "max_chars": 4000
  },
  "preview": "context assembly sources: 3"
}
```

相关位置：

- `frontend/src/buddy/buddyChatGraph.ts`
- `buildBuddyRuntimeSourceValues`
- `buildBuddyConversationHistoryContextRef`
- `buildBuddyConversationHistorySourceRefs`
- `applyBuddyRunTemplateBinding`

所以，当前“文本输入框”是模板 state type 和 UI renderer 的问题，不代表存储层真的在维护一个不断累加的历史文本。

## 当前 Q/A 存储模型

以用户给出的序列为例：

```text
Q1, A1, Q2, A2, Q3, A3, Q4, A4
```

当前合理的存储和运行语义是：

### 第一次运行

```text
buddy_messages:
  Q1: role=user

graph run:
  current_message = Q1
  conversation_history = refs([])

buddy_messages:
  A1: role=assistant, run_id=run_1
```

### 第二次运行

```text
buddy_messages:
  Q2: role=user

graph run:
  current_message = Q2
  conversation_history = refs([Q1, A1])

buddy_messages:
  A2: role=assistant, run_id=run_2
```

### 第三次运行

```text
buddy_messages:
  Q3: role=user

graph run:
  current_message = Q3
  conversation_history = refs([Q1, A1, Q2, A2])

buddy_messages:
  A3: role=assistant, run_id=run_3
```

这里不存在：

```text
组合1 = Q1 + A1
组合2 = 组合1 + Q2 + A2
组合3 = 组合2 + Q3 + A3
```

也就是说，下一轮不会把上一轮已经拼好的文本当成事实源继续包进去。每轮上下文是从原始消息记录重新选择、裁剪、组装出来的派生结果。

## 当前相关数据库表

Buddy 聊天事实源主要是：

- `buddy_sessions`
- `buddy_messages`
- `buddy_message_revisions`
- `buddy_message_run_refs`

`buddy_messages` 保存：

- `message_id`
- `session_id`
- `role`
- `content`
- `client_order`
- `include_in_context`
- `run_id`
- `metadata_json`
- `created_at`
- `updated_at`
- `deleted_at`

`buddy_message_run_refs` 保存消息和图运行之间的关系：

- `message_id`
- `run_id`
- `relation`
- `created_at`

图运行事实源主要是：

- `graph_runs`
- `graph_run_snapshots`
- `graph_node_executions`
- `graph_run_events`
- `graph_state_events`
- `graph_outputs`
- `graph_artifacts`
- `graph_capability_invocations`
- `graph_model_calls`

上下文组装相关表：

- `context_assemblies`
- `context_assembly_sources`
- `context_assembly_warnings`

全文检索相关表：

- `buddy_messages_fts`
- `buddy_messages_fts_trigram`

这些 FTS 表通过 trigger 从 `buddy_messages` 派生，用于搜索，不是事实源。

## 图运行中如何保存历史输入

节点执行时，运行时会收集节点读取的 state：

- `backend/app/core/runtime/state_io.py`
- `collect_node_inputs`

DB 存储会把节点执行的 `state_reads_json`、`state_writes_json`、`artifacts_json` 写入 `graph_node_executions`：

- `backend/app/core/storage/graph_run_db_store.py`
- `_insert_node_execution`

最终 state snapshot 会写入 `graph_run_snapshots.state_snapshot_json`。

因此，对于 Buddy 主循环，run record 中可以看到当时的 `conversation_history` 值。当前目标形态下，这个值应该是 `context_assembly_ref`，包含消息引用和渲染 hash，而不是完整历史全文。

当 LLM prompt 需要使用这个 state 时，后端 prompt assembly 会识别 `context_assembly_ref`：

- `backend/app/core/runtime/agent_prompt.py`
- `format_graph_state_input_prompt_lines`
- `format_context_assembly_ref_prompt_lines`

然后通过 context assembly store 展开为文本：

- `backend/app/core/storage/context_assembly_store.py`
- `expand_context_assembly_ref`
- `_render_sources`
- `_read_buddy_message_source`

这条链路的语义是：

```text
run record 保存引用
prompt assembly 临时展开文本
展开后的文本可作为审计快照保存
但展开文本不是下一轮历史事实源
```

## Hermes-agent 调研结论

`demo/hermes-agent` 使用 SQLite `state.db` 作为会话事实库：

- `demo/hermes-agent/hermes_state.py`
- `DEFAULT_DB_PATH = get_hermes_home() / "state.db"`

其 schema 明确说明：

- `sessions` 保存会话元数据。
- `messages` 保存完整消息历史。
- `messages_fts` 用 FTS5 做全文检索。
- `messages_fts_trigram` 用 trigram tokenizer 改善 CJK 和子串搜索。
- `parent_session_id` 用于压缩触发后的 session chain。

Hermes 的 `messages` 表按消息逐条保存：

- `id`
- `session_id`
- `role`
- `content`
- `tool_call_id`
- `tool_calls`
- `tool_name`
- `timestamp`
- `token_count`
- `finish_reason`
- reasoning 相关字段
- platform message id

写入由 `SessionDB.append_message()` 完成。恢复对话由 `get_messages_as_conversation()` 按 session 查询消息并重新组装成 OpenAI conversation 格式。

Hermes 的 `session_search` 工具基于 FTS/Trigram/LIKE fallback 检索历史消息，并支持 anchored window：

- discovery：按 query 找匹配消息。
- scroll：围绕指定 session/message id 取窗口。
- browse：无 query 时列最近 session。

Hermes 也没有把历史保存成逐轮嵌套累加文本。它的模式是：

```text
原子消息逐条入库
恢复上下文时按 session 查询消息
搜索召回时从 FTS 找 message id
再围绕 message id 取上下文窗口
压缩后通过 parent_session_id 串联 session
```

TooGraph 当前的 Buddy 历史方向和 Hermes 的核心原则一致，但 TooGraph 额外需要把聊天消息与图运行事实、output boundary 胶囊、state snapshot、context assembly、memory recall 统一起来。

## 设计判断

### 1. 不应该保存嵌套组合历史

错误模型：

```text
run_1 input = Q1
run_2 input = (Q1 + A1) + Q2
run_3 input = ((Q1 + A1) + Q2 + A2) + Q3
```

这个模型会导致：

- 重复存储指数式膨胀。
- 同一条消息在多个 run 中反复出现。
- 搜索和 embedding 产生大量重复 chunk。
- 修改或删除原消息后，旧组合文本无法保持一致。
- 很难判断某段文本的事实来源。

正确模型：

```text
messages = [Q1, A1, Q2, A2, Q3, A3]
run_3.conversation_history = refs([Q1, A1, Q2, A2])
run_3.current_message = Q3
```

### 2. 完整 prompt 文本可以作为审计快照，但不能作为事实源

每次 LLM 调用真正看到的 prompt 文本有审计价值，尤其是调试模型行为时。

但这份文本应该被视为派生 artifact：

- 可以保存 hash。
- 可以保存 rendered content blob。
- 可以在 run detail 中展示。
- 可以用于重放当时模型输入。

它不应该反向成为下一轮对话历史的来源。

事实源仍然是：

- `buddy_messages`
- `graph_runs`
- `graph_node_executions`
- `graph_outputs`
- `context_assembly_sources`

### 3. `conversation_history` 应该改成引用型状态

当前模板把 `conversation_history` 声明成 `markdown`，是造成 UI 误解的主要原因。

目标上更直观的设计是：

```json
{
  "name": "会话历史引用",
  "type": "context_assembly_ref",
  "value": {
    "kind": "context_assembly_ref",
    "source_refs": []
  }
}
```

如果协议短期内还没有 `context_assembly_ref` 类型，也应在 UI 层识别：

```text
value.kind == "context_assembly_ref"
```

然后显示成只读引用卡片，而不是 markdown 文本框。

显示内容可以是：

- 来源数量。
- renderer key。
- 当前 session id。
- max messages。
- max chars。
- source refs 摘要。

### 4. Buddy 胶囊应继续从 run record 重建

聊天消息中 assistant 回复可以保存：

- `content`
- `run_id`
- `include_in_context`
- `client_order`

但不应保存胶囊内部节点步骤、output trace 副本或图运行详情副本。

胶囊显示应从 `run_id` 反查：

- `graph_runs`
- `graph_node_executions`
- `graph_outputs`
- `graph_capability_invocations`
- child runs

这符合“图运行事实源唯一”的设计目标。

### 5. 历史召回应同时支持 FTS 和 embedding

Hermes 的 FTS/trigram 方案适合：

- 精确词。
- 文件路径。
- 错误信息。
- API 名称。
- 中文子串。
- 用户明确提到的关键词。

Embedding 更适合：

- 用户换一种说法表达同一需求。
- 概念相近的历史经验。
- 跨会话语义记忆。
- 不含精确关键词的召回。

合理召回链路应是：

```text
query
  -> FTS candidates
  -> embedding candidates
  -> SQL metadata filters
  -> merge/rerank
  -> source refs
  -> context_assembly_ref
  -> LLM prompt expansion
```

召回结果也不应该直接变成不可追溯的文本块。它应该先是 source refs，再由 context assembly 渲染。

## 对后续开发的建议

优先级从高到低：

1. 把 Buddy 主循环中的 `conversation_history` 从 UI 语义上改成引用输入，而不是 markdown 文本输入。
2. 明确 `context_assembly_ref` 是正式 state value 形态，补齐 schema/UI 表达。
3. 保持 `buddy_messages` 逐条原子存储，不引入组合消息或累加历史字段。
4. 保持 assistant 消息通过 `run_id` 关联图运行，胶囊从 run record 投影。
5. 在 run detail 中展示 `context_assembly_ref` 的 source refs 和展开后的审计文本。
6. 保留展开 prompt 的 rendered blob/hash 作为审计快照，但不作为下一轮历史来源。
7. 参考 Hermes 的 FTS5 + trigram + LIKE fallback，继续完善 Buddy 历史召回。
8. 在 FTS 之外增加完整 embedding/hybrid recall，并确保每个召回片段都能追溯到原始 message/run/output/memory。

## 最终判断

当前主循环的底层方向是正确的：消息逐条存，运行引用历史，prompt 临时组装。需要修正的是产品和协议表达，让用户和开发者看到的不是“一个可手填的压缩历史文本框”，而是“一个由数据库消息和摘要组成的上下文引用包”。

只要坚持这个边界，Buddy 对话历史、图运行记录、胶囊展示、记忆召回和复盘输入都可以基于同一套事实源重新拼接，不会产生历史嵌套和多事实源分叉。

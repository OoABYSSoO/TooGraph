# State Bundle 与顺序能力 Loop 设计

设计日期：2026-05-28。

本文记录 Buddy 和消息平台接入中“单次用户输入包含多个 typed state value”以及“同一次请求需要多个能力协作”这两个问题的目标设计。本文是协议与图流设计，不是完整实现计划。

## 背景

消息平台接入后，用户可能不是只发送一段文本，而是在一次平台消息中同时发送文本、图片、视频、音频或文件。例如同事在 Feishu/Lark 中发出：

```text
帮我看一下这个报错页面和复现视频，判断为什么点击提交以后没有反应。
```

并附带一张截图和一个复现视频。

TooGraph 现有 state type 已经包含 `text`、`image`、`audio`、`video`、`file`、`json`、`result_package` 等类型。问题不应该通过新增 Buddy 专用输入协议解决，而应该让一次用户输入可以被表示成“多个已有 state value 的有序组合”。

同时，Buddy 当前图协议要求单个 LLM 节点一次最多只选择一个显式 capability。这条约束应该保留。一个请求如果需要视频分析和联网搜索，应通过同一次 graph run 内的顺序 loop 完成，而不是让一个 LLM 节点偷偷执行多个 capability，也不是等用户下一轮消息才继续。

## 目标

- 新增通用 state type：`state_bundle`。
- 用 `state_bundle` 表达一次输入中包含的多个 typed state value。
- `state_bundle` 的 item 类型复用已有 state type，item value 复用对应 state type 的原始 value。
- Buddy 的 `user_message` 可以从 `text` 升级为 `state_bundle`，从而同时承载文本、图片、视频、音频和文件。
- LLM runtime 提供通用展开能力，把 `state_bundle.items` 转成 prompt 文本和多模态附件，而不是要求每个模板手写 JSON 解析。
- 多能力协作继续由图模板中的 LLM 节点、capability state、result package、condition 和 loop 表达。

## 非目标

- 不新增 `buddy_user_message` 这类 Buddy 专用 state type。
- 不把平台来源、message id、sender id 等路由元数据混进用户输入 state。
- 不把用户输入伪装成 `result_package`。
- 不放宽“一个 LLM 节点一次最多使用一个显式 capability”的约束。
- 不在后端新增隐藏 Buddy agent loop 来绕过图模板。

## State Bundle 命名

推荐新增 state type 名称：

```text
state_bundle
```

中文可称为“状态包”或“组合状态”。

这个名字强调它不是消息平台专用，也不是 Buddy 专用，而是多个 typed state value 的通用容器。

## Value 形状

`state_bundle` 的 value 使用 `items` 数组：

```json
{
  "items": [
    {
      "key": "request",
      "type": "text",
      "value": "帮我看一下这个报错页面和复现视频，判断为什么点击提交以后没有反应。"
    },
    {
      "key": "screenshot",
      "type": "image",
      "value": "capability_artifacts/message_ingress/feishu/2026-05-28/msg_om_8f23a1/submit-error-screen.png"
    },
    {
      "key": "repro_video",
      "type": "video",
      "value": "capability_artifacts/message_ingress/feishu/2026-05-28/msg_om_8f23a1/submit-reproduce.mp4"
    }
  ]
}
```

字段含义：

- `items`：有序列表。顺序代表用户提交内容的自然顺序。
- `key`：可选但建议保留，用于 UI、日志、调试和引用。它不是用户语义正文。
- `type`：复用 `NodeSystemStateType`，例如 `text`、`markdown`、`image`、`audio`、`video`、`file`、`json`。
- `value`：对应 state type 原本会存储的 value。

因此，`image` item 不重新发明 `{ name, mime_type, size, local_path }` 这样的专用结构。图片、视频、音频、文件的名称、MIME、大小等信息应优先来自 artifact metadata。`state_bundle` 只负责组合 typed values。

文本-only 输入也用同一个结构：

```json
{
  "items": [
    {
      "key": "message",
      "type": "text",
      "value": "你好，帮我查一下今天的构建为什么失败。"
    }
  ]
}
```

## 与 Result Package 的关系

`state_bundle` 和 `result_package` 应该共享底层 typed-entry 处理逻辑，但不应该合并为同一个 state type。

`state_bundle` 的语义是：

```text
一次输入或中间值中包含的多个 typed state values
```

`result_package` 的语义是：

```text
一次 capability 执行的结构化结果、来源、状态和 outputs
```

`result_package` 目前包含 capability 执行上下文，例如 `kind`、`status`、`sourceType`、`sourceKey`、`inputs`、`outputs`、`error` 等。这些字段对用户输入没有意义。

推荐关系：

```text
state_bundle.items[]        -> typed entry: { key, type, value }
result_package.outputs.*    -> typed entry: { key, type, value, name, description }
ordinary state              -> typed entry: { key: state_key, type: schema.type, value }
```

LLM prompt 组装、多模态附件收集、输出预览和审计摘要可以复用这个 typed-entry normalize 层，但协议语义保持分离。

## LLM 节点展开规则

LLM 节点不应该把 `state_bundle` 当成普通 JSON 原样塞进 prompt，让模型自己猜字段含义。运行时应提供通用展开规则：

- `text` / `markdown` / `html` item：作为用户可读文本进入 prompt。
- `image` item：按现有 image state 的规则解析 artifact，并作为图片附件传给支持多模态的模型 provider。
- `audio` item：按现有 audio state 的规则作为音频附件传入；如果 provider 不支持，则降级为文件说明或转写结果。
- `video` item：按现有 video state 的规则作为视频附件传入；如果视频超限，则复用现有抽帧或长视频分析路径。
- `file` item：文本类文件可展开文本；非文本文件作为文件引用或媒体附件，不把 base64 注入 prompt。
- `json` item：按现有 JSON state 的 prompt 渲染规则处理。

平台来源信息不属于 `state_bundle`。例如 Feishu 的 `message_id`、`sender_id`、`chat_id`、reply token 和 delivery context 应保存在消息平台 runtime metadata、Buddy message metadata、run metadata 或 session resolver 中。只有当某个图明确需要来源参与决策时，才应新增独立的 schema-backed state，例如 `message_source`，并由模板显式连接。

## Buddy 输入迁移

Buddy 主循环中的 `user_message` 目标形态：

```json
{
  "name": "user_message",
  "description": "用户本轮输入，可包含文本和附件。",
  "type": "state_bundle",
  "value": {
    "items": []
  }
}
```

Buddy 窗口文本输入在第一阶段仍可只产生一个 `text` item。消息平台兼容层则把平台原始消息转换为同样的 `state_bundle`：

```text
平台原始消息
-> 消息输入兼容层
-> state_bundle user_message
-> Buddy 图模板
```

Buddy history 可以继续保留 `content` 字符串作为展示、搜索和标题生成的摘要。完整 `state_bundle` 可写入 message metadata 或 run input snapshot。`content` 不是 graph input 的事实源，只是人类可读摘要。

## 多能力协作

一次 Buddy 请求如果需要多个能力，不应让单个 LLM 节点一次调用多个能力。正确方式是在同一次 graph run 内使用顺序 loop。

推荐图流：

```text
user_message: state_bundle
-> capability_selector_llm
-> selected_capability: capability
-> capability_executor
-> capability_result: result_package
-> capability_review_llm
-> condition
   -> continue: 回到 capability_selector_llm
   -> final: final_response_llm
   -> clarify: clarification_response_llm
-> output
```

以“看截图和视频，再查是否为最近版本已知问题”为例：

```text
1. selector 读取 state_bundle，选择 video_analysis。
2. executor 执行视频分析，写入 capability_result。
3. review 读取视频分析结果，判断还需要联网搜索。
4. selector 选择 web_search。
5. executor 执行联网搜索，写入新的 capability_result 或追加到结果集合。
6. review 判断信息足够。
7. final_response_llm 综合原始 state_bundle、视频分析结果和搜索结果。
8. output 写出 Buddy 可见回复，消息平台输出兼容层按 output 边界投递。
```

这不是用户对话的下一轮，而是同一次 Buddy run 的后续步骤。用户只发一次消息，图运行可以连续选择多个能力，每次仍然满足“一个 LLM 节点一次只使用一个 capability”的协议约束。

## 胶囊与平台投递

Buddy 胶囊仍只按 output 边界分段。`state_bundle` 不改变这个规则。

消息平台投递应以 Buddy 窗口为准：

```text
Buddy 窗口每产生一条可见 output
-> 消息输出兼容层转换为平台格式
-> 平台发送或编辑对应消息
```

中间能力选择、review、condition 等没有连接 output 的内部节点不应单独发送平台消息。占位消息，例如“正在思考...”，属于平台 delivery UX，不属于 graph state 语义。

## 实现参考

当前可参考代码：

- `backend/app/core/schemas/node_system.py`：新增 `NodeSystemStateType.STATE_BUNDLE`。
- `backend/app/core/runtime/agent_prompt.py`：扩展 prompt 渲染和上下文统计。
- `backend/app/core/runtime/agent_multimodal.py`：扩展附件收集，让 `state_bundle.items` 复用现有 image/audio/video/file 解析。
- `backend/app/core/runtime/input_boundary.py`：输入边界值解析可支持 `state_bundle`。
- `graph_template/official/buddy_autonomous_loop/template.json`：将 `user_message` 从 `text` 迁移为 `state_bundle`。
- `frontend/src/editor/workspace/statePanelFields.ts`：前端 state type 列表增加 `state_bundle`。
- `frontend/src/buddy/buddyChatGraph.ts` 和 `frontend/src/buddy/useBuddyBoundRunTemplate.ts`：Buddy 窗口文本输入构造 text-only `state_bundle`。
- `backend/app/messaging/event_model.py` 和 `backend/app/messaging/buddy_ingress.py`：消息平台归一化事件转换为 `state_bundle`。

## 第一版验收点

- `state_schema` 能声明 `state_bundle`。
- `state_bundle` 的 `items[].type` 必须是现有合法 state type，且不能是 `result_package` 的别名。
- Buddy 窗口文本输入能够生成 text-only `state_bundle`，现有文本对话行为不退化。
- 消息平台文本、图片、视频输入能进入同一个 `user_message` state。
- LLM 节点能从 `state_bundle` 中读取文本并收集图片/视频附件。
- 多能力需求仍通过 Buddy 顺序 loop 完成，不修改单节点 capability 约束。
- Buddy 窗口和消息平台看到的可见回复仍以 output 边界为准。

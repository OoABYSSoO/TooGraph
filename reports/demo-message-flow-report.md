# Demo 消息处理链路报告

## 范围

本报告只从 `demo/` 目录中的两个项目源码出发，追踪“一条用户消息进入后会经历哪些步骤，以及最后给用户返回什么话语”。

分析对象：

- `demo/claude-code-source`
- `demo/hermes-agent`

结论先行：

- `claude-code-source` 的核心路径是 `ask()` / `QueryEngine.submitMessage()` -> `processUserInput()` -> `query()` -> Claude streaming API -> 工具循环 -> `SDKResultMessage.result`。正常情况下最终返回的不是固定话术，而是最后一个 assistant 文本块。
- `hermes-agent` 的核心路径是 CLI / gateway 入口 -> `AIAgent.run_conversation()` -> OpenAI-compatible transport -> 工具循环 -> `final_response`。CLI 会直接打印或渲染 `final_response`；gateway 会把 `final_response` 再加工成平台消息，必要时拆出图片、视频、音频或文档附件。

## 总览对比

| 项目 | 消息入口 | 核心 agent 循环 | 工具调用后如何继续 | 最终给用户的话语 |
| --- | --- | --- | --- | --- |
| `claude-code-source` | `QueryEngine.submitMessage()`；一次性包装是 `ask()` | `query()` async generator | assistant 输出 `tool_use` 后执行工具，把 `tool_result` 当作 user 消息追加，再进入下一轮 model call | 正常路径是 `result.result = 最后一个 assistant text block`；本地 slash command 是 `resultText`；错误路径返回 SDK result error |
| `hermes-agent` | `hermes -z`、交互 CLI、`run_agent.py`、gateway 平台消息 | `AIAgent.run_conversation()` | assistant 输出 `tool_calls` 后验证、执行工具，把 `role="tool"` 结果追加，再进入下一轮 API call | 正常路径是 `final_response = assistant_message.content`；CLI 直接输出或渲染；gateway 发送文本并拆附件；异常有固定友好提示 |

## `demo/claude-code-source`

### 1. 消息入口

`claude-code-source` 是 TypeScript / Node CLI 包，单次提问入口在 `src/QueryEngine.ts`。

`ask()` 是一个一次性包装器。代码注释明确写着它会“发送单个 prompt 到 Claude API 并返回 response”，并且是 `QueryEngine` 的 one-shot wrapper：`demo/claude-code-source/src/QueryEngine.ts:1179` 到 `demo/claude-code-source/src/QueryEngine.ts:1185`。

`ask()` 内部创建 `QueryEngine`，然后把 prompt 交给 `engine.submitMessage()`：`demo/claude-code-source/src/QueryEngine.ts:1249` 到 `demo/claude-code-source/src/QueryEngine.ts:1291`。

真正的一条消息处理入口是：

```ts
async *submitMessage(
  prompt: string | ContentBlockParam[],
  options?: { uuid?: string; isMeta?: boolean },
)
```

对应源码位置：`demo/claude-code-source/src/QueryEngine.ts:209` 到 `demo/claude-code-source/src/QueryEngine.ts:212`。

### 2. 进入 turn 前的上下文准备

`submitMessage()` 开始后会先把当前 turn 的运行上下文装起来。

主要步骤：

1. 清空 turn 级别的 skill discovery 状态，设置 cwd，记录开始时间：`demo/claude-code-source/src/QueryEngine.ts:238` 到 `demo/claude-code-source/src/QueryEngine.ts:241`。
2. 读取 app state、主模型、thinking 配置：`demo/claude-code-source/src/QueryEngine.ts:273` 到 `demo/claude-code-source/src/QueryEngine.ts:282`。
3. 通过 `fetchSystemPromptParts()` 组装默认 system prompt、userContext、systemContext：`demo/claude-code-source/src/QueryEngine.ts:288` 到 `demo/claude-code-source/src/QueryEngine.ts:300`。
4. 把 custom prompt、memory prompt、append prompt 合并成最终 `systemPrompt`：`demo/claude-code-source/src/QueryEngine.ts:321` 到 `demo/claude-code-source/src/QueryEngine.ts:325`。
5. 构造 `processUserInputContext`，里面包含历史消息、commands、tools、MCP、模型、权限、主题、文件历史、SDK 状态等：`demo/claude-code-source/src/QueryEngine.ts:335` 到 `demo/claude-code-source/src/QueryEngine.ts:395`。

这一阶段还没有真正调用模型，它是在为“如何解释这条用户消息”准备所有上下文。

### 3. 用户消息标准化

`submitMessage()` 调用 `processUserInput()`：

```ts
const {
  messages: messagesFromUserInput,
  shouldQuery,
  allowedTools,
  model: modelFromUserInput,
  resultText,
} = await processUserInput(...)
```

源码位置：`demo/claude-code-source/src/QueryEngine.ts:410` 到 `demo/claude-code-source/src/QueryEngine.ts:428`。

`processUserInput()` 的职责是把原始输入转成内部 message，并决定是否要真正进入模型查询。它的签名说明输入既可以是字符串，也可以是多模态 `ContentBlockParam[]`：`demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:85` 到 `demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:140`。

输入处理分几类：

1. 普通文本 prompt：进入 `processTextPrompt()`。
2. 多模态输入：遍历 image block，必要时 resize / downsample，再把文本和图片块一起保留下来：`demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:314` 到 `demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:345`。
3. 粘贴图片：先落盘，再生成 image content block，继续作为模型输入：`demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:351` 到 `demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:420`。
4. bridge 安全 slash command：如果远端控制传来 `/config` 这类不安全命令，会短路，不进入模型，并返回 `resultText`：`demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:422` 到 `demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:449`。
5. 普通 slash command：进入 `processSlashCommand()`：`demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:531` 到 `demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:550`。
6. 常规用户 prompt：调用 `processTextPrompt()`：`demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:576` 到 `demo/claude-code-source/src/utils/processUserInput/processUserInput.ts:588`。

`processTextPrompt()` 做的事情很直接：

1. 生成 prompt id。
2. 记录 telemetry。
3. 如果有图片，把文本和图片块组成一个 user message。
4. 没图片时，用 `createUserMessage({ content: input })` 创建普通 user message。
5. 返回 `shouldQuery: true`。

对应源码：`demo/claude-code-source/src/utils/processUserInput/processTextPrompt.ts:19` 到 `demo/claude-code-source/src/utils/processUserInput/processTextPrompt.ts:99`。

### 4. 写入消息历史和 session transcript

用户输入处理完后，`messagesFromUserInput` 被 push 到 `mutableMessages`：

- `this.mutableMessages.push(...messagesFromUserInput)`：`demo/claude-code-source/src/QueryEngine.ts:430` 到 `demo/claude-code-source/src/QueryEngine.ts:434`。
- 随后在进入模型查询前先写 transcript。注释说明这样即使模型响应前进程被杀，也能从“用户消息已接受”的点恢复：`demo/claude-code-source/src/QueryEngine.ts:436` 到 `demo/claude-code-source/src/QueryEngine.ts:460`。

这说明在 Claude Code 的设计里，一条消息“被接收”与“模型已经回答”是分开的。用户消息先变成持久 conversation state，再进入 agent loop。

### 5. 如果不需要调用模型：本地命令直接返回

`shouldQuery === false` 时，`submitMessage()` 不会进入 `query()`。典型场景是本地 slash command 或 bridge 不允许的命令。

这个分支会：

1. 把本地 command 输出转换成 SDK user / assistant 消息。
2. 写 transcript。
3. yield 一个 `type: "result"`、`subtype: "success"` 的结果。
4. `result` 字段取 `resultText ?? ""`。

源码位置：`demo/claude-code-source/src/QueryEngine.ts:556` 到 `demo/claude-code-source/src/QueryEngine.ts:638`。

所以本地命令路径下，最后给调用方的话语是本地命令产生的 `resultText`，不是模型生成文本。

### 6. 进入模型和工具循环

如果 `shouldQuery === true`，`submitMessage()` 会调用 `query()`：

```ts
for await (const message of query({
  messages,
  systemPrompt,
  userContext,
  systemContext,
  canUseTool: wrappedCanUseTool,
  toolUseContext: processUserInputContext,
  fallbackModel,
  querySource: 'sdk',
  maxTurns,
  taskBudget,
})) { ... }
```

源码位置：`demo/claude-code-source/src/QueryEngine.ts:675` 到 `demo/claude-code-source/src/QueryEngine.ts:686`。

`query()` 的生产依赖里，真正的模型调用函数是 `queryModelWithStreaming`：`demo/claude-code-source/src/query/deps.ts:21` 到 `demo/claude-code-source/src/query/deps.ts:39`。

`queryLoop()` 每轮大致做这些事：

1. 构造可变循环状态，包括消息、toolUseContext、turnCount、compact 状态等：`demo/claude-code-source/src/query.ts:241` 到 `demo/claude-code-source/src/query.ts:279`。
2. 进入 `while (true)` 循环：`demo/claude-code-source/src/query.ts:306` 到 `demo/claude-code-source/src/query.ts:337`。
3. 从 compact boundary 后取消息，做 tool result budget、snip、microcompact、autocompact：`demo/claude-code-source/src/query.ts:365` 到 `demo/claude-code-source/src/query.ts:535`。
4. 准备本轮 assistantMessages、toolResults、toolUseBlocks，并用 `needsFollowUp` 标记是否需要工具结果后的下一轮：`demo/claude-code-source/src/query.ts:551` 到 `demo/claude-code-source/src/query.ts:558`。
5. 调用 `deps.callModel()`，把 userContext prepend 到 messages，把 fullSystemPrompt、thinkingConfig、tools、fallbackModel 等传入：`demo/claude-code-source/src/query.ts:659` 到 `demo/claude-code-source/src/query.ts:708`。

### 7. streaming API 如何变成 assistant message

`queryModelWithStreaming()` 只是把 `queryModel()` 包进 streaming VCR：`demo/claude-code-source/src/services/api/claude.ts:752` 到 `demo/claude-code-source/src/services/api/claude.ts:780`。

在 `queryModel()` 的 streaming loop 中：

1. `message_start` 初始化 partial message 和 usage：`demo/claude-code-source/src/services/api/claude.ts:1980` 到 `demo/claude-code-source/src/services/api/claude.ts:1994`。
2. `content_block_start` 初始化 text、tool_use、thinking 等 block：`demo/claude-code-source/src/services/api/claude.ts:1995` 到 `demo/claude-code-source/src/services/api/claude.ts:2052`。
3. `content_block_delta` 把 text delta、tool input JSON delta、thinking delta 逐步累加：`demo/claude-code-source/src/services/api/claude.ts:2053` 到 `demo/claude-code-source/src/services/api/claude.ts:2163`。
4. `content_block_stop` 把一个 content block 组装成 `AssistantMessage` 并 yield：`demo/claude-code-source/src/services/api/claude.ts:2171` 到 `demo/claude-code-source/src/services/api/claude.ts:2211`。
5. `message_delta` 回填 usage 和 stop_reason；如果 stop reason 是拒绝、max tokens、context window exceeded，还会 yield API error message：`demo/claude-code-source/src/services/api/claude.ts:2213` 到 `demo/claude-code-source/src/services/api/claude.ts:2293`。
6. 每个 raw stream part 也会以 `stream_event` 形式 yield：`demo/claude-code-source/src/services/api/claude.ts:2299` 到 `demo/claude-code-source/src/services/api/claude.ts:2304`。

这意味着 Claude Code 的响应是事件流，不是等完整文本回来后一次性处理。最终 `result` 只是对这条事件流的收束。

### 8. 工具调用后的继续逻辑

在 `query.ts` 中，assistant message 被 yield 后会检查其中有没有 `tool_use`：

- 找到 `tool_use` block 后加入 `toolUseBlocks`。
- 设置 `needsFollowUp = true`。
- 如果启用 streaming tool execution，会边流式接收边调度工具。

源码：`demo/claude-code-source/src/query.ts:823` 到 `demo/claude-code-source/src/query.ts:845`。

如果本轮没有工具调用，`needsFollowUp === false`，代码会进入完成路径。它会处理 max output recovery、stop hooks、token budget continuation 等，再 `return { reason: "completed" }`：`demo/claude-code-source/src/query.ts:1062` 到 `demo/claude-code-source/src/query.ts:1357`。

如果本轮需要工具调用，代码会执行工具：

```ts
const toolUpdates = streamingToolExecutor
  ? streamingToolExecutor.getRemainingResults()
  : runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext)
```

源码：`demo/claude-code-source/src/query.ts:1380` 到 `demo/claude-code-source/src/query.ts:1383`。

工具结果会被 yield，并通过 `normalizeMessagesForAPI()` 转换成下一轮模型可读的 user/tool result message：`demo/claude-code-source/src/query.ts:1384` 到 `demo/claude-code-source/src/query.ts:1400`。

随后 query loop 会继续。也就是说 Claude Code 的工具循环是：

```text
用户消息
-> 模型输出 assistant text / tool_use
-> 如果有 tool_use，执行工具
-> 工具结果作为 user/tool_result 追加
-> 再次调用模型
-> 直到没有 tool_use 或触发中断 / 预算 / 错误
```

### 9. `submitMessage()` 如何把事件流变成最终结果

`submitMessage()` 对 `query()` yield 出来的不同类型消息做归档和转换：

- assistant message：push 到 `mutableMessages`，再 `yield* normalizeMessage(message)` 给 SDK 调用方：`demo/claude-code-source/src/QueryEngine.ts:761` 到 `demo/claude-code-source/src/QueryEngine.ts:770`。
- user message：push 后 normalize yield：`demo/claude-code-source/src/QueryEngine.ts:784` 到 `demo/claude-code-source/src/QueryEngine.ts:787`。
- stream event：更新 usage、stop_reason，需要时把 partial stream event yield 给 SDK：`demo/claude-code-source/src/QueryEngine.ts:788` 到 `demo/claude-code-source/src/QueryEngine.ts:828`。
- max turns、max budget、structured output retry 等 attachment 会提前产出 error result 并 return：`demo/claude-code-source/src/QueryEngine.ts:841` 到 `demo/claude-code-source/src/QueryEngine.ts:873`、`demo/claude-code-source/src/QueryEngine.ts:971` 到 `demo/claude-code-source/src/QueryEngine.ts:1048`。

query loop 结束后，代码找最后一个 assistant 或 user 消息：

```ts
const result = messages.findLast(
  m => m.type === 'assistant' || m.type === 'user',
)
```

源码：`demo/claude-code-source/src/QueryEngine.ts:1058` 到 `demo/claude-code-source/src/QueryEngine.ts:1060`。

如果 `isResultSuccessful()` 判断失败，会 yield `subtype: "error_during_execution"`：`demo/claude-code-source/src/QueryEngine.ts:1082` 到 `demo/claude-code-source/src/QueryEngine.ts:1117`。

如果成功，则只从 assistant 的最后一个 content block 中抽文本：

```ts
if (result.type === 'assistant') {
  const lastContent = last(result.message.content)
  if (
    lastContent?.type === 'text' &&
    !SYNTHETIC_MESSAGES.has(lastContent.text)
  ) {
    textResult = lastContent.text
  }
  isApiError = Boolean(result.isApiErrorMessage)
}
```

源码：`demo/claude-code-source/src/QueryEngine.ts:1120` 到 `demo/claude-code-source/src/QueryEngine.ts:1133`。

最后 yield：

```ts
{
  type: 'result',
  subtype: 'success',
  is_error: isApiError,
  result: textResult,
  stop_reason: lastStopReason,
  ...
}
```

源码：`demo/claude-code-source/src/QueryEngine.ts:1135` 到 `demo/claude-code-source/src/QueryEngine.ts:1155`。

### 10. Claude Code 最后返回什么话语

正常模型路径下，最后返回的话语是：

```text
最后一个 assistant message 的最后一个 text content block
```

它不是硬编码的模板句子，而是模型最终回答文本。SDK 层最终把它放在 `SDKResultMessage.result` 字段。

需要注意三个边界：

1. 如果最后成功状态是 user/tool_result 结束，或者最后 assistant block 不是 text，`result` 字段可能是空字符串，但整体仍可能被视为成功。
2. 如果是本地 slash command 且 `shouldQuery === false`，最终 `result` 是 `resultText`，不是模型文本。
3. 如果遇到 max turns、max budget、structured output retry、execution error，最终返回的是 SDK error result，不是正常 assistant 话语。

## `demo/hermes-agent`

### 1. 消息入口类型

`hermes-agent` 是 Python 项目，`pyproject.toml` 暴露三个命令：

```toml
hermes = "hermes_cli.main:main"
hermes-agent = "run_agent:main"
hermes-acp = "acp_adapter.entry:main"
```

源码位置：`demo/hermes-agent/pyproject.toml:132` 到 `demo/hermes-agent/pyproject.toml:135`。

对“一条消息进入后如何处理”最相关的入口有四类：

| 入口 | 代码位置 | 最终展示方式 |
| --- | --- | --- |
| `hermes -z "..."` one-shot | `hermes_cli/main.py` -> `hermes_cli/oneshot.py` | 只向 stdout 打印 final response |
| 交互 CLI | `hermes_cli/main.py` -> `cli.py` | 通过 Rich panel / streaming box 渲染 final response |
| `hermes-agent` 低层脚本 | `run_agent.py:main` | 打印 conversation summary 和 `FINAL RESPONSE` |
| gateway 平台消息 | `gateway/platforms/base.py` -> `gateway/run.py` | 发到 Telegram / Discord / Slack / webhook 等平台，可附带媒体 |

### 2. one-shot CLI：只输出最终文本

顶层 CLI 解析到 `--oneshot` / `-z` 后会直接调用 `run_oneshot()`。注释写明：`stdout = final response only, nothing else`，并且绕过 `cli.py`：`demo/hermes-agent/hermes_cli/main.py:10426` 到 `demo/hermes-agent/hermes_cli/main.py:10436`。

`hermes_cli/oneshot.py` 文件开头也说明 one-shot 模式是“发送 prompt，拿 final content block，退出”，没有 banner、spinner、session id，只输出 final text 到 stdout：`demo/hermes-agent/hermes_cli/oneshot.py:1` 到 `demo/hermes-agent/hermes_cli/oneshot.py:9`。

`run_oneshot()` 做了三件关键事：

1. 设置 `HERMES_YOLO_MODE=1` 和 `HERMES_ACCEPT_HOOKS=1`，避免非交互场景卡在审批：`demo/hermes-agent/hermes_cli/oneshot.py:169` 到 `demo/hermes-agent/hermes_cli/oneshot.py:172`。
2. 把调用树中的 stdout / stderr 都重定向到 devnull，只保留最后 response 的 stdout：`demo/hermes-agent/hermes_cli/oneshot.py:174` 到 `demo/hermes-agent/hermes_cli/oneshot.py:187`。
3. 如果 `response` 非空，就写到真实 stdout，并补换行：`demo/hermes-agent/hermes_cli/oneshot.py:194` 到 `demo/hermes-agent/hermes_cli/oneshot.py:199`。

它内部创建 `AIAgent`，设置 `quiet_mode=True`、`platform="cli"`、关闭 streaming display callbacks，然后返回 `agent.chat(prompt) or ""`：`demo/hermes-agent/hermes_cli/oneshot.py:287` 到 `demo/hermes-agent/hermes_cli/oneshot.py:317`。

所以 one-shot 的最终话语就是 `AIAgent.chat()` 返回的字符串。

### 3. 交互 CLI：仍然以 `run_conversation()` 为核心

交互 CLI 收到用户消息后会调用：

```py
result = self.agent.run_conversation(
    user_message=agent_message,
    conversation_history=self.conversation_history[:-1],
    stream_callback=stream_callback,
    task_id=self.session_id,
    persist_user_message=...
)
```

源码：`demo/hermes-agent/cli.py:9309` 到 `demo/hermes-agent/cli.py:9315`。

运行结束后它取：

```py
response = result.get("final_response", "") if result else ""
```

源码：`demo/hermes-agent/cli.py:9469` 到 `demo/hermes-agent/cli.py:9470`。

如果 failed / partial 且没有 response，会构造 `Error: ...`：`demo/hermes-agent/cli.py:9501` 到 `demo/hermes-agent/cli.py:9507`。

正常情况下，最终渲染发生在 Rich panel：

```py
_chat_console.print(Panel(
    _render_final_assistant_content(response, mode=self.final_response_markdown),
    ...
))
```

源码：`demo/hermes-agent/cli.py:9547` 到 `demo/hermes-agent/cli.py:9580`。

交互 CLI 的最终话语仍然来自 `final_response`，只是显示层更复杂。

### 4. 低层 `run_agent.py` 脚本

`hermes-agent = run_agent:main` 这条低层命令会直接创建 `AIAgent`，拿 query 后调用 `run_conversation()`：`demo/hermes-agent/run_agent.py:14123` 到 `demo/hermes-agent/run_agent.py:14153`。

结束后它打印 summary，如果 `result["final_response"]` 存在，就打印：

```text
FINAL RESPONSE:
<final_response>
```

源码：`demo/hermes-agent/run_agent.py:14155` 到 `demo/hermes-agent/run_agent.py:14165`。

这条路径适合看核心 agent 行为，不代表最终聊天平台体验。

### 5. `AIAgent.run_conversation()` 的主流程

所有 CLI / gateway 路径最终都共享 `AIAgent.run_conversation()`。

它的签名和注释说明：输入是用户消息、可选 system message、conversation history、task id、stream callback；返回 dict，包含 final response 和 message history：`demo/hermes-agent/run_agent.py:10431` 到 `demo/hermes-agent/run_agent.py:10458`。

进入函数后主要步骤如下。

第一，准备运行环境：

- 安装 safe stdio，保证 daemon / broken pipe 不直接崩：`demo/hermes-agent/run_agent.py:10459` 到 `demo/hermes-agent/run_agent.py:10462`。
- 确保 DB session，设置日志 session context：`demo/hermes-agent/run_agent.py:10463` 到 `demo/hermes-agent/run_agent.py:10468`。
- 恢复 primary runtime，避免上一轮 fallback 污染这一轮：`demo/hermes-agent/run_agent.py:10479` 到 `demo/hermes-agent/run_agent.py:10482`。
- 清理 user input 中的 surrogate 字符，避免 JSON 序列化崩：`demo/hermes-agent/run_agent.py:10484` 到 `demo/hermes-agent/run_agent.py:10490`。
- 重置本 turn 的 invalid tool、invalid JSON、empty content、thinking prefill、guardrail 等计数器：`demo/hermes-agent/run_agent.py:10504` 到 `demo/hermes-agent/run_agent.py:10518`。

第二，构造消息历史：

- 从 `conversation_history` 拷贝出 `messages`：`demo/hermes-agent/run_agent.py:10555` 到 `demo/hermes-agent/run_agent.py:10556`。
- 保存原始 user message，用于 memory / sync：`demo/hermes-agent/run_agent.py:10579` 到 `demo/hermes-agent/run_agent.py:10580`。
- 把当前用户消息 append 为 `{"role": "user", "content": user_message}`：`demo/hermes-agent/run_agent.py:10594` 到 `demo/hermes-agent/run_agent.py:10599`。

第三，准备 system prompt。代码会在首次调用时构造并缓存 system prompt；gateway 续会话时可从 session DB 复用存储的 system prompt，避免破坏 prefix cache：`demo/hermes-agent/run_agent.py:10604` 到 `demo/hermes-agent/run_agent.py:10625`。

第四，进入主循环：

```py
while (api_call_count < self.max_iterations and self.iteration_budget.remaining > 0) or self._budget_grace_call:
```

源码：`demo/hermes-agent/run_agent.py:10760` 到 `demo/hermes-agent/run_agent.py:10823`。

这就是 Hermes 的 agent loop。每次循环代表一次模型 API call，直到拿到最终文本、工具循环结束、预算耗尽、中断或错误。

### 6. 每一轮 API call 前如何构造模型输入

Hermes 在每轮 API call 前都会重新构造 `api_messages`。

关键逻辑：

1. 从内部 `messages` 拷贝出 API 版本，不直接污染持久历史：`demo/hermes-agent/run_agent.py:10939` 到 `demo/hermes-agent/run_agent.py:10942`。
2. 只在当前 user message 上注入 memory manager prefetch 和 plugin user context；原始消息不变：`demo/hermes-agent/run_agent.py:10943` 到 `demo/hermes-agent/run_agent.py:10960`。
3. 清理内部字段，例如 `reasoning`、`finish_reason`、`_thinking_prefill`：`demo/hermes-agent/run_agent.py:10961` 到 `demo/hermes-agent/run_agent.py:10982`。
4. 把 cached system prompt、ephemeral system prompt 拼成最终 system message 并 prepend：`demo/hermes-agent/run_agent.py:10984` 到 `demo/hermes-agent/run_agent.py:10997`。
5. 插入 prefill messages：`demo/hermes-agent/run_agent.py:10998` 到 `demo/hermes-agent/run_agent.py:11004`。
6. 应用 Anthropic prompt cache：`demo/hermes-agent/run_agent.py:11005` 到 `demo/hermes-agent/run_agent.py:11018`。
7. 修复孤立 tool result、thinking-only assistant turn、tool-call JSON、surrogate 字符：`demo/hermes-agent/run_agent.py:11019` 到 `demo/hermes-agent/run_agent.py:11072`。

这说明 Hermes 不是把内部 transcript 原样发给模型，而是每一轮都生成一个“API-safe copy”。

### 7. API 调用和 transport normalize

Hermes 默认偏向 streaming path，即使没有 stream consumer，也用 streaming 来做健康检查，避免 provider 长时间挂住：`demo/hermes-agent/run_agent.py:11206` 到 `demo/hermes-agent/run_agent.py:11225`。

如果允许 streaming，会调用：

```py
response = self._interruptible_streaming_api_call(...)
```

否则调用：

```py
response = self._interruptible_api_call(...)
```

源码：`demo/hermes-agent/run_agent.py:11249` 到 `demo/hermes-agent/run_agent.py:11254`。

模型响应回来后，Hermes 不直接依赖某个 provider 的原始结构，而是走 transport normalize：

```py
normalized = _transport.normalize_response(response, **_normalize_kwargs)
assistant_message = normalized
finish_reason = normalized.finish_reason
```

源码：`demo/hermes-agent/run_agent.py:12908` 到 `demo/hermes-agent/run_agent.py:12915`。

以 OpenAI Chat Completions transport 为例，normalize 会取 `response.choices[0].message`，把 `content`、`tool_calls`、`finish_reason`、usage、reasoning 字段整理成 `NormalizedResponse`：`demo/hermes-agent/agent/transports/chat_completions.py:426` 到 `demo/hermes-agent/agent/transports/chat_completions.py:499`。

这也是 Hermes “通用 provider”能力的核心之一：agent loop 面对的是统一后的 assistant message。

### 8. assistant message 的清理

Hermes 用 `_build_assistant_message()` 把 normalized response 转成内部 assistant dict。

它会：

1. 提取 structured reasoning 或内联 `<think>...</think>`：`demo/hermes-agent/run_agent.py:8624` 到 `demo/hermes-agent/run_agent.py:8643`。
2. 清理 surrogate 字符：`demo/hermes-agent/run_agent.py:8662` 到 `demo/hermes-agent/run_agent.py:8668`。
3. 从 content 中剥掉 `<think>` 等推理标签，避免 reasoning 泄漏到平台、污染 transcript 或标题：`demo/hermes-agent/run_agent.py:8669` 到 `demo/hermes-agent/run_agent.py:8681`。
4. 返回 `{"role": "assistant", "content": ..., "reasoning": ..., "finish_reason": ...}`：`demo/hermes-agent/run_agent.py:8683` 到 `demo/hermes-agent/run_agent.py:8688`。

所以 Hermes 最终给用户的话语一般不会包含 `<think>` 块，除非 display 设置专门要求展示 reasoning。

### 9. 工具调用路径

如果 normalized assistant message 有 `tool_calls`，Hermes 会进入工具路径：`demo/hermes-agent/run_agent.py:13084` 到 `demo/hermes-agent/run_agent.py:13088`。

工具路径做了很多防御：

1. 修复模型 hallucinate 出来的工具名，如果仍然非法，就把“工具不存在，可用工具列表”作为 tool result 发回模型重试：`demo/hermes-agent/run_agent.py:13093` 到 `demo/hermes-agent/run_agent.py:13143`。
2. 验证 tool call arguments 是合法 JSON；非法或截断时会重试或中止：`demo/hermes-agent/run_agent.py:13145` 到 `demo/hermes-agent/run_agent.py:13236`。
3. 限制和去重 delegate_task 等工具调用：`demo/hermes-agent/run_agent.py:13238` 到 `demo/hermes-agent/run_agent.py:13244`。
4. 构建 assistant message 并 append 到 `messages`：`demo/hermes-agent/run_agent.py:13246` 到 `demo/hermes-agent/run_agent.py:13302`。
5. 执行工具：`demo/hermes-agent/run_agent.py:13316`。

工具执行函数 `_execute_tool_calls()` 会根据工具批次是否独立选择顺序执行或并发执行：`demo/hermes-agent/run_agent.py:9289` 到 `demo/hermes-agent/run_agent.py:9308`。

具体工具 dispatch 时，内置 memory、clarify、delegate_task 等有专门路径，其他工具走 `handle_function_call()`：`demo/hermes-agent/run_agent.py:9368` 到 `demo/hermes-agent/run_agent.py:9414`。

工具结果会 append 成：

```py
{
  "role": "tool",
  "name": name,
  "content": function_result,
  "tool_call_id": tc.id,
}
```

并进入下一轮模型调用。并发路径追加 tool result 的源码在 `demo/hermes-agent/run_agent.py:9796` 到 `demo/hermes-agent/run_agent.py:9802`；工具路径末尾明确 `continue` 回主循环：`demo/hermes-agent/run_agent.py:13391` 到 `demo/hermes-agent/run_agent.py:13396`。

所以 Hermes 的工具循环是：

```text
用户消息
-> 模型输出 assistant content / tool_calls
-> 如果有 tool_calls，验证工具名和 JSON 参数
-> 执行工具
-> 工具结果作为 role="tool" 追加
-> 再次调用模型
-> 直到模型不再返回 tool_calls
```

### 10. 无工具调用时如何形成 final response

如果 assistant message 没有 `tool_calls`，Hermes 认为这就是最终回答：

```py
final_response = assistant_message.content or ""
```

源码：`demo/hermes-agent/run_agent.py:13398` 到 `demo/hermes-agent/run_agent.py:13400`。

随后它会处理几类异常输出：

- 空响应或只有 thinking block：可能触发 nudge、prefill continuation、empty retry、fallback provider：`demo/hermes-agent/run_agent.py:13409` 到 `demo/hermes-agent/run_agent.py:13655`。
- 有截断前缀时拼回去：`demo/hermes-agent/run_agent.py:13690` 到 `demo/hermes-agent/run_agent.py:13693`。
- 剥掉 think blocks 并 trim：`demo/hermes-agent/run_agent.py:13695`。
- 构建最终 assistant message，append 到 history：`demo/hermes-agent/run_agent.py:13697` 到 `demo/hermes-agent/run_agent.py:13710`。
- 设置退出原因 `text_response(finish_reason=...)` 并 break：`demo/hermes-agent/run_agent.py:13712` 到 `demo/hermes-agent/run_agent.py:13715`。

如果达到最大迭代 / 预算，Hermes 会调用 `_handle_max_iterations()` 再向模型要一次 summary，作为 `final_response`：`demo/hermes-agent/run_agent.py:13768` 到 `demo/hermes-agent/run_agent.py:13785`。

最后组装 result dict：

```py
result = {
  "final_response": final_response,
  "last_reasoning": last_reasoning,
  "messages": messages,
  "api_calls": api_call_count,
  "completed": completed,
  ...
}
```

源码：`demo/hermes-agent/run_agent.py:13870` 到 `demo/hermes-agent/run_agent.py:13896`。

`AIAgent.chat()` 只是调用 `run_conversation()` 并返回 `result["final_response"]`：`demo/hermes-agent/run_agent.py:13969` 到 `demo/hermes-agent/run_agent.py:13981`。

### 11. gateway 收到一条平台消息后的路径

gateway 的第一层是 platform adapter。

`BasePlatformAdapter.handle_message()` 收到 `MessageEvent` 后不会直接阻塞处理，而是尽快创建后台任务，支持运行中被新消息打断：`demo/hermes-agent/gateway/platforms/base.py:2543` 到 `demo/hermes-agent/gateway/platforms/base.py:2550`。

它会构造 session key：`demo/hermes-agent/gateway/platforms/base.py:2554` 到 `demo/hermes-agent/gateway/platforms/base.py:2560`。

如果同一 session 已经有 agent 在跑：

- `/stop`、`/new`、`/reset` 等 bypass 命令会特殊处理。
- 照片连发会排队，不立即打断。
- 普通新消息会记录为 pending message，并触发 interrupt。

相关源码：`demo/hermes-agent/gateway/platforms/base.py:2570` 到 `demo/hermes-agent/gateway/platforms/base.py:2654`。

如果没有活动 session，会启动后台处理：`demo/hermes-agent/gateway/platforms/base.py:2656` 到 `demo/hermes-agent/gateway/platforms/base.py:2663`。

后台任务 `_process_message_background()` 会：

1. 启动 typing indicator：`demo/hermes-agent/gateway/platforms/base.py:2704` 到 `demo/hermes-agent/gateway/platforms/base.py:2718`。
2. 调用 `self._message_handler(event)`，这个 handler 是 gateway runner 的 `_handle_message()`：`demo/hermes-agent/gateway/platforms/base.py:2731` 到 `demo/hermes-agent/gateway/platforms/base.py:2735`。
3. 如果 response 为空，通常代表 streaming 已经发过正文，或消息被排队：`demo/hermes-agent/gateway/platforms/base.py:2745` 到 `demo/hermes-agent/gateway/platforms/base.py:2765`。
4. 如果 response 非空，先抽出 `MEDIA:<path>`、图片 URL、本地文件路径，再发送文本和附件：`demo/hermes-agent/gateway/platforms/base.py:2766` 到 `demo/hermes-agent/gateway/platforms/base.py:2952`。
5. 如果抛异常，会给用户发固定错误文案：

```text
Sorry, I encountered an error (<ErrorType>).
<error_detail>
Try again or use /reset to start a fresh session.
```

源码：`demo/hermes-agent/gateway/platforms/base.py:3008` 到 `demo/hermes-agent/gateway/platforms/base.py:3024`。

### 12. gateway runner 如何把平台消息变成 agent 调用

`GatewayRunner._handle_message()` 的 docstring 明确列出核心 pipeline：

1. Check user authorization
2. Check commands
3. Check running agent and interrupt
4. Get or create session
5. Build context for agent
6. Run agent conversation
7. Return response

源码：`demo/hermes-agent/gateway/run.py:4590` 到 `demo/hermes-agent/gateway/run.py:4601`。

进入 `_handle_message()` 后，gateway 会先跑 pre-dispatch hook、鉴权、DM pairing、slash-confirm 等逻辑：`demo/hermes-agent/gateway/run.py:4626` 到 `demo/hermes-agent/gateway/run.py:4830`。

命令会优先处理：

- 内置命令如 `/new`、`/help`、`/status`、`/model`、`/voice` 等直接 return：`demo/hermes-agent/gateway/run.py:5276` 到 `demo/hermes-agent/gateway/run.py:5395`。
- quick command 可以直接执行 shell 并返回 stdout/stderr：`demo/hermes-agent/gateway/run.py:5399` 到 `demo/hermes-agent/gateway/run.py:5439`。
- plugin command 可以绕过 agent 返回插件结果：`demo/hermes-agent/gateway/run.py:5441` 到 `demo/hermes-agent/gateway/run.py:5455`。
- skill slash command 会把 skill payload 组装进 `event.text`，然后继续走普通 agent：`demo/hermes-agent/gateway/run.py:5458` 到 `demo/hermes-agent/gateway/run.py:5518`。

如果不是被命令直接处理，会先占用 running agent sentinel，再调用 `_handle_message_with_agent()`：`demo/hermes-agent/gateway/run.py:5526` 到 `demo/hermes-agent/gateway/run.py:5539`。

`_handle_message_with_agent()` 做这些核心动作：

1. 获取或创建 session：`demo/hermes-agent/gateway/run.py:5798` 到 `demo/hermes-agent/gateway/run.py:5800`。
2. 构建 session context 和 context prompt：`demo/hermes-agent/gateway/run.py:5829` 到 `demo/hermes-agent/gateway/run.py:5844`。
3. 新 session 上可以自动加载 channel/topic 绑定 skill，并把 skill payload prepend 到 event text：`demo/hermes-agent/gateway/run.py:5910` 到 `demo/hermes-agent/gateway/run.py:5944`。
4. 加载 transcript history：`demo/hermes-agent/gateway/run.py:5946` 到 `demo/hermes-agent/gateway/run.py:5948`。
5. 触发 `agent:start` hook，然后调用 `_run_agent()`：`demo/hermes-agent/gateway/run.py:6331` 到 `demo/hermes-agent/gateway/run.py:6351`。

`_run_agent()` 的 docstring 说明它返回的 full result dict 包含 `final_response`、`messages`、`api_calls`、`completed`，并在线程池里运行以避免阻塞 event loop：`demo/hermes-agent/gateway/run.py:12135` 到 `demo/hermes-agent/gateway/run.py:12148`。

在 `_run_agent()` 内部：

1. 读取 gateway config、平台 toolsets、display config：`demo/hermes-agent/gateway/run.py:12170` 到 `demo/hermes-agent/gateway/run.py:12221`。
2. 根据平台是否支持编辑来决定是否建立 `GatewayStreamConsumer`：`demo/hermes-agent/gateway/run.py:12667` 到 `demo/hermes-agent/gateway/run.py:12743`。
3. 创建或复用 cached `AIAgent`，把 session、platform、user、chat、fallback model、toolsets、ephemeral prompt 等传进去：`demo/hermes-agent/gateway/run.py:12769` 到 `demo/hermes-agent/gateway/run.py:12836`。
4. 每个 turn 更新 tool progress、step、stream delta、interim assistant、status callback：`demo/hermes-agent/gateway/run.py:12838` 到 `demo/hermes-agent/gateway/run.py:12847`。
5. 在线程中调用 `agent.run_conversation(_run_message, conversation_history=agent_history, task_id=session_id)`：`demo/hermes-agent/gateway/run.py:13170` 到 `demo/hermes-agent/gateway/run.py:13175`。
6. 如果有 stream consumer，agent 完成后调用 `finish()`：`demo/hermes-agent/gateway/run.py:13181` 到 `demo/hermes-agent/gateway/run.py:13183`。
7. 从 result 中取 `final_response`：`demo/hermes-agent/gateway/run.py:13185` 到 `demo/hermes-agent/gateway/run.py:13187`。
8. 如果 tool result 里有 `MEDIA:<path>`，但 final text 没带，会把 MEDIA tag 追加到 final response，方便 adapter 后处理附件：`demo/hermes-agent/gateway/run.py:13218` 到 `demo/hermes-agent/gateway/run.py:13251`。
9. 返回 gateway result dict，其中包含 `final_response`、`last_reasoning`、messages、api_calls、model、context_length 等：`demo/hermes-agent/gateway/run.py:13309` 到 `demo/hermes-agent/gateway/run.py:13323`。

### 13. gateway 最后实际发给用户什么

`_handle_message_with_agent()` 从 `_run_agent()` 拿到 `agent_result` 后，首先取：

```py
response = agent_result.get("final_response") or ""
```

源码：`demo/hermes-agent/gateway/run.py:6377`。

如果 response 是内部 sentinel `"(empty)"`，gateway 会转成更友好的固定文案：

```text
⚠️ The model returned no response after processing tool results. This can happen with some models — try again or rephrase your question.
```

源码：`demo/hermes-agent/gateway/run.py:6379` 到 `demo/hermes-agent/gateway/run.py:6389`。

如果 agent failed 且没有 response，会根据错误类型返回：

- context 过大：

```text
⚠️ Session too large for the model's context window.
Use /compact to compress the conversation, or /reset to start fresh.
```

- 普通失败：

```text
The request failed: <error_detail>
Try again or use /reset to start a fresh session.
```

源码：`demo/hermes-agent/gateway/run.py:6418` 到 `demo/hermes-agent/gateway/run.py:6444`。

如果配置打开 reasoning 展示，gateway 会把 reasoning 前置到 response：

```text
💭 **Reasoning:**
[reasoning code block]

<final response>
```

源码：`demo/hermes-agent/gateway/run.py:6451` 到 `demo/hermes-agent/gateway/run.py:6472`。

如果配置打开 runtime footer，且正文不是 streaming 已经发过，会把 footer 追加到 response：`demo/hermes-agent/gateway/run.py:6474` 到 `demo/hermes-agent/gateway/run.py:6493`。

如果 streaming 已经发过正文，`_handle_message_with_agent()` 会发送媒体和 footer 后返回 `None`，避免 `_process_message_background()` 再发一次重复文本：`demo/hermes-agent/gateway/run.py:6681` 到 `demo/hermes-agent/gateway/run.py:6717`。

如果非 streaming，`_handle_message_with_agent()` 直接 `return response`，再由 platform adapter 发送文本和附件：`demo/hermes-agent/gateway/run.py:6717`，以及 `demo/hermes-agent/gateway/platforms/base.py:2822` 到 `demo/hermes-agent/gateway/platforms/base.py:2952`。

streaming 发送由 `GatewayStreamConsumer` 完成：

- `on_delta(text)` 收 token delta，`finish()` 标记完成：`demo/hermes-agent/gateway/stream_consumer.py:178` 到 `demo/hermes-agent/gateway/stream_consumer.py:192`。
- DONE 后发送或编辑最终 accumulated content，并标记 `_final_response_sent`：`demo/hermes-agent/gateway/stream_consumer.py:420` 到 `demo/hermes-agent/gateway/stream_consumer.py:444`。
- 如果编辑失败，会用 fallback final send 发送剩余内容，并标记 already sent / final response sent：`demo/hermes-agent/gateway/stream_consumer.py:593` 到 `demo/hermes-agent/gateway/stream_consumer.py:695`。

所以 gateway 的最终“用户看到的话语”可能有三层：

1. agent 产出的 `final_response`。
2. gateway 追加的 reasoning / footer / error-friendly 文案。
3. platform adapter 对文本之外的 `MEDIA:<path>`、图片 URL、本地文件路径做附件发送。

### 14. Hermes 最后返回什么话语

正常模型路径下，Hermes 的最终话语是：

```text
final_response = assistant_message.content
```

然后经过：

```text
strip think blocks -> trim -> append 到 messages -> 放入 result["final_response"]
```

CLI one-shot 最终只把这段 `final_response` 打印到 stdout。交互 CLI 把它渲染进 Rich panel。gateway 把它作为平台 response 发送，必要时附加 reasoning、footer、媒体附件，或在 streaming 已发送时返回 `None` 避免重复。

固定文案只出现在异常或控制路径：

- one-shot 参数错误会直接 stderr 提示，不进入 agent。
- CLI failed / partial 且无 response 时显示 `Error: <error_detail>`。
- gateway `"(empty)"` sentinel 会改成“模型没有返回内容，请重试或改写问题”的英文提示。
- gateway 异常会发 `Sorry, I encountered an error (...)... Try again or use /reset...`。
- context 过大时 gateway 发 `/compact` 或 `/reset` 建议。
- slash / quick / plugin commands 可以完全绕过模型，直接返回命令结果。

## 两个项目的关键差异

### 1. 最终返回对象不同

`claude-code-source` 面向 SDK event stream。正常最终结果是一个 `type: "result"` 的 SDK message，其中 `result` 字段是最后 assistant text block。

`hermes-agent` 面向 CLI 和 gateway。正常最终结果是 Python dict 中的 `final_response` 字段，之后由 CLI 或 gateway 决定怎么展示。

### 2. 工具结果的角色模型不同

`claude-code-source` 使用 Anthropic content block 风格。工具调用是 assistant content 中的 `tool_use` block，工具结果会被 normalize 成 user message 的 `tool_result` block，再喂回模型。

`hermes-agent` 使用 OpenAI-compatible chat 风格。工具调用是 assistant message 上的 `tool_calls`，工具结果是独立的 `{"role": "tool", "tool_call_id": ...}` message。

### 3. 流式输出的边界不同

`claude-code-source` 天然把每个 Claude stream part 和 content block 转成 SDK events，最终 result 是事件流结束后的 summary。

`hermes-agent` 的 core agent 也偏向 streaming API，但 CLI / gateway 有自己的 display consumer。gateway 如果已经 stream 到平台，会把最终 return 置为 `None`，避免重复发同一段文字。

### 4. 对“最后一句话”的定义不同

`claude-code-source` 的最后一句话是：

```text
最后一个 assistant message 的最后一个 text block
```

`hermes-agent` 的最后一句话是：

```text
最后一次没有 tool_calls 的 assistant response content
```

两者都不是固定模板，而是模型最终输出。固定话术主要用于错误、空响应、命令、鉴权和平台发送失败等控制路径。

## 对 GraphiteUI 模板 / 桌宠循环的启发

如果要把这两套 demo 的经验迁移到 GraphiteUI 的桌宠或通用 agent 节点，比较稳的抽象是：

1. 把“agent 最终产物”和“UI 实际展示”分开。
   - Claude Code 的 `SDKResultMessage.result` 和 Hermes 的 `final_response` 都是 agent 层产物。
   - CLI panel、gateway send、stream edit、附件发送是展示层产物。
2. 桌宠对话循环应当保存完整 event / message history，但给用户气泡只展示最终可见文本。
3. 工具调用不应被当成最终回答。模型请求工具后，需要等工具结果回填，再跑下一轮，直到模型输出无工具调用的文本。
4. 空响应、只返回 reasoning、预算耗尽、context 过大都需要显式 fallback 文案，否则用户会感觉“它没回话”。
5. 如果未来 GraphiteUI 支持流式输出，建议沿用 Hermes 的策略：流式已发送正文时，最终节点不要再重复展示同一段文本，只补媒体、footer 或错误提示。

# 结构化输出与 Function Calling 调研

本文记录 `demo/` 中三个参考项目对 JSON 结构化回复和工具调用的约束方式，并给出 GraphiteUI 是否应引入 function calling 概念的判断。

调研对象：

- `demo/claude-code-source`
- `demo/hermes-agent`
- `demo/openclaw`

`demo/slg_langgraph_single_file_modified_v2.py` 是单文件示例，不属于本文所说的三个 demo 项目。

## 总结

只靠提示词要求模型“请输出 JSON”是弱约束。三个 demo 都把约束下沉到了更稳定的层级：

- 模型 API 层：用 provider 原生结构化输出或 tool/function calling 参数约束模型。
- Schema 层：用 Zod、TypeBox、JSON Schema 或 OpenAI strict tool schema 描述结构。
- 运行时层：模型返回后仍做 JSON parse、schema validation、参数归一化和错误回传。
- 审计层：保留原始输出、解析结果、错误信息和工具执行记录，便于定位问题。

三个项目的侧重点不同：

| 项目 | 核心方式 | 适合借鉴的部分 |
| --- | --- | --- |
| `claude-code-source` | 模型级 `json_schema` 输出格式 + Zod/JSON Schema + 结果校验 | LLM 节点写 state 时使用 provider 原生 structured output |
| `hermes-agent` | OpenAI function calling 工具 schema + 参数解析纠偏 + raw tool call parser | 本地模型和开放模型的工具调用容错、错误回传和自修复 |
| `openclaw` | 多 provider 工具 schema 归一化 + strict tool schema + TypeBox/Zod/AJV + 文本工具调用兜底解析 | GraphiteUI 的模型适配层和跨 provider schema 标准化 |

对 GraphiteUI 的结论：

- 应该引入 function calling 的概念，但不应把它作为产品主协议。
- GraphiteUI 的产品主协议仍应是 `node_system`、`state_schema`、Skill、Subgraph 和 graph run。
- function calling 应作为“某些模型/provider 的调用适配层”，用于增强结构约束，而不是绕过 GraphiteUI 的 skill registry、权限、审批和审计。
- 对不支持 function calling 或 structured output 的本地模型，应保留 JSON Schema prompt fallback、运行时校验和 repair retry。

## 约束层级

实际系统里，结构化输出通常分成四层。

### 1. 提示词约束

提示词告诉模型应该输出什么，例如：

```text
请返回 JSON，不要输出 Markdown。
字段必须包含 query、reason、confidence。
```

这是最低层约束。它能提高成功率，但没有强制力。模型可能输出解释文字、代码块、缺字段、错类型，或者在长上下文里忘记格式要求。

### 2. API 协议约束

如果 provider 支持 structured output、JSON Schema、tool calling 或 function calling，可以把 schema 放进请求参数，而不是只写在 prompt 里。

这类约束比提示词强，因为模型服务端会把 schema 纳入解码或工具调用协议。不同 provider 的能力和字段名不同，例如：

- Anthropic Claude Code 使用 `output_config.format`。
- OpenAI Responses / Chat Completions 使用 tool/function schema 和 strict tool schema。
- Gemini 使用 `functionDeclarations.parametersJsonSchema`。
- Ollama 或部分 OpenAI-compatible 网关使用 OpenAI 风格 `tools[].function.parameters`。

### 3. 运行时校验

即使 provider 号称支持结构化输出，应用层也不能直接信任结果。运行时仍需要：

- 解析 JSON。
- 按 JSON Schema / Zod / TypeBox / Pydantic 校验。
- 检查业务约束，例如文件名是否在允许集合内、工具名是否存在、路径是否在白名单内。
- 对常见模型漂移做安全归一化，例如字符串数字转数字、字符串布尔转布尔。
- 校验失败时生成可读错误，让模型或用户修正。

### 4. 审计和恢复

结构化输出失败不是异常小概率事件，而是模型运行的一部分。成熟系统会记录：

- 使用的 schema。
- 模型原始返回。
- 解析后的结构。
- validation error path。
- 工具调用参数。
- 工具执行结果。
- 是否发生 repair retry。

这对 GraphiteUI 尤其重要，因为图运行需要可审计、可回放、可定位。

## Claude Code 的实际做法

`claude-code-source` 是三个项目里最接近“强结构化 JSON 回复”的实现。

### 定义输出格式协议

SDK 里定义了 `OutputFormatSchema`，类型固定为 `json_schema`：

```text
demo/claude-code-source/src/entrypoints/sdk/coreSchemas.ts
```

关键语义：

- `OutputFormatTypeSchema = z.literal('json_schema')`
- `JsonSchemaOutputFormatSchema = { type: 'json_schema', schema: Record<string, unknown> }`
- 这个 schema 是 SDK 可序列化数据类型的一部分，不是散落在 prompt 中的文本约定。

这说明 Claude Code 把“我要结构化输出”当成正式 API 参数，而不是一句自然语言提示。

### 把 JSON Schema 传给模型 API

在主模型请求里，如果 `options.outputFormat` 存在，代码会把它合并进 `outputConfig.format`，最后放到请求体的 `output_config` 中：

```text
demo/claude-code-source/src/services/api/claude.ts
```

关键语义：

- 如果当前模型支持 structured outputs，就追加 structured outputs beta header。
- 请求体最终包含 `output_config: outputConfig`。
- `outputConfig.format` 就是前面传入的 JSON Schema 输出约束。

内部 side query 也使用同样的机制：

```text
demo/claude-code-source/src/utils/sideQuery.ts
```

这意味着内部分类、筛选、标题生成等小模型调用也可以用结构化输出，而不是靠自然语言格式说明。

### 使用场景 1：记忆筛选

`findRelevantMemories.ts` 会要求模型返回：

```json
{
  "selected_memories": ["memory-a.md", "memory-b.md"]
}
```

它把以下 schema 传给模型：

```json
{
  "type": "object",
  "properties": {
    "selected_memories": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["selected_memories"],
  "additionalProperties": false
}
```

模型返回后仍然会：

- 找到 text block。
- `jsonParse(textBlock.text)`。
- 用 `validFilenames` 过滤掉不在候选列表里的文件名。

这点很重要：即使有模型级 schema 约束，它也没有直接信任模型输出，而是继续做业务校验。

### 使用场景 2：会话标题

`sessionTitle.ts` 用 `queryHaiku` 生成标题时，要求模型输出：

```json
{
  "title": "A sentence-case title"
}
```

它同样传入 `outputFormat: { type: 'json_schema', schema: ... }`，然后用 Zod schema 解析结果。

### 工具 schema

Claude Code 的工具输入使用 Zod schema 或已有 JSON Schema 生成模型可见的工具定义：

```text
demo/claude-code-source/src/utils/api.ts
```

关键语义：

- 优先使用工具自带的 `inputJSONSchema`。
- 没有时用 `zodToJsonSchema(tool.inputSchema)`。
- 工具 schema cache key 会包含 `inputJSONSchema`，避免同名结构化工具拿到旧 schema。
- 如果 feature gate、工具配置和模型能力都满足，则加 `strict: true`。

MCP 暴露工具时也会把 Zod 转成 `inputSchema` 和 `outputSchema`：

```text
demo/claude-code-source/src/entrypoints/mcp.ts
```

MCP 的 `outputSchema` 还要求 root 是 object。如果 Zod union 生成了 root `anyOf/oneOf`，就不会直接暴露为 MCP output schema。

### Claude Code 的启发

GraphiteUI 可以直接借鉴这条分层：

```text
state_schema / skill schema
  -> 生成 JSON Schema
  -> provider 支持时放进 structured output 参数
  -> provider 不支持时降级为 prompt schema
  -> 运行时 parse + validate
  -> 校验失败时 repair retry 或 run error
```

它适合 GraphiteUI 的两个场景：

- LLM 节点写普通 state。
- LLM 节点为一个 Skill 生成入参。

## Hermes Agent 的实际做法

`hermes-agent` 的核心不是最终回复 JSON Schema，而是工具调用协议。

### 工具注册中心

Hermes 的工具统一注册到 registry：

```text
demo/hermes-agent/tools/registry.py
```

注册参数包括：

- `name`
- `toolset`
- `schema`
- `handler`
- `check_fn`
- `requires_env`
- `description`

工具 schema 是 OpenAI function calling 形态，例如：

```json
{
  "name": "send_message",
  "description": "...",
  "parameters": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["send", "list"] },
      "target": { "type": "string" },
      "message": { "type": "string" }
    },
    "required": []
  }
}
```

这个例子在：

```text
demo/hermes-agent/tools/send_message_tool.py
```

### 动态工具定义

`model_tools.py` 的 `get_tool_definitions()` 会根据启用和禁用的 toolset 生成最终模型可见工具列表：

```text
demo/hermes-agent/model_tools.py
```

实际处理包括：

- 按 `enabled_toolsets` / `disabled_toolsets` 过滤工具。
- 通过 registry generation 和配置文件 mtime 做缓存失效。
- 只暴露 `check_fn` 通过的工具。
- 动态重建某些工具 schema，例如 `execute_code` 可调用的 sandbox 工具列表。
- 如果某些工具不可用，就从其他工具描述里移除会诱导模型误调用的文字。
- 最后做 schema sanitizer，提高不同后端兼容性。

这说明 Hermes 不只是把所有工具丢给模型，而是在每轮运行前构造“当前真实可用”的工具视野。

### Agent loop 中的工具调用

`agent_loop.py` 发送请求时，如果有工具，就把 `tools` 放入 `server.chat_completion()`：

```text
demo/hermes-agent/environments/agent_loop.py
```

返回后处理：

1. 如果响应有标准 `assistant_msg.tool_calls`，就按 OpenAI tool call 协议执行。
2. 如果没有标准 `tool_calls`，但正文包含 `<tool_call>`，就用 fallback parser 从文本里提取工具调用。
3. 对每个 tool call，先检查工具名是否存在。
4. 再 `json.loads(tool_args_raw)` 解析参数。
5. JSON 参数非法时，返回一个工具错误消息，提示模型用 valid JSON 重试。
6. 参数合法时，调用 `handle_function_call()`。

这就是 function calling 在 agent loop 里的典型工作方式：模型不直接执行工具，只声明“我要调用某个函数以及参数是什么”；宿主程序校验并执行。

### 参数纠偏

Hermes 的 `coerce_tool_args()` 很有实用价值。它会根据工具 JSON Schema 修正常见 LLM 参数漂移：

- `"42"` 转成 `42`。
- `"true"` 转成 `true`。
- JSON 字符串转 object 或 array。
- schema 期望 array 但模型给了单个字符串时，包成单元素数组。
- 如果 schema 允许 null，字符串 `"null"` 转成 `None`。

这类纠偏不是强安全边界，但能提高本地模型和开源模型的成功率。

### Provider adapter

Hermes 还把 OpenAI 工具协议转给其他 provider：

- Gemini adapter：OpenAI `tools[]` 转 Gemini `functionDeclarations`，Gemini function call 再转回 OpenAI `tool_calls`。
- Anthropic adapter：OpenAI `tool_choice` 映射为 Anthropic `tool_choice`。
- Codex Responses adapter：Chat Completions tools 转 Responses function tools，再把 function_call output 转回 ChatCompletion-like `tool_calls`。

这说明 Hermes 以 OpenAI function calling 形态作为内部统一工具调用表示，再通过 adapter 兼容不同模型。

### Hermes 的启发

Hermes 适合借鉴的不是“让 GraphiteUI 改成多轮 agent loop”，而是这些工程策略：

- 每轮只暴露当前真实启用、真实可用的工具。
- 工具 schema 不仅约束参数，也描述能力边界。
- 工具名必须校验，不存在则返回结构化错误。
- 工具参数必须 JSON parse，非法时返回可恢复错误。
- 可对常见类型漂移做安全纠偏。
- 对不支持标准 tool call 的模型，可以有文本标签 fallback parser，但 fallback 结果仍要走同一套校验和执行路径。

## OpenClaw 的实际做法

`openclaw` 是三个项目里跨 provider 适配最完整的一个。它的核心思路是：工具结构统一，但不同 provider 的 schema 能力不同，需要在发送前归一化。

### 工具统一类型

OpenClaw 的工具抽象是 `AnyAgentTool`：

```text
demo/openclaw/src/agents/tools/common.ts
```

工具一般包含：

- `name`
- `label`
- `description`
- `parameters`
- `execute`

工具结果也有统一形态，例如：

- `textResult(text, details)`
- `payloadTextResult(payload)`
- `jsonResult(payload)`

也就是说，工具执行输出既有给模型看的 text content，也有程序可用的 `details` 结构。

### TypeBox 工具 schema

OpenClaw 大量工具使用 TypeBox 描述参数。例如 file-transfer：

```text
demo/openclaw/extensions/file-transfer/src/tools/descriptors.ts
```

其中 `FileFetchToolSchema`、`DirListToolSchema`、`FileWriteToolSchema` 都是 TypeBox object schema。描述中还直接写入权限要求，例如：

- 需要 operator opt-in。
- 需要 `gateway.nodes.allowCommands` 包含某个命令。
- 需要 allowReadPaths / allowWritePaths 匹配路径。

这说明 schema 不只是技术类型，也承载了能力边界和使用说明。

### Provider schema 归一化

OpenClaw 的 `normalizeToolParameterSchema()` 会处理不同 provider 对 JSON Schema 的限制：

```text
demo/openclaw/src/agents/pi-tools-parameter-schema.ts
```

关键处理：

- Gemini 会拒绝一些 JSON Schema 关键词，需要清理。
- OpenAI function tool schema 要求顶层是 `type: "object"`。
- Anthropic 更接近完整 JSON Schema。
- xAI 会拒绝某些 validation constraint keyword。
- 对顶层 `anyOf/oneOf` 的对象 union，会尽量合并成单个 object schema，提高 provider 兼容性。
- 空 schema 会归一化为 `{ type: "object", properties: {} }`。

这对 GraphiteUI 很重要。GraphiteUI 如果直接把内部 schema 原样发给所有 provider，会很容易遇到某些模型或网关 400。

### OpenAI strict tool schema

OpenClaw 有单独的 OpenAI strict tool schema 处理：

```text
demo/openclaw/src/agents/openai-tool-schema.ts
```

它会：

- 把普通工具 schema 先归一化。
- strict 模式下为顶层 object 补 `additionalProperties: false`。
- 检查是否含有 strict 不兼容形态，例如 root `anyOf/oneOf/allOf`、数组形式 `type`、object 没有完整 required。
- 如果 strict 设置为 true，但某些工具 schema 不兼容，就降级为 `strict=false` 并记录诊断。

OpenAI Responses 和 Completions 两条传输路径都会使用这套转换：

```text
demo/openclaw/src/agents/openai-transport-stream.ts
```

这比简单地“打开 strict”更稳。因为 strict schema 本身也有兼容规则，如果 schema 形态不符合 provider 要求，强行打开只会导致请求失败。

### 不同 provider 的工具协议转换

OpenClaw 会把统一工具表示转成不同 provider 的请求形态。

OpenAI Responses：

```text
tools -> [{ type: "function", name, description, parameters, strict }]
```

OpenAI Completions：

```text
tools -> [{ type: "function", function: { name, description, parameters, strict } }]
```

Google Gemini：

```text
tools -> [{ functionDeclarations: [{ name, description, parametersJsonSchema }] }]
```

Ollama：

```text
tools -> [{ type: "function", function: { name, description, parameters } }]
```

同一个 GraphiteUI schema 以后也应走这种 provider adapter，而不是在每个节点、每个技能里硬编码 provider 差异。

### 文本工具调用兜底

OpenClaw 也处理不返回标准 tool call 的模型。比如 Kimi 会在文本中输出：

```text
<|tool_calls_section_begin|>
<|tool_call_begin|>functions.read:0
<|tool_call_argument_begin|>{"file_path":"./package.json"}
<|tool_call_end|>
<|tool_calls_section_end|>
```

`kimi-coding/stream.ts` 会：

- 检查文本是否完整包在 tool call section 内。
- 找到工具名和参数片段。
- `JSON.parse(rawArgs)`。
- 要求参数必须是 object，不能是数组。
- 转成内部统一 `toolCall` block。

这类 fallback parser 是兼容层，不是安全边界。解析出来以后仍要走工具名校验、参数校验、权限和执行审计。

### AJV 和工作流参数

Lobster 扩展里还用了 AJV compile cache：

```text
demo/openclaw/extensions/lobster/src/lobster-ajv-cache.ts
```

它把 JSON Schema 稳定序列化后 hash 成 cache key，缓存 AJV 编译结果，避免重复编译。`lobster-runner.ts` 对 workflow `argsJson` 做 `JSON.parse`，非法时直接报错：

```text
run --args-json must be valid JSON
```

这体现了另一个方向：对于经常重复校验的 schema，可以把 validator 编译和缓存作为性能优化。

### OpenClaw 的启发

OpenClaw 对 GraphiteUI 的最大价值是 provider compatibility：

- GraphiteUI 的内部 schema 不应该等同于 provider schema。
- 需要一层 `SchemaAdapter` 把 GraphiteUI schema 转成 provider 能接受的 schema。
- strict 模式需要能力探测和兼容性检查，不能盲目打开。
- 对本地模型、OpenAI-compatible 网关和特殊模型输出格式，需要 parser fallback，但 fallback 后必须回到统一执行协议。

## Function Calling 的作用原理

function calling 不是模型真的在运行函数。它是一种“模型声明调用意图，宿主程序执行”的协议。

完整链路通常是：

```text
应用提供工具列表
  -> 每个工具包含 name、description、parameters JSON Schema
  -> 模型阅读用户请求和工具列表
  -> 模型选择是否调用某个工具
  -> 模型输出结构化 tool/function call：工具名 + JSON 参数
  -> 应用校验工具名和参数
  -> 应用执行真实函数或技能
  -> 应用把工具结果作为 tool message 放回上下文
  -> 模型基于工具结果继续回答或继续调用工具
```

示例：

```json
{
  "tool_calls": [
    {
      "id": "call_123",
      "type": "function",
      "function": {
        "name": "web_search",
        "arguments": "{\"query\":\"GraphiteUI structured output\"}"
      }
    }
  ]
}
```

应用收到后会：

1. 检查 `web_search` 是否存在、是否启用、是否允许当前运行来源使用。
2. 把 `arguments` 解析成 JSON。
3. 按 `web_search.inputSchema` 校验。
4. 检查网络权限或审批策略。
5. 调用本地 `run.py` 或对应 runtime。
6. 把结果写入工具结果消息、state、artifact 和 run detail。

function calling 的作用不是替代权限系统，而是提升模型输出“调用哪个工具、用什么参数”的结构稳定性。

## Function Calling 能解决什么

### 能解决

- 比提示词更稳定地生成工具名和 JSON 参数。
- 让模型在多个工具之间选择调用目标。
- 让 provider 帮忙约束参数结构。
- 降低“前后夹杂解释文字导致 JSON 解析失败”的概率。
- 对支持 strict 的模型，可以进一步减少缺字段、错字段和额外字段。

### 不能解决

- 不能保证模型选择的工具一定正确。
- 不能替代业务校验和权限检查。
- 不能替代 GraphiteUI 的 skill registry。
- 不能自动理解 GraphiteUI 的 state_schema 和 outputMapping。
- 不能保证所有 provider 都支持同一套 schema。
- 不能覆盖不支持 tool calling 的本地模型。
- 不能防止工具执行产生副作用，所以审批和审计仍然必须在 runtime。

## GraphiteUI 是否应该引入 Function Calling

建议引入，但只作为适配层和增强能力，不作为产品主干。

### 不建议的路线

不建议把 GraphiteUI 改造成“模型直接 function call 技能”的主协议：

```text
LLM sees all enabled skills
  -> model emits tool_call
  -> runtime executes tool_call
```

原因：

- GraphiteUI 已经确定“图才是 Agent，单个 LLM 节点只做一次模型运行或一次能力调用准备”。
- 一个 LLM 节点最多一个能力来源，不能把多工具选择和多轮调用藏进单节点。
- 手动 Skill、动态 `capability` state 已经有明确协议。
- 直接 tool_call 容易绕开 `skillBindings.outputMapping`、`result_package`、run detail 和权限审批。
- 本地模型和自定义 OpenAI-compatible 网关的 function calling 支持不稳定，不能作为唯一通道。

### 建议的路线

GraphiteUI 可以把 function calling 放在 provider adapter 内：

```text
GraphiteUI node_system / state_schema / skill schema
  -> 构造本次 LLM 节点需要的结构化任务
  -> provider 支持 structured output 时，用 response_format/json_schema
  -> provider 更适合 tool/function calling 时，用单工具 function schema 约束入参生成
  -> provider 不支持时，用 prompt fallback
  -> runtime parse + validate + execute skill
  -> 写 state / result_package / run detail
```

也就是说，GraphiteUI 对外仍然表达：

- 这个 LLM 节点绑定了一个 Skill。
- 这个 LLM 节点接收了一个 `capability` state，且该对象的 `kind` 是 `skill`、`subgraph` 或 `none`。
- runtime 要执行这个 Skill 或 Subgraph。

provider 内部可以选择：

- 用 structured output 让模型生成 skill input JSON。
- 用 function calling 让模型生成一个“虚拟函数调用”，函数名就是当前唯一能力，参数就是 skill input。
- 用 prompt fallback 让模型输出 JSON。

最终 GraphiteUI runtime 看到的都应该是同一种结果：

```json
{
  "skillKey": "web_search",
  "input": {
    "query": "..."
  }
}
```

而不是把 provider 的 tool call 对象扩散到整个产品协议里。

### 静态 Skill 节点

静态 Skill 节点已经知道唯一技能来源：

```json
{
  "config": {
    "skillKey": "web_search"
  }
}
```

此时 function calling 不需要让模型选择工具，只需要约束“如何填写这个技能的 input”。

最合理的模型任务是：

```text
根据当前 reads state、技能 description、有效 llmInstruction 和 inputSchema，
生成 web_search 的入参 JSON。
```

如果 provider 支持 JSON Schema structured output，优先使用：

```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string" }
  },
  "required": ["query"],
  "additionalProperties": false
}
```

如果某个 provider 对 tool calling 更稳定，也可以构造成一个单函数：

```json
{
  "name": "web_search",
  "description": "执行联网搜索。",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"],
    "additionalProperties": false
  }
}
```

但运行时仍应把它还原为 GraphiteUI 的 skill input，然后走现有 skill runtime。

### 动态 Capability State

动态 `capability` state 来自上游选择节点。下游 LLM 节点接收到它时，也已经只有一个能力来源。它是单个互斥对象，不是列表；`kind=skill` 时执行技能，`kind=subgraph` 时执行子图能力，`kind=none` 时表达没有合适能力。

这种情况下也不应该让模型从多个工具中 function call 选择，而是：

```text
上游输出 capability state
  -> 下游 LLM 节点读取这个 capability descriptor
  -> 根据该 capability 的公开 inputSchema 生成入参
  -> runtime 执行 capability
  -> 输出唯一 result_package state
```

function calling 在这里最多还是“入参生成约束”，不是“自主多工具调用循环”。

因此 function calling 的抽象最好不要叫 `skill_calling`，而应是更通用的 capability input generation：

```text
capability = static skill | dynamic capability state
LLM generates capability input
runtime executes capability
runtime writes mapped outputs or result_package
```

## 建议的 GraphiteUI 分层设计

### 1. Schema Source

唯一来源仍然是：

- `state_schema`
- Skill `inputSchema`
- Skill `outputSchema`
- Subgraph 公开 input/output schema

不要新增平行协议，例如单独维护一套 function call schema。

### 2. Schema Adapter

增加 provider schema adapter：

```text
GraphiteUI schema
  -> canonical JSON Schema
  -> provider-specific schema
```

需要处理：

- OpenAI strict tool schema 要求。
- Anthropic structured output schema。
- Gemini schema keyword 清理。
- Ollama/OpenAI-compatible 网关兼容。
- 顶层 union / anyOf / oneOf 降级策略。
- `additionalProperties` 默认策略。
- required 字段策略。

### 3. Structured Output Driver

为 LLM 节点的结构化任务定义统一 driver：

```text
generate_structured_json(messages, schema, purpose, provider)
```

内部策略：

1. provider 支持原生 structured output：用 response_format / output_config。
2. provider 对 function calling 更可靠：构造单 function tool，要求模型调用这个 function。
3. provider 不支持：prompt fallback。
4. 所有路径都返回统一 parsed JSON 或 validation error。

### 4. Validation 和 Repair

每次模型结构化输出后都做 runtime validation。

失败时可做有限 repair retry：

```text
上一次输出未通过 schema 校验。
错误路径：$.query
错误原因：required property missing
请只返回符合 schema 的 JSON。
```

建议默认最多 1 到 2 次。超过后把错误写入 run detail，不要无限重试。

### 5. Audit

run detail 至少记录：

- `structured_generation_purpose`
- `schema`
- `provider_strategy`
- `raw_model_output`
- `parsed_json`
- `validation_errors`
- `repair_attempts`
- `final_status`

Skill 执行还应记录：

- `skillKey`
- effective `llmInstruction`
- generated input
- validation result
- output mapping 或 `result_package`
- artifacts

## 和现有协议的关系

### 不改变的内容

- `node_system` 仍是唯一图协议。
- `state_schema` 仍是节点输入输出唯一数据来源。
- 静态 Skill 仍是 `config.skillKey` 单值。
- 静态 Skill 输出仍通过 `skillBindings.outputMapping` 写入 managed state。
- 动态 `capability` 执行仍输出唯一 `result_package`。
- LLM 节点仍是一次性节点，不变成多轮自主 agent。
- Subgraph 仍通过 Subgraph 节点做手动复用，`capability.kind=subgraph` 只服务动态能力选择。

### 可以增强的内容

- LLM 节点写普通 state 时，使用 structured output schema。
- LLM 节点生成 skill input 时，使用 structured output 或单 function call。
- 运行时把 validation error 写入 run detail 并支持有限 repair retry。
- provider adapter 负责兼容不同模型的 schema 限制。

## 最终建议

GraphiteUI 应该把“结构化输出”作为比 function calling 更上层的正式能力。

推荐心智：

```text
GraphiteUI 需要的是可校验的结构化 JSON。
function calling 是某些 provider 生成结构化 JSON 的一种手段。
```

因此路线应是：

1. 先建立统一的 structured JSON generation runtime。
2. 让它从 `state_schema`、Skill schema 和 Subgraph schema 生成 JSON Schema。
3. provider 支持 structured output 时优先使用。
4. provider 适合 function calling 时，把 function calling 作为 driver 的一种策略。
5. 不支持时 fallback 到 prompt JSON，但仍然 runtime validate。
6. 所有能力执行仍走 GraphiteUI skill/subgraph runtime，不能直接执行 provider tool call。

这样既能获得 function calling 的结构约束收益，又不会破坏 GraphiteUI 已经收束好的图优先架构。

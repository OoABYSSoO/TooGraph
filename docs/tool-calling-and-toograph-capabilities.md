# Tool Calling 与 TooGraph 能力调用

最后整理日期：2026-06-01。

本文整理 TooGraph 中 `Tool`、`Action`、`Subgraph`、`capability` 与传统模型 `tool calling` / `function calling` 的关系。核心结论是：TooGraph 已经有一套图原生能力调用协议，它和传统 tool calling 相似，但所在层级不同，不能直接混为一谈。

## 1. 核心结论

TooGraph 的图协议可以被理解为一种更高层、更可审计的能力调用系统：

```text
Provider Tool Calling
模型协议层：模型产出 tool_calls 或 function call 参数。

TooGraph Capability Calling
图协议层：Action / Tool / Subgraph 被显式调用。

TooGraph Action
能力包层：一次受控能力执行，可包含 before_llm、LLM 参数生成、after_llm。

TooGraph Tool
确定性工具层：无 LLM 的 runtime function。
```

传统 tool calling 是模型 API 层的协议：模型只输出“我要调用哪个工具、参数是什么”。TooGraph capability calling 是图运行时层的协议：运行时根据图节点、schema、权限、校验和映射规则执行能力，并把结果写回 state、run record 和 artifact。

因此，模型支持 tool calling 不代表它可以直接执行 TooGraph 的 Tool 或 Action。模型最多生成调用意图或结构化参数，真正执行必须经过 TooGraph Runtime。

## 2. 传统 Tool Calling 如何工作

传统 tool calling 通常分为四步：

1. 应用把工具 schema 发给模型。
2. 模型判断是否需要工具，并返回 `tool_calls`。
3. 应用校验参数并执行真实函数、API 或脚本。
4. 应用把工具结果作为 `tool` 消息发回模型，模型继续生成最终回答。

模型之所以知道要调用什么工具，是因为工具说明会成为模型可见上下文的一部分。它通常不是直接拼进用户消息，而是通过 provider API 的结构化字段传入，例如 `tools`、`tool_choice`、function schema 等。provider 会把这些字段转换成模型能理解的内部表示，可能是特殊消息、特殊 token、chat template 片段，或其他实现细节。

模型判断工具调用时主要依赖这些信息：

```text
用户消息
+ 系统/开发者指令
+ 可用工具列表
+ 工具 name / description
+ 参数 JSON Schema
+ 历史消息
+ 已返回的工具结果
= 下一步输出普通文本，或输出 tool_calls
```

例如 `get_weather` 的 `description` 写着“查询指定城市和日期的天气”，参数 schema 里有 `city` 和 `date`。当用户问“明天北京天气怎么样”，模型会把“天气”“北京”“明天”和工具描述、参数名、参数描述匹配起来，于是预测下一步应该返回 `get_weather({"city":"北京","date":"tomorrow"})` 这样的结构化调用。

支持原生 tool calling 的模型通常经过相关训练，知道什么时候该输出普通文本，什么时候该输出 `tool_calls`，以及参数应该如何填。对于不支持原生 tool calling 的模型，框架通常会把工具说明拼进 system prompt，再要求模型输出 JSON；这类 prompt-based tool calling 更依赖提示词，可靠性通常弱于 provider 原生协议。

从最底层看，provider 传入的 `tools`、`response_format`、系统消息和用户消息最终都会变成模型可处理的 token 序列。这个层面上没有魔法。但它们的工程语义不同：

```text
提示词约束
把规则写进自然语言上下文，让模型“尽量遵守”。

Provider 原生协议
把工具 schema 或输出 schema 交给 API 的结构化字段，由 provider 用模型适配过的模板、特殊 role、特殊 token、解码策略或返回结构来引导输出。
```

如果应用只是把 schema 拼进系统提示词，例如：

```text
请输出：
{
  "state_2": "在此填写完整内容"
}
每个字段必须使用上方 key。
```

这属于 prompt-based structured output。模型可能遵守，也可能输出额外解释、缺字段、错类型，或把最终答案塞进错误位置。应用需要自己解析、校验和修复。

如果应用通过 provider 字段传入结构化约束，例如 `response_format`、JSON Schema、`tools` 或 `tool_choice`，则属于 provider-native structured output / tool calling。provider 知道这些字段不是普通用户文本，可能会把工具调用从普通 assistant content 中分离出来，并返回 `tool_calls` 或专门的结构化结果。不同 provider 的严格程度不同，但它通常比纯提示词更可控。

判断标准：

```text
结果出现在普通 assistant content 里
= 多半是提示词约束。

结果出现在 tool_calls 或 provider parsed structured output 里
= 更接近 provider 原生协议。

结果还经过 TooGraph state schema、validator、runtime、run record
= 才是 TooGraph 能力调用。
```

并不是所有 LLM 都支持原生 tool calling。Tool calling 不是模型内置的一组工具包，而是 provider API 协议和模型行为能力的组合：

```text
工具本身
= 应用或运行时提供的函数、API、脚本、Action、Tool、Subgraph。

Tool calling
= 模型按协议返回“我要调用哪个工具、参数是什么”。
```

模型没有自带 `search_web`、`get_weather` 或 `write_file` 这类工具。应用把工具定义发给模型，模型只负责生成调用请求，真正执行仍由宿主程序完成。

有些模型或运行时不支持原生 tool calling，常见原因包括：

- 模型没有针对工具调用行为训练或微调，只会普通续写文本。
- provider 或本地服务没有实现 `tools`、`tool_choice`、`tool_calls` 等协议字段。
- 本地推理框架没有适配该模型需要的 tool-use chat template、特殊 token 或特殊 role。
- 模型只能“像 JSON 一样”输出工具调用，但 provider 不会把它解析成标准 `tool_calls` 字段。
- 小模型、量化模型或弱工具模型在多工具、复杂参数、嵌套 schema、并行调用时稳定性不足。

因此，判断时要区分三件事：

```text
API 接受 tools 字段
不等于模型稳定支持 tool calling。

模型能输出 JSON
不等于 provider 原生 tool calling。

返回里有标准 tool_calls 字段，并且参数稳定符合 schema
才比较接近真正可用的 tool calling。
```

对 TooGraph 来说，稳妥路径是：

```text
检测 provider/model 是否支持 tool calling。
支持时，把它作为 capability selector 或 Action 参数生成的增强实现。
不支持时，继续使用 structured output + Validate then repair。
无论哪种方式，最终都映射回 TooGraph capability state 或 schema-backed state。
```

简化示例：

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "查询城市天气",
        "parameters": {
          "type": "object",
          "properties": {
            "city": { "type": "string" },
            "date": { "type": "string" }
          },
          "required": ["city", "date"]
        }
      }
    }
  ]
}
```

模型可能返回：

```json
{
  "tool_calls": [
    {
      "id": "call_123",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "{\"city\":\"北京\",\"date\":\"tomorrow\"}"
      }
    }
  ]
}
```

这里模型没有真的查天气。应用执行 `get_weather` 后，再把结果发回模型：

```json
{
  "role": "tool",
  "tool_call_id": "call_123",
  "content": "{\"city\":\"北京\",\"date\":\"2026-06-02\",\"weather\":\"多云\",\"low\":18,\"high\":29}"
}
```

模型再根据工具结果生成最终回答。

## 3. Function Calling 与 Tool Calling 的区别

`function calling` 是较早、更窄的说法，重点是“模型返回函数名和参数”。`tool calling` 是更泛化的说法，表示模型可以请求外部工具。

在 OpenAI-compatible 协议中，两者经常同时出现：请求字段叫 `tools`，工具类型仍然写成 `function`。

```json
{
  "type": "function",
  "function": {
    "name": "search",
    "parameters": {}
  }
}
```

所以可以这样理解：

```text
function calling = tool calling 的一种常见形式。
tool calling = 更泛化的模型工具请求协议。
```

## 4. TooGraph Schema 是不是 Tool Calling

TooGraph 的 `state_schema`、节点 reads/writes、input/output schema 本身不是传统 tool calling。它们更像图运行时的 typed contract：

```text
节点读取哪些 state。
这些 state 是什么类型。
节点写出哪些 state。
这些输出字段叫什么。
下游如何消费这些字段。
```

它们的作用是让图能够组合、校验、审计、回放。只有当 LLM 节点根据这些 schema 生成调用参数，并由运行时执行能力时，才接近传统 tool calling。

换句话说：

```text
Schema 本身 = 图协议的数据边界。
LLM 按 schema 生成 Action 参数 = 接近 function calling。
Runtime 执行 Action / Tool / Subgraph = TooGraph capability calling。
```

## 5. TooGraph Action 为什么像 Tool Calling

TooGraph Action 的典型执行链路是：

```text
before_llm.py
  -> 加载上下文、准备确定性材料、注入可审计信息。

LLM 调用
  -> 根据 llmOutputSchema 生成结构化参数。

after_llm.py / runtime
  -> 使用这些参数执行真实能力。

stateOutputSchema / actionBindings.outputMapping
  -> 把结果写回图 state。
```

这与传统 tool calling 的核心结构相似：

```text
模型负责生成调用参数。
宿主程序负责执行能力。
宿主程序负责校验、权限、记录和结果回灌。
```

但 TooGraph Action 更强约束、更图原生：

- 静态 Action 必须由 LLM 节点显式配置 `config.actionKey`。
- 动态 Action 必须通过 `capability` state 选择。
- 执行权在 TooGraph Runtime，不在模型。
- 输出写入 graph state，而不是直接作为聊天上下文里的 `role=tool` 消息。
- 权限、artifact、run record、output mapping 都属于图运行时协议。

因此 TooGraph Action 可以被称为 graph-native function calling，但不应直接等同于 provider 原生 tool calling。

## 6. TooGraph Tool 的含义

TooGraph 中的 `Tool` 是图协议里的确定性工具能力，不是 provider tool calling。

当前定义更接近：

```text
Tool = 无 LLM 的 runtime function。
```

它通常具有：

- `toolKey`
- `tool.json`
- input schema
- output schema
- runtime 注册
- 启用/禁用状态
- Tool 节点或动态 capability 执行路径
- `tool_invocation` run record

当前官方 Tool 例子是 `buddy_context_pressure_check`，用于确定性判断上下文压力，而不是让模型自由调用外部工具。

## 7. Action、Tool、Subgraph 的分工

TooGraph 当前最清晰的分工应保持为：

```text
Action
一次受控能力调用。可以联网、读写文件、运行脚本、返回 artifact。需要权限、审计和 output mapping。

Tool
确定性无 LLM 工具。适合上下文预算检查、格式转换、轻量计算、OCR 分段等明确输入输出的运行时函数。

Subgraph
图级能力或多步骤智能流程。适合包含多个 LLM 节点、Condition、Action、Tool、Output 的可复用流程。

Capability
动态能力选择的互斥包装。合法 kind 为 action / tool / subgraph / none。
```

单个 LLM 节点不应被做成隐藏多步骤 agent。多步骤智能应由图表达：

```text
LLM node -> Condition -> Action / Tool / Subgraph -> LLM review -> Output
```

## 8. 能力选择器是不是所有 Tool Calling 的入口

`toograph_capability_selector` 不应被理解成所有能力调用的唯一入口。它更准确是动态能力调用入口，尤其适合 Buddy 或 Agent loop。

TooGraph 里能力调用至少有这些入口：

```text
静态 Action 绑定
LLM 节点配置 config.actionKey。

Tool 节点
确定性执行一个 Tool。

Subgraph 节点
显式运行一个子图。

动态 capability selector
让 LLM 在 action / tool / subgraph / none 中选择下一步能力。
```

所以能力选择器是动态 capability calling 的入口，不是所有 capability calling 的入口。

在 Buddy 主循环中，它可以扮演类似 agentic tool use router 的角色：

```text
判断是否还需要能力。
需要时选择 action / tool / subgraph。
Runtime 执行能力。
结果写入 result_package。
后续 LLM 节点读取 result_package 并继续。
```

## 9. 与真实 Tool Calling 的关键差距

### 9.1 API 层不同

真实 tool calling 是 provider 原生协议：

```json
{
  "tools": [],
  "tool_choice": "auto"
}
```

模型返回：

```json
{
  "tool_calls": []
}
```

TooGraph 当前更多是通过 prompt、structured output、JSON schema 或 repair，让模型产出结构化对象。它不一定走 provider 原生 `tool_calls` 字段。

### 9.2 控制权不同

传统 tool calling 中，模型可以在对话循环里说“我要调用这个工具”。TooGraph 中，模型只能在被允许的节点位置输出参数或 capability 选择。真正执行能力的是图运行时。

这更安全，也更符合 TooGraph 的图优先架构。

### 9.3 返回路径不同

传统 tool calling 的工具结果通常回到同一个 chat context：

```text
role=tool -> LLM 继续生成
```

TooGraph 的能力结果写入图状态：

```text
state write / result_package / run record / artifact
```

后续节点再通过图边读取这些结果。

### 9.4 能力范围不同

传统 tool calling 通常表达函数调用：

```text
search()
get_weather()
create_event()
```

TooGraph capability 可以表达更丰富的图运行能力：

```text
Action   = 受控副作用能力。
Tool     = 确定性 runtime function。
Subgraph = 多步骤图能力。
```

### 9.5 多步骤方式不同

传统 agent tool calling 经常是隐藏循环：

```text
LLM -> tool -> LLM -> tool -> LLM -> final
```

TooGraph 应坚持显式图流：

```text
LLM -> Condition -> Action / Tool / Subgraph -> LLM review -> Output
```

这能保留审计、权限、运行记录、artifact、revision 和可视化检查。

## 10. LM Studio 支持方向

LM Studio 的 tool calling 能力可以被 TooGraph 使用，但推荐定位为 provider 层实现手段，而不是直接把 LM Studio 的 tool calls 映射成运行时执行。

推荐路径：

```text
LM Studio native tool calling
  -> 用于生成结构化 Action 参数、Tool 输入或 capability 选择。

TooGraph Runtime
  -> 校验 schema、权限、状态映射和运行记录。

Action / Tool / Subgraph executor
  -> 真正执行能力。

Graph state / result_package
  -> 回写结果给后续节点。
```

不推荐路径：

```text
LM Studio tool_calls
  -> 直接执行本地 Action / Tool
```

原因是这会绕过 TooGraph 的图协议、权限审批、审计记录和 output mapping。

## 11. 命名建议

因为 provider 的 `tool calling` 和 TooGraph 的 `Tool` 容易混淆，UI 和文档应避免裸露同一个词表达不同层级。

推荐命名：

```text
模型供应商页面
模型工具调用 / Function Calling / Tool Calling

TooGraph 侧栏 Tools
工具包 / 运行时工具

图节点 Tool
确定性工具

Action
受控能力 / Action

Capability
能力调用 / 动态能力
```

协议字段可以继续保留 `capability.kind="tool"`，但面向用户的 UI 应尽量说明它是 TooGraph runtime tool，而不是 provider tool calling。

## 12. 设计原则

后续设计应遵守这些边界：

- Provider tool calling 只负责让模型稳定地产生结构化调用意图。
- TooGraph Runtime 才拥有执行权。
- Action / Tool / Subgraph 的执行必须经过图协议、schema 校验、权限路径、run record 和 state mapping。
- 动态 capability selector 是动态能力路由器，不是隐藏 agent loop。
- 多步骤智能应由图模板表达，而不是埋进单个 Action、Tool 或后端循环。
- 模型原生 tool calling 可以提升结构化输出质量，但不能替代 TooGraph 的能力协议。

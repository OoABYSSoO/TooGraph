# Buddy 正统 Tool-Calling Agent Loop 反思

最后整理日期：2026-06-02。

本文是对 TooGraph Buddy 主循环和能力协议的一次重新校准。它不以迁移成本为约束，也不假设现有官方模板必须保持兼容。所有图模板都可以重建；已有 `Action`、`Tool`、`Subgraph` 等概念也可以重新命名、合并或降级为实现细节。目标是从更正统的 agent/tool-calling 理论出发，重新推导 TooGraph 的理想形态。

需要明确：TooGraph 的图协议不是凭空捏造的。它基于 LangGraph 的图运行心智，并重点做了画布可视化、运行记录、输出边界和本地能力治理。真正需要反思的不是“图是否应该存在”，而是 Tool/Action/capability 这一层是否偏离了正统 agent loop。

核心结论：

```text
Buddy 主循环应采用正统 tool-calling agent loop。

TooGraph 的价值不应是用提示词模拟工具调用，
而应是把 tool calls 做成可视化、可审计、可恢复、可权限控制的图运行。
```

## 1. 重新理解问题

TooGraph 之前的主循环来自一种自建能力协议：

```text
LLM 节点或 selector Action
  -> 输出准备调用哪个 capability
  -> 下一个节点执行 capability
  -> result_package 回到图
  -> 后续 LLM 节点继续处理
```

这个设计有合理来源：当时还没有完全理解 tool calling、function calling、agent loop、skill、tool registry 等已有理论，只能根据“Agent 应该如何运行”的直觉一点点搭建协议。

现在看，这套协议的问题不是不能运行，而是可能把已有成熟模型复杂化了：

- 能力选择器 Action 本质上像是在用提示词模拟 tool calling。
- 能力选择和参数生成被拆成多步，增加了节点数量和认知成本。
- `Action`、`Tool`、`Subgraph`、`capability` 等概念是 TooGraph 自创的局部协议，不是用户已经熟悉的 AI agent 基础概念。
- Buddy 主循环看起来像一组 TooGraph 内部机制，而不是一个清晰的 tool-calling agent。
- 如果 provider/model 已经支持稳定的 tool calling，却仍长期依赖提示词约束加 repair 兜底，会显得不专业。

这次反思允许推翻现有设计。重点不是“如何少改”，而是“理想状态应该是什么”。

## 2. 正统 Tool-Calling Agent Loop

成熟 agent loop 可以简化成：

```text
LLM receives:
  - 用户请求
  - 系统/开发者指令
  - 上下文和历史
  - 可用 tools
  - 每个 tool 的 name / description / parameters schema

LLM emits one of:
  - assistant response
  - tool_calls(name, arguments)

Runtime:
  - 校验 tool 是否可用
  - 校验 arguments 是否符合 schema
  - 检查权限、预算、风险
  - 执行 tool
  - 把 tool result / observation 放回上下文

Loop:
  - LLM 读取 tool result
  - 继续回复或继续调用工具
```

TooGraph 的理想形态不应违背这个基础模型。TooGraph 应该做的是：

```text
把这个 loop 可视化。
把每次 tool call 记录下来。
把权限、暂停、恢复、artifact、运行树做好。
把 loop 的边界用图表达。
```

而不是把 tool calling 拆成一套不必要的自定义选择器协议。

## 3. 理想的公开概念

面向用户和模型时，TooGraph 应尽量使用已有 AI agent 语义。

应保留的画布原语：

```text
Input
把用户输入、文件、上下文包或外部数据放入图状态。

Output
展示最终回复、结构化结果、artifact、预览或导出。

LLM Node
一次模型调用。可以普通回复，也可以发起 tool calls。

Condition
表达分支、循环、停止条件、错误路径、预算耗尽和人工审批后的走向。

Subgraph Node
图组合原语。用于显式运行另一个图，表达复杂工作流或复用模板。

Tool Node
明确调用某个工具。图作者已经知道这里要用哪个工具，因此不需要 LLM 动态选择。

Tool Executor
执行 LLM 输出的 tool_calls。它用于 agent loop，根据 tool name 和 arguments 动态分发到真实工具。
```

这些原语和 LangGraph 心智一致，也适合 TooGraph 的画布可视化。它们不需要因为引入 tool calling 而被推翻。理想重构主要发生在“LLM 如何看见并调用工具”以及“工具如何被管理和执行”这一层。

推荐公开概念：

```text
Tool
所有可被 LLM 调用的一次能力。包括函数、脚本、联网搜索、本地文件操作、媒体处理、记忆召回、图操作、工作流等。

Tool Group
工具集合，支持树形包含关系和权限/上下文预算管理。

Tool Call
模型输出的工具调用请求，包含 tool name、arguments、call id。

Tool Result / Observation
工具执行结果，回到下一轮 LLM 上下文。

Workflow / Graph Tool
一个图模板也可以作为 tool 被调用，执行时产生 child run。
```

需要弱化或重新定位的概念：

```text
Action
可以变成 Tool 的一种实现类型，而不是和 Tool 并列的用户概念。

Subgraph
作为画布原语的 Subgraph Node 应保留；作为暴露给 LLM 调用的能力时，应变成 Workflow Tool / Graph Tool，而不是单独暴露为 capability kind。

capability
可以作为内部统一类型保留，但不应成为用户理解 Buddy 主循环的核心概念。

toograph_capability_selector
不应再是 Buddy 主循环的核心 Action；它的职责应被 LLM node 的原生 tool calling 能力吸收。
```

也就是说，最终用户应该看到的是“这个 LLM 节点可以使用哪些工具”，而不是“这个节点先调用一个能力选择 Action，再输出 capability，再由动态 capability 执行器处理”。

## 4. Tool 管理页面

理想状态应有一个专门的 Tool 管理页面。它不只是当前工具包列表，而是整个 agent 能力生态的管理中心。

Tool 管理页面应支持：

- 树形工具目录，像文件管理器一样组织。
- 文件夹/分组有包含关系。
- 一个工具可以属于多个标签或集合，但主浏览形态应有清晰树结构。
- 每个工具有 `name`、`description`、`parameters schema`、`result schema`、权限、风险、成本、运行方式、示例。
- 工具可以来自官方、本地用户、安装包、图模板、外部 MCP/插件、本地脚本。
- 工具可以启用、禁用、隐藏、只读、需要审批、仅 Buddy 可用、仅某个项目可用。
- 工具组可以设定上下文预算和默认暴露策略。

示例树：

```text
Tools
├── Web
│   ├── search_web
│   └── fetch_page
├── Local Files
│   ├── read_file
│   ├── write_file
│   └── search_workspace
├── Memory
│   ├── recall_memory
│   └── write_memory
├── Media
│   ├── transcribe_audio
│   └── extract_video_frames
└── Workflows
    ├── deep_research
    └── edit_graph
```

这比 `Action / Tool / Subgraph` 三套入口更容易理解。内部可以仍然有不同 runtime 类型，但 UI 和 LLM 暴露层应统一成 Tool。

## 5. LLM 节点的 Tool 配置

每个 LLM 节点应可以配置可见 tools，而不是依赖一个额外的 capability selector。

推荐配置：

```text
Tool Access
  - None
  - All tools
  - Selected groups
  - Selected tools
  - Inherit from graph / Buddy profile

Tool Choice
  - auto
  - required
  - none
  - specific tool

Parallel Tool Calls
  - disabled
  - enabled when provider supports it

Fallback
  - native tool calling first
  - emulated tool calling via structured output
  - fail if native tool calling unavailable
```

LLM 节点在运行时根据配置得到一个 tool catalog slice：

```text
Graph/Buddy context
  -> resolve tool groups
  -> filter by permissions and provider limits
  -> compact descriptions
  -> send tools to provider
```

这让图作者可以清楚表达：

```text
这个 LLM 节点只能搜索网页。
这个 LLM 节点能读文件但不能写文件。
这个 Buddy 节点能用全部工具。
这个总结节点不允许使用工具。
```

## 6. 工具信息渐进展开

原生 tool calling 不是免费的。模型如果要在一次调用中同时完成“选择工具”和“填写调用参数”，应用就必须把可用工具的调用契约放进模型上下文。至少包括：

```text
tool name
tool description
parameters JSON Schema
每个参数的 description
```

这意味着全量暴露 tools 会带来明确成本：

- 工具越多，上下文越膨胀。
- 工具描述越长，模型越容易在相似工具之间混淆。
- 参数 schema 越复杂，误填概率越高。
- 高风险工具如果被宽泛暴露，会增加权限和审批压力。
- 复杂工具的完整操作手册不适合每轮都塞进 provider tools。

因此，TooGraph 不应把“使用 tool calling”理解成“每个 LLM 节点永远一次性暴露全部工具完整手册”。更合理的是分层暴露工具信息：

```text
第一层：Tool Index
  轻量工具目录，只包含 tool name、一句话用途、简短参数摘要、风险/权限标签。

第二层：Tool Manual
  选中某个工具后再加载详细说明，包括完整参数 schema、示例、边界条件、错误处理和输出语义。

第三层：Tool Execution
  基于完整 schema 生成或校验 tool_call，由 Tool Executor 执行并记录结果。
```

这保留了原来多步调用思路中有价值的部分：先确定需要哪个能力，再展开这个能力的详细操作说明。但它不应退回到“用提示词模拟 capability selector”的旧协议，而应成为正式的 tool registry / tool discovery 机制。

推荐区分三种工具暴露模式：

```text
Direct Tool Calling
  适合简单、低风险、参数少的工具。
  直接把完整 schema 放进 provider tools。
  例如 search_web(query)、get_time(location)。

Progressive Tool Calling
  适合复杂、高风险、参数多或需要长操作手册的工具。
  第一轮暴露 Tool Index 或 Tool Group。
  选中工具后加载 Tool Manual。
  第二轮再生成严格 tool_call。

Graph Tool Calling
  适合复杂工作流工具。
  LLM 只看见高层调用 schema。
  内部步骤由图模板或子图执行，并产生 child run、artifact 和审计记录。
```

这不是“tool calling 不如多步调用”，而是：

```text
简单工具：单步 native tool calling 更直接。
复杂工具：渐进展开更可靠、更省上下文、更容易做权限控制。
```

LLM 节点的 Tool 配置应支持这种策略：

```text
Tool Exposure
  - direct tools
  - tool index
  - selected tool groups
  - manual lookup allowed

Budgets
  - max direct tools
  - max tool schema tokens
  - max manual tokens per selected tool

Fallback
  - native direct call
  - progressive manual lookup
  - structured-output emulation
  - fail closed
```

这让 TooGraph 的优势更清楚：

```text
Provider tool calling 负责标准化模型调用格式。
TooGraph tool discovery 负责控制模型看见多少工具信息。
TooGraph 图运行负责把工具选择、手册展开、执行、观察结果和循环都做成可审计流程。
```

## 7. 两个正交维度

现在最容易混乱的地方，是把两个维度混在一起：

```text
维度 1：图运行形态
  - 固定工作流
  - agent loop

维度 2：工具调用来源
  - 图作者明确调用
  - LLM 动态 tool_call
```

这两个维度是正交的，不互相替代。

固定工作流：

```text
图作者明确知道每一步要做什么。
流程稳定、可预测、适合模板化。
Tool Node 直接调用指定工具。
```

例如：

```text
Input PDF
  -> Tool Node: extract_text_from_pdf
  -> LLM Node: summarize_text
  -> Output
```

或者：

```text
Input video
  -> Tool Node: extract_video_frames
  -> LLM Node: analyze_frames
  -> Output report
```

agent loop：

```text
图作者不知道模型下一步会需要什么工具。
LLM 根据任务和上下文动态输出 tool_calls。
Tool Executor 执行这些 tool_calls。
Condition 和循环边决定是否继续。
```

例如：

```text
User Message
  -> LLM Node with Web/File/Memory tools
  -> Condition: has tool_calls?
  -> Tool Executor
  -> Tool Observation
  -> LLM Node
  -> Output
```

TooGraph 的理想能力不是只支持其中一种，而是同时支持：

```text
固定流程图
证明 TooGraph 可以表达明确、可复用、可审计的工作流。

通用 agent loop
证明 TooGraph 的图协议足够表达动态工具调用、条件、循环、暂停、恢复和停止。
```

这也是 agent loop 的产品意义：它不是为了替代所有固定模板，而是证明 TooGraph 可以用图搭出通用 agent，而不是只能做固定流程编排。

## 8. Tool Node 与 Tool Executor

`Tool Node` 和 `Tool Executor` 应共享同一个 Tool Registry 和 Tool Runtime，但它们的心智不同。

Tool Node：

```text
调用来源：图作者明确选择。
输入来源：普通图 state / 输入绑定。
工具选择：静态，节点配置里指定 tool。
使用场景：固定工作流、批处理、明确的数据处理步骤。
可视化重点：这个节点调用了哪个工具、输入来自哪里、输出写到哪里。
```

Tool Executor：

```text
调用来源：LLM 输出 tool_calls。
输入来源：tool_call.arguments。
工具选择：动态，由模型在可见工具集合中选择。
使用场景：agent loop、多步探索、Buddy 主循环、动态任务处理。
可视化重点：模型为什么调用这个工具、arguments 是什么、校验/权限/执行结果如何。
```

两者底层可以复用：

```text
Tool manifest
Tool schema validation
Tool permission policy
Tool runtime invocation
Tool result normalization
Run record / artifact / warning / error logging
```

但画布上不应强行混成一个心智：

```text
Tool Node
  = 明确调用某个工具。

Tool Executor
  = 执行模型动态发起的工具调用。
```

这能解释为什么 TooGraph 仍需要 Tool Node。不是所有图都是 agent loop；大量高价值模板就是确定使用某个工具的固定工作流。

## 9. 图上的主循环表达

理想图不需要隐藏 while-loop，但也不需要把选择工具做成单独 Action。循环和分支仍然应该通过画布表达，尤其是通过 Condition 节点表达。

推荐主循环：

```text
Input / Context
  -> LLM Node with tools
  -> Branch: has tool_calls?
      yes -> Tool Executor -> Tool Results -> LLM Node
      no  -> Output
```

图上可以表现为：

```text
User Message
  -> Context Builder
  -> Buddy LLM
  -> Tool Call Branch
  -> Tool Executor
  -> Tool Observation
  -> Buddy LLM
  -> Final Output
```

这里的图仍然表达条件和循环：

- `has_tool_calls` 是 Condition 判断。
- `Tool Executor -> LLM Node` 是循环边。
- 普通回复、工具调用、工具错误、预算耗尽、审批暂停都可以是 Condition 的不同出口。
- 迭代预算、工具预算、失败分支、人工审批暂停都可以作为图节点或运行时事件可见。
- Output boundary 仍然可以控制 Buddy 聊天胶囊如何分段。

关键变化是：

```text
LLM 自己通过 tool_calls 输出要调用的工具和参数。
图负责把 tool_calls 路由到执行器，再把结果回灌。
```

## 10. LLM 输出协议

LLM 节点应允许两类自然结果：

```text
assistant response
普通回复，进入下游 Output 或 state write。

tool_calls
一个或多个工具调用请求，进入 Tool Executor。
```

原生 provider 返回可能是：

```json
{
  "content": "",
  "tool_calls": [
    {
      "id": "call_1",
      "type": "function",
      "function": {
        "name": "search_web",
        "arguments": "{\"query\":\"LM Studio tool calling\"}"
      }
    }
  ]
}
```

TooGraph Runtime 应把它标准化成内部事件：

```json
{
  "kind": "tool_call",
  "call_id": "call_1",
  "tool_key": "search_web",
  "arguments": {
    "query": "LM Studio tool calling"
  },
  "source_node": "buddy_llm"
}
```

Tool Executor 执行后产生：

```json
{
  "kind": "tool_result",
  "call_id": "call_1",
  "tool_key": "search_web",
  "status": "succeeded",
  "content": "...",
  "artifacts": [],
  "warnings": []
}
```

下一轮 LLM 调用应收到 tool result，而不是收到一个 TooGraph 专用的 `result_package` 说明书。`result_package` 可以作为 TooGraph artifact/state 包装存在，但对 agent loop 来说，核心语义应是 tool result / observation。

## 11. Structured Output 的重新定位

Tool calling 不会完全替代 structured output，但优先级应重新排列。

推荐定位：

```text
Tool calling
用于 agent 决策：是否调用工具、调用哪个工具、参数是什么。

Structured output
用于普通节点需要写结构化 state、生成报告 JSON、修复非原生 tool calling fallback 输出。

Validate then repair
用于 provider 不支持原生工具调用、tool arguments 不合法、final state 不合格时的兼容和修复。
```

Buddy 主循环中，如果 provider/model 支持原生 tool calling，则不应长期使用：

```text
提示词要求输出 capability JSON
-> 本地校验
-> repair
```

作为首选路径。它应该是 fallback，而不是专业主路径。

## 12. Tool 与权限边界

Provider tool calling 只是模型输出协议，不是安全边界。

TooGraph 仍必须控制：

- 工具是否启用。
- 当前 LLM 节点是否允许看见这个工具。
- 当前运行是否允许执行这个工具。
- 参数是否符合 schema。
- 文件路径、网络访问、成本、写入操作是否安全。
- 是否需要人工审批。
- 审批后如何 resume。
- 执行结果如何记录、展示、回滚或恢复。

也就是说：

```text
模型可以请求 tool call。
TooGraph Runtime 决定能不能执行。
```

这正是 TooGraph 的价值所在。

## 13. 工作流作为 Tool

现有 Subgraph / Graph Template 应考虑统一成一种 Tool 暴露方式：

```text
Workflow Tool
  name: deep_research
  description: 深度研究并返回引用资料和总结。
  parameters: { topic, depth, constraints }
  execution: run graph template as child run
  result: tool result with child_run_id, outputs, artifacts
```

这样模型不需要理解“Subgraph 是什么”。它只知道有一个工具叫 `deep_research`。Runtime 知道这个工具的实现是运行一个图模板。

这可以保留 TooGraph 的图优势，同时对齐 tool calling 的公共心智模型。

## 14. Action 的重新定位

现有 Action 可以被吸收成 Tool implementation：

```text
Action today
  manifest
  llmInstruction
  before_llm.py
  after_llm.py
  stateOutputSchema
  permissions

Ideal Tool
  manifest
  description
  parameters schema
  result schema
  runtime implementation
  permissions
  examples
```

如果一个现有 Action 的核心是“LLM 先生成参数，再 after_llm 执行”，那它可以成为：

```text
Tool with provider-generated arguments
```

如果一个现有 Action 本身还需要内部 LLM 推理，那它可以成为：

```text
LLM-backed Tool
```

但对外仍统一暴露为 Tool。用户不需要先理解 Action 与 Tool 的区别。

## 15. 固定工作流与通用 Agent 的关系

TooGraph 不应该把固定工作流和通用 Agent 对立起来。它们是同一套图系统的两种表达。

固定工作流适合：

- 输入输出明确。
- 工具选择确定。
- 需要稳定复用。
- 需要给非技术用户提供模板。
- 对成本、时间、权限、结果格式有强约束。

通用 agent loop 适合：

- 任务开放。
- 工具选择需要由模型判断。
- 中间步骤无法提前固定。
- 需要多轮探索、查证、读写、修复、继续。
- Buddy 这类对话式工作代理。

理想产品应允许图作者在两者之间自由组合：

```text
固定工作流中可以嵌入一个 agent loop。
agent loop 可以调用一个 workflow tool。
workflow tool 内部可以是一个固定图。
固定图中也可以有某个 LLM 节点允许有限工具调用。
```

例如：

```text
Deep Research Workflow
  -> 固定 Context Builder
  -> Agent Loop with Web tools
  -> Fixed Citation Formatter Tool Node
  -> LLM Node: final synthesis
  -> Output
```

这才是图协议功能完备性的体现：它既能表达稳定流程，也能表达动态 Agent。

## 16. Buddy UI 与运行记录

Buddy 聊天中可以把主循环显示为：

```text
Buddy 思考并调用工具
  tool: search_web
  arguments: { query: "..." }
  status: succeeded

Buddy 读取工具结果
  observation: 5 个搜索结果

Buddy 回复
  final response
```

RunDetail 中可以更详细：

- LLM request 中可见 tool group。
- 实际发送的 tools 数量和 schema hash。
- provider 是否使用原生 tool calling。
- tool_choice 策略。
- tool_call 原始 payload。
- normalized tool_call。
- 参数校验结果。
- 权限检查结果。
- 工具执行日志。
- tool result / observation。
- 回到下一轮 LLM 的消息边界。

这比展示 TooGraph 自定义 capability selector 更接近用户理解。

固定 Tool Node 的展示也应清楚区分：

```text
运行固定工具
  tool: extract_text_from_pdf
  input: uploaded_report.pdf
  status: succeeded
  output: extracted_text
```

动态 Tool Executor 的展示则强调模型发起：

```text
模型调用工具
  requested by: Buddy LLM
  tool: search_web
  arguments: { query: "..." }
  status: succeeded
```

两者都进入同一个 run record 和 artifact 系统，但用户能看出一个是图作者确定的步骤，一个是模型动态选择的步骤。

## 17. 失败与恢复

理想失败处理：

```text
Invalid tool name
  -> 给模型返回 tool error observation，或进入 fallback regenerate。

Invalid arguments
  -> 用 tool schema repair arguments，或让模型重新发起 tool call。

Permission required
  -> 暂停，展示 tool call 和参数，用户批准后 resume。

Tool failed
  -> tool error observation 回到 LLM，让它选择重试、换工具、降级回复。

Budget exhausted
  -> stop reason 写入 run record，进入 final response 或 failure output。
```

每个 tool call 应有稳定 `call_id`，这样审批、恢复、重试和审计都能绑定到一次明确调用。

固定 Tool Node 也需要恢复语义：

- 输入 state 缺失时，停在该节点并提示缺失字段。
- 工具执行失败时，可以 retry same node、跳过、走错误分支或人工修正输入后 resume。
- 写文件、网络、执行脚本等高风险工具，应在节点执行前暂停审批。
- 成功结果应写入 state、artifact 或 tool result record，供后续节点读取。

## 18. Provider 能力与降级策略

理想策略：

```text
Provider supports native tool calling
  -> use native tools/tool_calls.

Provider does not support native tool calling
  -> emulate tool calling with structured output AgentDecision schema.

Provider supports JSON Schema but not tool_calls
  -> use schema-backed emulated tool call.

Provider supports neither reliably
  -> prompt-only fallback, marked degraded.
```

降级必须被记录：

- 使用了哪个策略。
- 为什么没有用原生 tool calling。
- 是否发生 repair。
- repair 是否成功。
- 最终进入图状态的是原生 tool_call、结构化 fallback，还是提示词解析结果。

这能避免“表面能跑，实际不可诊断”的问题。

## 19. 对现有模板的态度

这次反思不要求兼容现有模板。理想状态下，官方 Buddy 模板可以重建为：

```text
Context Builder
  -> Buddy LLM with Tool Groups
  -> Tool Call Branch
  -> Tool Executor
  -> Tool Result
  -> Buddy LLM loop
  -> Output
```

其他模板也可以按相同原则重建：

- 不再默认使用 capability selector Action。
- LLM 节点直接配置工具组。
- 工具执行通过统一 Tool Executor。
- 明确工具步骤使用 Tool Node。
- 图模板作为 workflow tools 暴露给 LLM。
- 条件、循环、预算、审批仍由图表达。

旧概念可以保留为内部兼容层，但不应继续主导新设计。

## 20. 推荐理想架构

推荐目标架构：

```text
Tool Registry
  所有可调用能力的统一目录。

Tool Groups
  树形组织工具，并控制 LLM 节点可见范围。

LLM Node
  可配置 tool access，运行时优先使用 provider 原生 tool calling。

Tool Node
  明确调用某个工具，服务固定工作流。

Tool Call Branch
  判断 LLM 输出是普通回复还是 tool_calls。

Tool Executor
  执行 LLM 动态 tool_calls，完成校验、权限、审批、执行、记录、恢复。

Tool Result / Observation
  回到下一轮 LLM，形成图上可见循环。

Output
  展示最终回复或结构化结果。
```

这套架构更符合正统 agent 运行机制，也更容易解释给用户：

```text
LLM 节点可以使用哪些工具。
模型决定是否调用工具。
图执行工具。
工具结果回到模型。
循环直到回复。
固定流程也可以直接使用 Tool Node 调用工具。
```

## 21. 核心结论

TooGraph 不应该因为追求图可见性，而重新发明一套复杂的 tool calling 替代协议。

更好的方向是：

```text
采用正统 tool calling 作为 agent 主循环的基础协议。
用 Tool Registry 和 Tool Groups 管理工具。
让 LLM 节点直接配置可见 tools。
让模型输出普通回复或 tool_calls。
保留 Tool Node 表达明确工具调用。
使用 Tool Executor 执行动态 tool_calls。
用图表达 branch、loop、预算、审批、恢复和 output boundary。
用 TooGraph Runtime 执行、审计和恢复每一次 tool call。
```

这样既不放弃 TooGraph 的图产品优势，也不拒绝已有成熟 agent 理论。

## 22. 下一步需要设计的问题

进入实现设计前，需要回答：

- Tool Registry 的 manifest 形状是什么？
- 现有 Action / Tool / Subgraph 如何统一到 Tool 类型？
- Tool Group 的树形包含和标签系统如何设计？
- LLM 节点 UI 如何配置 tool access？
- Tool Node 的输入绑定、输出绑定和错误分支如何设计？
- Tool Call Branch 是普通 Condition，还是 LLM 节点自带输出端口？
- Tool Executor 是一个节点，还是运行时 primitive？
- Tool Node 和 Tool Executor 是否共用同一套 runtime、权限和 result schema？
- Workflow Tool 如何暴露图模板输入和输出？
- Provider tool calling 与 LM Studio thinking mode 的冲突如何处理？
- 当 provider 不支持 tool calling 时，emulated tool calling 的 schema 是什么？
- RunDetail 和 Buddy 胶囊如何展示 tool call、tool result、降级和 resume？

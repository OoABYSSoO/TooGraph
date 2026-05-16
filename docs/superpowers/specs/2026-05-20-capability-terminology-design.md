# TooGraph 能力术语设计

## 目标

TooGraph 需要同时支持两类容易混淆的能力：

1. 市面常见的 Agent Skill：给主 Agent 或 Buddy 使用的操作书、专业方法、行为流程和上下文说明。
2. TooGraph 现有的节点能力调用：一次由图节点触发的受控运行事务，例如当前 `skill/official/*` 中的 `before_llm.py -> LLM -> after_llm.py -> state` 链路。

这份设计固定命名边界，避免未来 Buddy Skill、节点能力、确定性工具和图模板都叫 Skill。

## 核心决定

- `Skill` 保留给 Agent 面向的操作书型能力。
- `Capability` 是上位概念，表示 Buddy 或图可以引用的一种能力入口。
- 现有 TooGraph `Skill` 的产品语义应逐步改名为 `Action`。
- 视频分段、文档切块、OCR 预处理等不需要 LLM 的确定性处理能力叫 `Tool`。
- 多节点图模板或可复用子图能力叫 `Subgraph`，不再引入 `Workflow` 作为新的产品术语。
- 现有 `capability` state 类型继续保留，它表达的是能力引用，不是某一种具体执行方式。

目标分类：

```text
Capability
├── Action
├── Tool
└── Subgraph
```

## 术语定义

### Skill

`Skill` 指 Agent 可加载的操作书型能力。它更接近 Superpowers、`planning-with-files`、`ui-ux-pro-max` 或 Claude Skills 的大众认知：包含做事方法、约束、上下文、流程建议和必要的资源引用。

Skill 的主要消费者是 Buddy 主 Agent 或其他通用 Agent。它帮助 Agent 知道怎么做事，但不直接等同于一次图节点执行。

Skill 不应该作为 TooGraph 图协议里所有能力的统称。

### Capability

`Capability` 是 TooGraph 的能力引用上位概念。

它回答的是：

- 当前图或 Buddy 可以调用什么能力？
- 这个能力应该通过哪种执行面运行？
- 下游节点应该把这个引用解释成 Action、Tool 还是 Subgraph？

`Capability` 对应现有 `state_schema` 中的 `capability` state 类型。它的 value 应该是结构化引用。

目标形状：

```json
{
  "kind": "action",
  "key": "web_search"
}
```

```json
{
  "kind": "tool",
  "key": "video_segmenter"
}
```

```json
{
  "kind": "subgraph",
  "key": "long_video_analysis"
}
```

### Action

`Action` 指当前 TooGraph 里被称为 Skill 的节点能力调用事务。

它的典型链路是：

```text
图 state 输入
-> 可选 before_llm.py 补充只读运行上下文
-> LLM 根据 llmInstruction 生成 llmOutputSchema
-> 可选 after_llm.py 执行、校验或规范化
-> runtime 根据 stateOutputSchema 和 outputMapping 写入 state
```

Action 的关键特征：

- 一次调用。
- 可审计。
- 由图节点触发。
- 可以包含 LLM 参数规划。
- 可以包含确定性前处理和后处理。
- 不拥有多轮自治、循环、最终回复生成或流程编排权。

当前代码中的 `skillKey`、`skillBindings`、`skill/official` 和 `skill/user` 都属于这套历史命名。正式迁移时应把产品语义改为 Action，但不需要为了术语立即做大规模文件重命名。

### Tool

`Tool` 指不需要 LLM 参与的确定性处理能力。

适合 Tool 的例子：

- 视频分段。
- 文档切块。
- OCR 预处理。
- 图片压缩或格式转换。
- 音频抽取。
- 结构校验器。

Tool 的输入来自 state 和节点配置，输出写回 state 或 artifact。Tool 不调用 LLM，也不要求 LLM 生成结构化参数。

视频分段应属于 Tool，而不是 Action。它的图位置应该是：

```text
Input(video)
-> Tool(video_segmenter)
-> Batch
-> LLM 节点理解每段
-> LLM 节点汇总
-> Output
```

### Subgraph

`Subgraph` 指可复用的图模板或子图能力。

它适合表达多节点、多步骤、多分支、并行或汇总流程。比如长视频理解不应该是一个 Skill 或 Action，而应该是一个 Subgraph：

```text
输入视频
-> 视频分段 Tool
-> Batch 并行分析片段
-> 汇总 LLM
-> 输出结果
```

动态能力选择时，`capability` state 可以引用 Subgraph：

```json
{
  "kind": "subgraph",
  "key": "long_video_analysis"
}
```

## 节点职责

### LLM 节点

LLM 节点负责一次模型调用。它可以：

- 不使用能力。
- 使用一个 Action。
- 从 `capability` state 接收一个 Action 或 Subgraph 引用。

LLM 节点不应该直接运行 Tool。若需要确定性处理，应把 Tool 放在独立节点中，使处理过程、失败、重试和 artifact 都可见。

### Tool 节点

Tool 节点是未来新增的确定性执行节点。它负责运行 `kind: "tool"` 的能力。

Tool 节点应具备：

- 明确输入 state。
- 明确节点配置。
- 明确输出 state 或 artifact。
- 权限声明和审计记录。
- 失败、超时和依赖缺失的可见错误。

Tool 节点不包含 LLM 参数规划。如果某个任务需要 LLM 决定参数，应先由 LLM 节点产出配置 state，再由 Tool 节点执行。

### Subgraph 节点

Subgraph 节点负责嵌入或动态运行可复用图模板。它是多步流程的承载位置。

不要把长流程塞进 Action 或 Tool 内部。需要多步工具链时，应使用 Subgraph、Batch、Condition 和普通节点边表达。

### Batch 节点

Batch 节点负责把数组输入拆成多个并行或并发 worker 运行，并把输出重新组装成数组。

对于长视频：

1. Tool 节点先把视频切成片段数组。
2. Batch 节点把每个片段交给 worker。
3. worker 可以是默认 LLM 或 Subgraph。
4. 最后由汇总 LLM 消费批量结果。

## 视频处理结论

普通 LLM 节点可以继续支持短视频直接理解，但应该有明确上限，例如 30 秒。

长视频不应该由普通 LLM 节点隐藏处理，也不应该由 Input 节点自动切分。推荐路径是：

```text
Input 节点暴露 source_video
-> Tool 节点执行 video_segmenter
-> 输出 segments
-> Batch 节点逐段分析
-> 汇总 LLM
```

Input 节点可以提供快捷入口，例如“添加视频分段 Tool”，但不应在用户拖入视频时静默产生重型处理副作用。

`video_segmenter` 的输出应尽量简单：只输出切割后的视频片段数组，不抽帧，不判断模型能力，不封装长流程。目标输出形状：

```json
{
  "segments": [
    {
      "index": 0,
      "start_sec": 0,
      "end_sec": 30,
      "local_path": "run/node/video_segmenter/invocation_001/segment_000.mp4",
      "mime_type": "video/mp4"
    }
  ]
}
```

## 迁移策略

这次设计的迁移已经进入 Action/Tool 协议落地阶段。

推荐维护顺序：

1. 文档和 UI 文案中继续保持新术语：Skill、Capability、Action、Tool、Subgraph。
2. 新功能必须使用新术语。视频分段能力按 Tool 设计，不新增 LLM-only Skill 变体。
3. Tool 节点和 Tool manifest 不复用 Action 的 `llmOutputSchema` 作为必需字段。
4. 动态 capability payload 的目标 `kind` 使用 `action`、`tool`、`subgraph`。
5. 旧 `kind: "skill"`、`skillKey`、`skillBindings` 等命名只能通过显式迁移脚本或重建路径处理，不做隐藏修复。
6. 未来 Agent 操作书型 Skill 管理单独设计，不复用 Action 包语义。

## 不做的事

- 不把视频分段放进 Input 节点作为隐藏自动行为。
- 不新增 `Workflow` 术语。
- 不把 Tool 伪装成 LLM 节点挂载的 Action。
- 不让 Action、Tool 或 Skill 内部拥有多步自治循环。

## 当前代码事实

当前实现中：

- `NodeSystemStateType` 已有 `capability`，没有单独的 `subgraph` state 类型。
- 动态 capability 读取使用 `kind: "action"` 和 `kind: "subgraph"`；`tool` 作为独立 Tool 节点运行，不挂载在 LLM 节点上。
- 当前官方节点能力包位于 `action/official`，运行时入口以 `before_llm.py` 和 `after_llm.py` 为主。
- Tool 节点已有独立的 `toolKey`、`tool_input`、`tool_output`、`selected_tools`、`tool_outputs` 和 `tool_invocation` 路径。
- Batch worker source 已有 `default_llm` 和 `subgraph`。

这些是迁移起点，不是目标术语的最终形态。

## 命名表

| 旧或容易混淆的叫法 | 新产品语义 | 说明 |
| --- | --- | --- |
| Skill | Action | 当前节点能力调用事务 |
| Capability | Capability | 上位能力引用 state |
| Processor | Tool | 确定性无 LLM 处理能力 |
| Workflow | Subgraph | 多节点图模板或子图能力 |
| Agent Skill | Skill | Buddy 或 Agent 使用的操作书型能力 |

## 验收标准

- 后续视频处理方案使用 Tool 和 Subgraph 表达，不再把视频分段设计为 LLM Skill。
- 后续 Buddy 能力选择使用 Capability 作为上位引用，不把所有能力统称为 Skill。
- 后续真正的 Skill 管理面向 Agent 操作书，不与当前节点 Action 混用。
- 文档、UI 和运行记录逐步避免“Skill”同时表示操作书、节点能力调用和底层工具。

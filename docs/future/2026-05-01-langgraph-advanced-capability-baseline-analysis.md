# GraphiteUI 四节点系统与 LangGraph 高级能力承接分析

日期：2026-05-01  
状态：产品与架构基线讨论稿  
范围：LangGraph 高级能力、行业应用场景、GraphiteUI 当前四节点系统承接度、后续能力补齐路线

## 0. 结论先行

GraphiteUI 当前的四节点系统已经具备搭建大量固定流程 LangGraph 工作流的基础能力，尤其适合：

- 顺序链路：输入、理解、改写、总结、输出。
- 条件路由：按分类、评分、规则进入不同处理分支。
- 有界循环：生成、评估、不合格则重试，超过次数走兜底。
- 人类在环：在 agent 节点后暂停，人工审查或修改 state 后继续。
- 基础 RAG：输入问题、检索知识库、生成答案、输出。
- 多 agent 固定协作：A 节点分析，B 节点改写，C 节点评审，D 节点生成最终稿。

但它还不能覆盖 LangGraph 的全部高级能力，尤其是：

- 动态 fan-out / fan-in：运行时按数据量创建多个 worker，然后聚合。
- reducer / append-only state：多个并行节点安全写同一 state。
- 隐式 autonomous tool loop：模型在运行时自己决定调用哪些工具、调用多少次。
- `Command` 式状态更新加路由合一、agent handoff、跨图跳转。
- subgraph / reusable graph：把一张图当成可复用节点或技能。
- 生产级 long-running jobs：计划任务、队列、失败重试、监控、通知、持久化恢复。
- 复杂 artifact 管线：视频拆帧、批量网页抓取、长文档切片、引用和证据管理。

这个结论并不否定当前四节点方向。相反，当前方向是正确的：GraphiteUI Editor 应该优先做固定、可见、可复现的流程编排；桌宠 Agent 才承担开放式多轮自主决策、帮用户搭图、边走边画、动态工具调用等能力。问题不是“要不要把 LangGraph 所有能力塞进四个节点”，而是要把高级能力拆成两层：

1. 编辑器工作流层：把高级能力显式化成节点、边、state、skill、subgraph、batch、join、schedule。
2. 桌宠 Agent 层：处理不确定目标、自主规划、动态搜索、调用编辑命令生成或调整图。

换句话说，GraphiteUI 不应该把每个 Agent Node 都做成一个隐藏的 AutoGPT。它应该把大模型的自主性放在能被用户看见和批准的地方：桌宠 Agent 可以自主思考，Editor 里的 graph 应该尽量可审计、可复现、可运行。

## 1. 我们本轮讨论形成的产品边界

### 1.1 GraphiteUI Editor：固定流程工作流构建器

用户明确希望编辑器专门用于制作固定流程任务，例如：

- 每天自动搜索新闻，分析重点，生成摘要或视频脚本。
- 视频分析助手：读取视频、抽帧、识别画面、生成时间线和结论。
- 结构化内容处理：抓网页、清洗正文、提取字段、打标签、输出报告。
- 流程化业务任务：先分类，再分支处理，再评估，再输出。

这类任务的共同点是：流程应该是可见、可复现、可调试的。用户拖拽节点的价值就在于流程本身被显式表达。如果 Agent Node 内部再藏一个多轮工具调用循环，用户虽然只看到一个节点，但真实运行路径已经变成黑盒，这会削弱 GraphiteUI 的核心价值。

因此，Editor 里的 Agent Node 更适合作为“固定工作单元”：

- 有明确 reads 和 writes。
- 有明确 task instruction。
- 有明确绑定的 Agent Node Skill。
- 一次执行中可以包含固定的脚本、检索、转换、模型生成。
- 输出写入明确 state。
- 运行记录能解释该节点读了什么、调用了什么、写了什么。

### 1.2 桌宠 Agent：开放式自主决策与图协作层

用户也明确希望桌宠 Agent 处理需要自主决策、多轮调用、持续对话的能力，例如：

- 和用户日常对话。
- 理解用户想做什么。
- 帮用户规划一张图。
- 在画布上生成节点和连线。
- 根据校验结果、运行失败、用户反馈继续调整图。
- 边走流程边搭建工作流。

这类任务的核心不是固定流程，而是不确定目标下的探索、解释和逐步收敛。因此它更适合使用多轮模型调用、动态工具选择、GraphCommandBus、审批、撤销、审计。

桌宠 Agent 可以拥有通用 Companion Skill，例如：

- 图规划顾问。
- 当前图解释器。
- LangGraph 模式顾问。
- 工作流生成器。
- 网页搜索、资料阅读、方案比较。
- 用户偏好和长期记忆。

但桌宠 Agent 对图的修改不应该直接操作 DOM，而应该通过结构化命令接口，例如既有设想中的 `GraphCommandBus`：

- `createNode`
- `updateNode`
- `connectFlow`
- `connectState`
- `validateGraph`
- `runGraph`
- `saveGraph`

这样才能做到可撤销、可审计、可暂停和可批准。

### 1.3 Skill 的两类应用场景

本轮讨论中，Skill 被拆成两个目标：

| 类型 | 使用者 | 目标 | 运行要求 | 是否可用于 Agent Node |
| --- | --- | --- | --- | --- |
| Agent Node Skill / 编排技能 | Editor 图中的 agent 节点 | 固定流程执行 | 强 schema、明确输入输出、可校验、可记录、可健康检查 | 是 |
| Companion Skill / 桌宠技能 | 全局桌宠 Agent | 通用能力、认知框架、工作台协作 | 可是说明书、工具、资料包、画像、策略 | 默认否 |

统一产品名仍然可以叫 Skill，但 runtime truth source 应区分：

- `skill.json`：GraphiteUI 原生 manifest，机器可读、可校验、可执行，是 Agent Node Skill 的运行时真相源。
- `SKILL.md`：给模型、人类和外部生态看的说明书，适合 Companion Skill，也适合保留作为 Agent Node Skill 的说明、示例、导入辅助和 manifest 再生成依据。

一个通用 Skill 导入后，应该默认进入 Companion 可用或待审核状态，而不是自动暴露给 Agent Node。只有补齐 manifest、输入输出、权限、运行入口、健康检查，并通过用户确认后，才允许被 Agent Node 绑定。

LLM 可以帮助判断“当前 Skill 是否适合加入 Agent Node”，并自动生成 manifest 草案，但这个草案应当只是 draft：

- 用户要能看到 LLM 推断出的 inputs、outputs、permissions、runtime。
- 系统要做 schema 校验和 health check。
- 未通过前只能作为 Companion Skill 或禁用态存在。

## 2. 当前 GraphiteUI 四节点实现基线

### 2.1 四节点语义

当前 `node_system` 中已经形成四类节点：

- `input`：外部输入边界，把值注入 graph state。
- `agent`：唯一真实业务执行节点，读取 state，调用 skill 和模型，写入 state。
- `condition`：条件路由的可视化代理，编译为 LangGraph conditional edge。
- `output`：结果展示和持久化边界，读取 state 生成 preview 或保存结果。

这与 `docs/future/2026-04-22-agent-only-langgraph-runtime.md` 中的目标语义一致：LangGraph runtime 只注册 agent 节点，input/output/condition 不作为真实 LangGraph node 运行。

### 2.2 当前 state 与控制能力

当前 state 类型已经覆盖不少工作流基础材料：

- 文本类：`text`、`markdown`、`json`
- 结构化类：`number`、`boolean`、`object`、`array`
- 文件与媒体类：`file_list`、`file`、`image`、`audio`、`video`
- 知识库类：`knowledge_base`

当前 condition 支持：

- `==`
- `!=`
- `>=`
- `<=`
- `>`
- `<`
- `contains`
- `not_contains`
- `exists`

当前 condition 还有 `loopLimit`，默认 5，上限 10。这已经可以承载“生成-评估-重试-兜底”这类有界循环。

### 2.3 当前 LangGraph 编译方式

当前编译器做了一个重要选择：

- 只有 agent 节点进入 `runtime_nodes`。
- `input -> agent` 编译为 runtime entry。
- `agent -> agent` 编译为普通 runtime edge。
- `agent -> condition -> agent/output` 编译为 conditional route。
- `output` 在运行结束后收集结果。
- condition 不能作为 condition branch target。
- 当前只支持 `replace` 写模式。
- 多个无序 writer 到同一个 reader 会被视为不明确。

这说明当前系统已经是“固定编排图”的形态，而不是“模型自由探索的 agent loop”形态。

### 2.4 当前 Agent Node Skill 行为

当前 agent 节点执行逻辑大致是：

1. 读取输入 state。
2. 对节点配置中绑定的所有 skills 逐个执行。
3. 把 skill outputs 放进 `skill_context`。
4. 调用一次模型生成。
5. 把模型 payload 写入节点绑定的 output state。

这意味着当前 skill 更像“模型调用前的固定上下文和工具结果”，不是 OpenAI/Claude/LangChain 常见的“模型选择工具、工具返回、模型再选择、直到停止”的多轮工具循环。

这正好对应本轮讨论中的产品边界：

- Editor 的 Agent Node：保持固定、可审计。
- Companion Agent：再做动态 tool loop。

如果未来确实要在 Editor 内支持动态 tool loop，也应该设计成显式的特殊节点或 subgraph，例如 `AgentLoop Node`，并且要展示内部 tool call timeline、最大步数、预算、失败策略，而不是把所有普通 Agent Node 都变成黑盒。

## 3. LangGraph 高级能力地图

以下资料来自 LangGraph 官方文档、LangChain 博客与案例资料。核心参考包括：

- LangGraph Workflows and Agents：`https://docs.langchain.com/oss/python/langgraph/workflows-agents`
- LangGraph Graph API：`https://docs.langchain.com/oss/python/langgraph/graph-api`
- LangGraph Persistence：`https://docs.langchain.com/oss/python/langgraph/persistence`
- LangGraph Memory：`https://docs.langchain.com/oss/python/concepts/memory`
- LangGraph Interrupts / Human-in-the-loop：`https://docs.langchain.com/oss/python/langgraph/interrupts`
- LangGraph Subgraphs：`https://docs.langchain.com/oss/python/langgraph/use-subgraphs`
- LangGraph Streaming：`https://docs.langchain.com/oss/python/langgraph/streaming`
- LangChain Multi-agent patterns：`https://docs.langchain.com/oss/python/langchain/multi-agent`
- LangChain Multi-agent handoffs：`https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs`
- LangGraph case studies：`https://docs.langchain.com/oss/python/langgraph/case-studies`
- LangChain blog case studies and examples：`https://blog.langchain.com/`

### 3.1 Prompt Chaining：提示链与固定步骤管线

LangGraph 场景：

Prompt chaining 是最基础的 workflow 模式。一个 LLM 调用的输出成为下一个 LLM 调用的输入，中间可以插入解析、校验、改写、结构化转换。

典型案例：

- 新闻摘要：搜索结果 -> 清洗正文 -> 摘要 -> 观点分类 -> 输出日报。
- 视频脚本：主题 -> 大纲 -> 分镜 -> 旁白 -> 标题和标签。
- 文档处理：上传文档 -> 提取要点 -> 改写为邮件 -> 输出。
- 代码说明：提交 diff -> 风险分析 -> changelog -> PR 摘要。
- 内容运营：产品信息 -> 小红书文案 -> 短视频口播 -> 发布清单。

当前 GraphiteUI 能否做到：

可以。当前四节点非常适合这种固定线性链路：

```text
input -> agent_extract -> agent_rewrite -> agent_review -> output
```

一个 agent 读取上游 state，写入下游 state，后续 agent 再读取它。只要每一步输出明确，当前系统可以直接承载。

不足：

- 缺少更丰富的结构化输出 schema 绑定体验。
- 缺少节点级 prompt 模板版本管理。
- 缺少将一组常用链路封装为 reusable subgraph 或 workflow skill 的能力。
- 当前 skill 执行结果主要作为模型上下文，不是独立 action 节点或可直接写 state 的固定转换节点。

建议补充：

- Agent Node 输出 schema 可视化配置。
- Workflow Skill：把常用链路封装为可复用技能。
- State transform / Action Skill：无需模型的稳定转换步骤，例如 JSON 字段提取、Markdown 格式化、文件保存。

### 3.2 Routing：分类路由与条件分支

LangGraph 场景：

Routing 是根据输入或中间结果选择下一条路径。官方 workflow 文档把 routing 作为常见 workflow 模式之一。它可以通过条件边选择下一个节点，也可以由模型做分类后写入路由字段。

典型案例：

- 客服工单分流：退款、物流、技术支持、投诉分别进入不同处理节点。
- 新闻分类：财经、科技、社会、国际分别走不同摘要模板。
- 视频分析：如果视频含人物访谈，走访谈摘要；如果是屏幕录制，走操作步骤提取。
- 文档审核：如果风险等级高，进入人工审核；低风险直接输出。
- 代码审查：如果 diff 涉及数据库迁移，进入迁移风险检查；否则走普通 review。

当前 GraphiteUI 能否做到：

可以，适合做显式 routing。实现方式是：

```text
input -> agent_classify -> condition_route -> agent_finance
                                      -> agent_tech
                                      -> agent_other
```

当前 condition 支持多种比较和 contains/exists，也支持分支映射，因此可以把模型输出的分类字段映射到不同路径。

不足：

- condition 节点规则偏基础，缺少组合条件，例如 `and/or/not`、多字段条件、正则、表达式。
- condition 目前更像简单 rule，复杂 routing 往往仍需要 agent 先生成一个明确 route key。
- branch target 不能是另一个 condition，复杂条件树需要绕一层 agent 或改图结构。

建议补充：

- Condition Rule Builder：支持多条件组合。
- Route Key 输出约束：让分类 agent 必须写入枚举值。
- 条件调试面板：显示 rule source、实际值、命中分支、循环计数。
- 可选增加 `Switch` 或增强 condition，但仍保持四节点心智也可以。

### 3.3 Parallelization：并行执行、fan-out/fan-in 与 map-reduce

LangGraph 场景：

Parallelization 是 LangGraph 很重要的高级能力。多个节点可以在同一 superstep 中并行运行，结果通过 state 合并。Graph API 中的 reducer 用来定义多个节点写同一个 state 时如何合并，例如列表追加。`Send` 可用于运行时根据数据动态分发多个 worker。

典型案例：

- 新闻日报：对 50 篇文章并行摘要，再聚合为日报。
- 市场研究：同时分析竞争对手 A/B/C/D，再合并为对比报告。
- 视频分析：抽取 100 帧，分批并行视觉理解，再聚合为时间线。
- 合同审查：不同 agent 并行检查付款条款、违约责任、保密条款、管辖条款。
- 多模型投票：让多个模型或多个提示并行生成答案，再由评审节点选择。
- 数据提取：对大量网页或 PDF 页并行抽取字段，再合并为表格。

当前 GraphiteUI 能否做到：

部分可以，但不完整。

如果是静态并行，用户可以画多个 agent 从同一个输入出发，再汇入后续 agent。但当前系统对“多个无序 writer 写入同一 state 后被读取”会判为不明确，而且 state 写模式只有 `replace`。这说明当前系统不适合真正的 fan-in 聚合。

当前缺口：

- 没有 reducer，例如 append、merge dict、sum、max、dedupe。
- 没有 Join / Barrier 节点表达“等所有分支完成后再继续”。
- 没有 dynamic fan-out，也就是运行时按数组长度创建 worker。
- 没有 map worker 的 per-item state 隔离。
- 没有并行任务进度 UI。

建议补充：

1. 扩展 state write mode：
   - `replace`
   - `append`
   - `extend`
   - `merge`
   - `accumulate`
2. 为 state schema 增加 reducer 配置：
   - array 默认 append/extend。
   - object 默认 merge。
   - number 可选 sum/max/min。
3. 增加 Batch/Map 能力：
   - 可以作为 Control Skill。
   - 也可以作为一个显式 Batch Node，但如果坚持四节点，推荐先做 Workflow Skill 或 Agent Node 内的固定 batch step，并把内部步骤写入 run detail。
4. 增加 Join 语义：
   - 可以是 condition 的特殊分支，也可以是 runtime plan 的 join boundary。
   - UI 上要能解释“等待这些上游节点全部完成”。

产品判断：

这是 Editor 层应该补的能力，因为 batch/map/join 仍然是固定流程，不是自主决策。它对新闻日报、视频分析、文档批处理非常关键。

### 3.4 Orchestrator-Worker：运行时分解任务与动态 worker

LangGraph 场景：

Orchestrator-worker 模式中，一个 orchestrator 根据输入决定需要多少 worker、每个 worker 做什么。官方 workflow 文档把它作为常见复杂 workflow。它常和 `Send` 动态分发结合使用。

典型案例：

- 深度研究报告：先规划研究章节，再为每章启动 worker 搜索资料，最后合并报告。
- 法律尽调：先识别合同类型和关键条款，再为每类风险分配审查 worker。
- 代码迁移：先扫描项目模块，再为每个模块分配迁移建议 worker。
- 视频长片分析：先拆成片段，再对每段启动分析 worker。
- 数据分析：先由规划器决定要跑哪些统计，再并行执行。

当前 GraphiteUI 能否做到：

不建议用当前普通 Agent Node 隐式实现。

原因是 orchestrator-worker 的 worker 数量和任务内容是在运行时生成的。如果把它塞进一个 Agent Node 内部，用户画布上只看到一个节点，却无法看到 orchestrator 创建了多少 worker、每个 worker 做了什么、哪些失败、如何聚合。

当前可以做的是静态近似：

```text
input -> agent_plan
agent_plan -> agent_worker_a
agent_plan -> agent_worker_b
agent_plan -> agent_worker_c
agent_worker_a/b/c -> agent_merge
```

但这只能处理 worker 数量固定的情况。

建议补充：

- 对 Editor：增加显式 Batch/Map/Subgraph 能力，让“动态 worker”以可见的 map run detail 呈现。
- 对 Companion：允许桌宠 Agent 根据用户目标动态规划图，但最终应把 worker 结构转成可见 graph 或 subgraph，而不是藏在对话内部。
- 对 runtime：引入 LangGraph `Send` 等价能力或封装层，支持按数组 state 动态 fan-out。
- 对 UI：Run Detail 中展示每个 worker item 的输入、输出、耗时、错误、重试。

产品判断：

orchestrator-worker 横跨两个世界：

- 如果目标是“临时探索、边搜边想”，放桌宠 Agent。
- 如果目标是“固定批处理生产流程”，放 Editor，但必须显式化为 batch/map/subgraph。

### 3.5 Evaluator-Optimizer：评估、重试与质量门

LangGraph 场景：

Evaluator-optimizer 是生成器和评估器循环。生成器产出结果，评估器打分或给反馈，如果不达标则回到生成器优化，直到合格或达到上限。

典型案例：

- 文案生成：生成营销文案，评估是否符合品牌语气，不合格重写。
- 代码生成：生成实现，运行测试或静态检查，不合格修复。
- 新闻摘要：生成摘要，评估是否覆盖所有要点，不合格补充。
- 视频脚本：生成脚本，评估节奏和时长，不合格压缩。
- 结构化抽取：抽取 JSON，校验 schema，不合格重新抽取。

当前 GraphiteUI 能否做到：

可以做基础版本，而且是当前四节点很适合的模式：

```text
input -> agent_generate -> agent_evaluate -> condition_pass
                                  true -> output
                                  false -> agent_generate
                                  exhausted -> agent_fallback
```

当前 condition 的 `loopLimit` 可以避免无限循环。

不足：

- 评估结果最好是结构化 schema，例如 `{ "passed": true, "score": 0.86, "feedback": "..." }`，当前 UI 对结构化输出约束还不够强。
- 如果评估器需要调用测试脚本、schema validator、外部工具，当前 skill/action 体系还不够明确。
- 循环 run detail 需要更强展示：第几轮、每轮反馈、每轮修改点、最终为何停止。

建议补充：

- 结构化评估模板。
- Validator Skill：JSON schema、regex、测试命令、网页可达性、文件存在性等。
- 循环可视化：展示 loop counter、历史输出、diff。
- 失败策略：超过上限后可以输出最佳版本、请求人工、保存错误报告。

产品判断：

这是 Editor 核心能力，应继续加强。它不违背 LangGraph 图思想，因为循环和分支是显式的。

### 3.6 Agent Tool Loop：模型自主选择工具并多轮调用

LangGraph 场景：

Agent loop 通常是：模型看到目标和已有消息，决定是否调用工具；工具返回结果；模型再决定下一步，直到输出最终答案。LangGraph 可以用循环和条件边显式表示这个过程，也可以用预构建 agent 模式。

典型案例：

- 通用研究助手：搜索网页、打开链接、摘录、再搜索、整合答案。
- 个人助理：查日程、发邮件、写提醒、更新任务。
- 数据分析 Agent：查看表结构、运行查询、解释结果、继续追问。
- 编程 Agent：读文件、改代码、运行测试、修复失败。
- 桌宠 Agent：读当前图、建议节点、调用 GraphCommandBus、运行校验、继续调整。

当前 GraphiteUI 能否做到：

普通 Editor Agent Node 不应该默认做到。

原因：

- 用户希望 Editor 用于固定流程任务。
- 当前 Agent Node 是一次 skill 预执行加一次模型生成，不是动态 tool loop。
- 如果每个节点都可以自由多轮调用工具，流程图会失去可复现性和可解释性。

但这类能力应该在桌宠 Agent 中实现。

如果未来要在 Editor 中提供，也建议作为特殊能力：

```text
AgentLoop Node / Autonomous Subgraph
  maxSteps: 10
  allowedTools: [...]
  budget: ...
  stopCondition: ...
  approvalPolicy: ...
```

并且必须展示：

- 每一轮模型想法摘要。
- 工具名称。
- 工具输入输出。
- 失败与重试。
- 最终停止原因。

建议补充：

- 桌宠 Agent Tool Runtime。
- Companion Skill Loadout。
- GraphCommandBus。
- 工具调用审计和权限确认。
- 如果进入 Editor，必须以显式 AgentLoop 或 subgraph 形式出现。

产品判断：

这是本轮讨论中最重要的边界：动态 tool loop 属于桌宠 Agent 的默认能力，不属于普通 Agent Node 的默认能力。

### 3.7 Human-in-the-loop：人工审批、状态修改与恢复

LangGraph 场景：

LangGraph 支持 interrupt、checkpoint、resume 等能力，适合在关键节点暂停，让人审查、批准、修改 state 或提供额外输入。

典型案例：

- 合同审查：高风险条款进入人工确认。
- 客服回复：自动草拟回复，人工批准后发送。
- 内容发布：生成视频脚本和标题，人工确认后进入发布。
- 财务报告：生成分析报告，人工确认数据口径。
- 工作流搭建：桌宠 Agent 准备修改图，用户批准后执行。

当前 GraphiteUI 能否做到：

部分可以。当前架构已经有 agent-only runtime、checkpoint/resume、人类审查面板相关设计和实现基础。四节点语义中，断点挂在 agent 后最自然：用户审查的是 agent 刚写出的 state，而不是 output 节点是否执行。

不足：

- 需要更完整的审查 UX：哪些 state 可编辑、编辑后影响哪些下游节点、resume 后从哪里继续。
- 需要审批策略：每次、仅高风险、仅外部调用前、仅写文件前。
- 需要操作审计：谁批准、改了什么、原值是什么、新值是什么。
- 需要工具调用前审批，尤其是联网、写文件、发送消息、修改图。

建议补充：

- Human Review 面板强化。
- State diff 与修改记录。
- Approval Policy。
- Run timeline 中区分 agent output、human edit、resume。
- 桌宠 GraphCommandBus 的命令级确认。

产品判断：

这是 GraphiteUI 的强项方向，应继续作为固定 workflow 和桌宠 Agent 的共同基础能力。

### 3.8 Persistence、Checkpoint 与 Long-running Workflow

LangGraph 场景：

Persistence 是 LangGraph 的关键能力之一。它允许保存 graph state、恢复执行、支持 long-running agent、支持人工中断、支持失败恢复。

典型案例：

- 每日新闻任务：每天定时运行，失败后可恢复或重试。
- 长文档处理：处理几百页 PDF，中间失败后从已完成页继续。
- 视频分析：长视频拆帧后分批执行，过程可能持续很久。
- 客服流程：等待用户回复或人工审批后继续。
- 研究报告：先搜索资料，等待用户确认提纲，再继续写作。

当前 GraphiteUI 能否做到：

部分可以。当前后端已经围绕 LangGraph runtime、run detail、checkpoint/resume 做了基础建设。但生产级 long-running workflow 还需要更多系统能力。

当前缺口：

- 没有完整计划任务/触发器系统。
- 没有持久任务队列和 worker 管理。
- 没有失败重试策略、超时策略、幂等策略。
- 没有运行历史搜索、归档、告警。
- 没有 deployment/profile，例如本地运行、后台运行、服务器运行。

建议补充：

- Scheduler Trigger：cron、interval、manual、webhook、file watcher。
- Job Queue：pending/running/succeeded/failed/canceled。
- Retry Policy：节点级和 graph 级。
- Resume UI：显示等待什么、可以如何继续。
- Run Retention：历史运行保留策略、artifact 清理策略。
- Notification Skill：完成后通知桌面、邮件、Webhook。

产品判断：

这是把 GraphiteUI 从“编辑器 demo”变成“自动化工作台”的关键能力。每日新闻和视频分析助手都依赖它。

### 3.9 Memory：短期/长期记忆与个性化

LangGraph 场景：

Memory 通常分为 thread-level memory 和 long-term memory。前者服务一次对话或一次任务，后者服务跨会话的偏好、事实、历史经验。

典型案例：

- 桌宠记住用户喜欢的工作流风格。
- 研究助手记住常用资料来源和排除来源。
- 客服 Agent 记住客户历史问题。
- 工作流生成器记住用户常用节点命名、输出格式。
- 个人助理记住长期偏好和日程规则。

当前 GraphiteUI 能否做到：

对 Editor 固定 workflow 来说，长期记忆不应该是默认能力。固定 workflow 更需要显式输入、显式 state 和可复现结果。否则同一张图今天和明天因为隐式记忆不同而结果不可解释。

对桌宠 Agent 来说，长期记忆是重要能力。

当前缺口：

- 记忆范围：workspace、project、user、graph。
- 记忆权限：哪些 skill 可以读写记忆。
- 记忆审计：写入了什么，为什么写入，如何删除。
- 记忆注入策略：什么时候注入，注入多少。
- 隐私保护：本地存储、加密、导出、清空。

建议补充：

- Companion Memory Store。
- Memory Skill：读、写、检索、遗忘。
- 显式 memory consent。
- Editor Graph 默认禁用隐式长期记忆；如需使用，必须通过输入 state 或明确 Skill 引用。

产品判断：

Memory 的主场是桌宠 Agent，不是固定工作流。Editor 可以支持“记忆作为显式输入源”，但不应默默影响 graph 运行。

### 3.10 Subgraphs：可复用子图与 Workflow Skill

LangGraph 场景：

Subgraph 允许把一组节点封装成可复用组件，父图调用子图。它适合复杂系统拆分、复用流程、隔离状态。

典型案例：

- 视频理解子图：抽帧 -> 视觉分析 -> 时间线 -> 汇总。
- 网页研究子图：搜索 -> 抓取 -> 清洗 -> 摘要 -> 引用。
- 合同审查子图：条款识别 -> 风险分类 -> 修改建议。
- 数据提取子图：读取文件 -> OCR -> JSON schema 提取 -> 校验。
- 质量评估子图：评分 -> 反馈 -> 是否通过。

当前 GraphiteUI 能否做到：

基本不能作为一等能力做到。当前可以手动画重复节点，但不能把一张图封装成一个可版本化、可引用、可配置的子图。

建议补充：

- Workflow Skill：把 graph 或 graph fragment 打包为 skill。
- Subgraph Manifest：
  - 输入 state schema。
  - 输出 state schema。
  - 内部节点版本。
  - 依赖 skills。
  - 权限。
  - 配置项。
- 子图运行详情：
  - 父图中显示一个节点。
  - Run Detail 中可展开内部节点。
- 版本管理：
  - 当前图绑定 subgraph v1.2.0。
  - 升级到 v1.3.0 前可比较差异。

产品判断：

Subgraph 是 GraphiteUI 未来规模化的核心。它与前面讨论的 Workflow Skill 是同一个方向：把复杂能力从“复制一堆节点”变成“可安装、可引用、可审计的流程能力”。

### 3.11 Command：状态更新与路由合一

LangGraph 场景：

Graph API 中 `Command` 可让节点同时更新 state 并决定下一步去哪里。它也常用于 agent handoff、子图跳转等场景。

典型案例：

- Supervisor Agent 判断下一个 specialist，并把任务交给它。
- 一个节点完成分析后，根据结果直接返回目标节点。
- 多 agent handoff：销售、支持、技术三类 agent 之间移交。
- 子图内节点决定返回父图或继续内部处理。
- 工具执行后直接跳转到错误处理或成功路径。

当前 GraphiteUI 能否做到：

部分可通过 agent 写 state + condition 路由实现：

```text
agent_decide writes route_key
agent_decide -> condition_route -> target_agent
```

这比 `Command` 多一个显式 condition，但更符合可视化编辑器心智：状态写入和路由判断可见。

当前缺口：

- 对动态 handoff 不友好。
- condition 规则能力有限。
- 如果路由目标由运行时生成，当前静态图无法表达。

建议补充：

- 保留显式 condition 作为默认。
- 对高级用户提供 `Command-like` Agent Output：节点输出中声明 `next_route`，condition 自动读取。
- 对多 agent handoff，优先做成显式 supervisor graph 或桌宠 Agent 能力。
- 如果引入真正 `Command`，UI 必须能展示“该节点同时写了哪些 state、选择了哪个 next node”。

产品判断：

当前系统不必急着直接暴露 Command。显式 condition 更适合低门槛可视化。Command 可以作为高级编译优化或高级节点能力。

### 3.12 Streaming 与 Observability：流式输出、事件时间线与可审计运行

LangGraph 场景：

Streaming 允许实时返回 token、节点更新、工具事件、自定义事件。Observability 则包括 trace、state diff、路径、耗时、错误、artifact。

典型案例：

- 用户看见报告逐步生成，而不是等待结束。
- 视频分析显示当前处理到哪一帧。
- 批量网页抓取显示成功/失败数量。
- 人类审查前查看每一步中间结果。
- 调试复杂 graph 时定位哪个节点慢、哪个 state 被覆盖。

当前 GraphiteUI 能否做到：

部分可以。当前 agent response 已有 streaming delta 相关逻辑，run detail 也记录节点执行。但高级 observability 还不完整。

当前缺口：

- Skill 内部步骤不够可见。
- 动态 batch worker 没有 timeline。
- state diff 不够完整。
- artifact 与节点/skill/worker 的关联需要强化。
- 成本、token、耗时、模型配置追踪需要系统化。

建议补充：

- Run Timeline：
  - node started/completed/failed。
  - skill started/completed/failed。
  - model stream。
  - human edit。
  - branch selected。
  - worker item progress。
- State Diff Viewer。
- Artifact Panel。
- Cost/Token Summary。
- 可导出的 run report。

产品判断：

Observability 是 GraphiteUI 相比纯代码 LangGraph 的产品价值之一，应作为核心能力投入。

### 3.13 Multi-agent Supervisor 与 Handoff

LangGraph 场景：

Multi-agent 系统常见模式包括 supervisor、handoff、specialist agents、team graph。一个 supervisor 决定由哪个 agent 处理，specialist 完成后返回 supervisor 或移交给其他 agent。

典型案例：

- 客服：分流到退款 agent、物流 agent、技术 agent。
- 企业知识助手：HR、财务、法务、IT 多专家。
- 研究团队：检索 agent、阅读 agent、写作 agent、审稿 agent。
- 数据分析：SQL agent、图表 agent、解释 agent。
- 工作流搭建：桌宠作为 supervisor，调用图解释、图编辑、校验、运行等工具。

当前 GraphiteUI 能否做到：

对固定 supervisor graph，可以部分做到：

```text
input -> agent_supervisor -> condition_route -> agent_refund
                                      -> agent_shipping
                                      -> agent_tech
agent_refund/shipping/tech -> agent_merge -> output
```

对动态 handoff，不建议放在当前普通 Editor Agent Node 中。

当前缺口：

- 没有 agent-to-agent message protocol。
- 没有 handoff command。
- 没有 specialist registry。
- 没有跨 agent 共享 scratchpad 的治理。
- 没有动态团队规模。

建议补充：

- Editor 中支持固定多 agent graph。
- 桌宠中支持动态 supervisor/tool loop。
- 若做高级 multi-agent workflow，封装为 subgraph，并展示每个 agent 的发言、handoff、状态更新。

产品判断：

固定多 agent 可以是 Editor 的强项。动态 supervisor 更适合 Companion。

### 3.14 Retrieval、RAG 与知识工作流

LangGraph 场景：

RAG 通常包括查询改写、检索、重排、引用、答案生成、答案校验。更复杂的 RAG 会多轮检索或按子问题检索。

典型案例：

- 企业知识库问答。
- 产品文档助手。
- 法律条款检索和解释。
- 学术论文阅读助手。
- 会议纪要与历史决策检索。
- 新闻资料库检索后生成专题报告。

当前 GraphiteUI 能否做到：

基础 RAG 可以。当前 state 支持 `knowledge_base`，validator 对知识库 skill 有专门约束：agent 最多读一个 knowledge base，并需要绑定 `search_knowledge_base`，同时需要文本类 query 输入。

不足：

- 只能表达相对简单的单次检索。
- 缺少 query rewrite、multi-query、rerank、citation、source filtering 等 RAG 组件。
- 缺少知识库导入、分片、索引状态、引用可视化等完整产品能力。
- 对多知识源联合检索支持不够。

建议补充：

- RAG Skill 套件：
  - query rewrite。
  - retrieve。
  - rerank。
  - cite answer。
  - answer faithfulness check。
- Knowledge Source Selector。
- Citation Artifact。
- 检索调试：query、top-k、score、命中文档、引用片段。

产品判断：

RAG 是 Editor 固定工作流和桌宠 Agent 都会用到的基础能力，但在 Editor 中应显式绑定知识库和检索策略，避免隐式知识源污染结果。

### 3.15 Time Travel、Debugging 与回放

LangGraph 场景：

有 checkpoint 后，可以回放、查看状态历史、从某个点恢复。对于复杂 agent 系统，这是调试和审计的关键。

典型案例：

- 新闻日报某天结果异常，回看是哪篇文章导致偏差。
- 视频分析某个片段误判，回放该 worker 的输入帧和模型输出。
- 文档抽取 JSON 错误，回到抽取节点重新运行。
- 客服自动回复不合适，回看检索证据和评分。
- 桌宠改图出错，回滚某几条 GraphCommandBus 操作。

当前 GraphiteUI 能否做到：

部分可以。已有 run detail 和 checkpoint/resume 基础，但还没有完整“时间旅行式”的用户体验。

建议补充：

- Node-level rerun。
- Run fork：从某个 checkpoint 复制一次新运行。
- State history viewer。
- Graph edit history。
- Companion command history 与 undo/redo。

产品判断：

这是高级但非常重要的能力。它能让 GraphiteUI 从“能跑”升级到“能调试、能审计、能长期维护”。

## 4. 具体应用案例矩阵

### 4.1 每日自动新闻分析与摘要

目标流程：

```text
schedule trigger
-> search news
-> fetch articles
-> dedupe
-> batch summarize each article
-> classify topics
-> rank importance
-> generate daily report
-> optionally generate video script
-> output / notify
```

LangGraph 高级能力：

- 计划任务。
- Web search/fetch tools。
- Batch/map。
- Reducer 聚合。
- Routing 分类。
- Evaluator 检查摘要质量。
- Persistence 和失败重试。
- Artifact 和引用。

当前能否做到：

部分能。可以手动画“输入关键词 -> agent 分析 -> output”这种简化版，也可以手动把若干固定来源写进输入。但完整“每日自动搜索新闻”还做不到。

缺少能力：

- Scheduler。
- Web search/fetch Agent Node Skill。
- 网页正文抽取 Skill。
- 去重 Skill。
- Batch/map/reducer。
- 引用来源 artifact。
- 通知或保存日报。

推荐落地方式：

1. P1 先做固定来源新闻分析：用户输入 URL 列表或搜索结果 JSON。
2. P2 增加 `web_fetch`、`extract_article`、`dedupe_articles`。
3. P3 增加 batch summarize 和 reducer。
4. P4 增加 schedule trigger 和 notification。

适合放在哪：

- 固定日报流程放 Editor。
- 临时探索“今天帮我看看某个行业有什么新闻”放桌宠 Agent。

### 4.2 视频分析助手

目标流程：

```text
input video + question
-> sample frames
-> batch vision analysis
-> merge timeline
-> answer question
-> optional human review
-> output report
```

LangGraph 高级能力：

- 文件与媒体 state。
- 外部脚本或本地工具，例如 ffmpeg。
- Batch/map。
- Vision model。
- Artifact 管理。
- Long-running job。
- 人类审查。

当前能否做到：

部分能。state 类型已经有 `video`、`image`、`file`，但完整视频分析需要实际媒体处理 skill 和 artifact 管线。

缺少能力：

- `sample_video_frames` Skill。
- Frame artifacts 存储和预览。
- 对 frames 的 batch vision worker。
- 时间线聚合 reducer。
- 长任务进度 UI。
- 大文件路径、缓存、清理策略。

推荐落地方式：

- 把视频理解做成 Workflow Skill：

```text
video_understanding/
  skill.json
  SKILL.md
  workflow.json
  scripts/sample_frames.py
  scripts/merge_timeline.py
```

Agent Node 只绑定 `video_understanding`，但 Run Detail 可以展开它内部步骤。这样对用户是一个简洁能力，对系统仍然可审计。

适合放在哪：

- 固定视频分析流程放 Editor。
- 用户随口问“这个视频哪里最精彩”也可以由桌宠 Agent 启动一个临时分析，但最好最终生成可见 workflow 或一次性 job。

### 4.3 客服工单自动处理

目标流程：

```text
input ticket
-> classify intent
-> route by intent
-> retrieve policy
-> draft response
-> risk check
-> human approval if needed
-> output response
```

LangGraph 高级能力：

- Routing。
- RAG。
- Human-in-the-loop。
- Evaluator。
- Memory 或客户历史。
- Tool/action，例如创建退款、查询订单。

当前能否做到：

基础版可以。分类、路由、知识库检索、生成回复、人工审查都能用四节点表达。

缺少能力：

- 外部业务系统 Adapter Skill，例如订单查询、退款创建。
- 工具调用审批。
- 客户历史 memory。
- 高风险自动转人工策略。
- 发送消息前审批和审计。

适合放在哪：

- 固定客服流程放 Editor。
- 处理非结构化复杂对话、持续追问用户、跨多个系统查证，则更适合桌宠或专门业务 Agent，但必须有权限和审计。

### 4.4 深度研究报告生成

目标流程：

```text
input topic
-> plan sections
-> search per section
-> read sources
-> summarize evidence
-> synthesize report
-> cite sources
-> review gaps
-> output report
```

LangGraph 高级能力：

- Orchestrator-worker。
- Dynamic fan-out。
- Web search。
- RAG。
- Citation artifacts。
- Evaluator-optimizer。

当前能否做到：

简化版可以，完整动态研究 agent 不适合当前 Editor 普通节点。

原因：

- 研究过程中需要根据已有发现继续搜索。
- section 数量和资料数量运行时才知道。
- 需要多轮工具调用和动态 worker。

推荐拆分：

- 桌宠 Agent：适合做开放式探索和资料收集。
- Editor：适合把稳定研究流程固化，例如“给定 URL 列表 -> 摘要 -> 汇总报告 -> 评审”。
- 高级版 Editor：引入 dynamic batch/map 和 citation 后，可承载标准化研究 pipeline。

缺少能力：

- Web search/fetch。
- Dynamic map。
- Citation 管理。
- Research source store。
- 允许桌宠把探索结果转成固定图。

### 4.5 文档/合同审查

目标流程：

```text
input contract
-> split sections
-> classify clauses
-> parallel risk review
-> aggregate findings
-> legal style rewrite suggestions
-> human review
-> output risk report
```

LangGraph 高级能力：

- Document parsing。
- Batch/map。
- Parallel specialist agents。
- RAG policy lookup。
- Human-in-the-loop。
- Structured output。

当前能否做到：

部分能。小文档和固定几个 specialist 可手动画出来；长文档批处理和并行 clause review 还缺 batch/reducer。

缺少能力：

- 文件解析 Skill。
- 文档切片 Skill。
- clause-level map。
- 风险 findings reducer。
- 引用原文位置。
- 人工审查和修改建议 diff。

适合放在哪：

- 标准合同审查流程放 Editor。
- 临时法律咨询或多轮追问放桌宠，但要明确非法律意见和数据权限。

### 4.6 数据分析与报表生成

目标流程：

```text
input dataset/question
-> inspect schema
-> plan analysis
-> run transformations
-> generate charts/tables
-> explain findings
-> validate numbers
-> output report
```

LangGraph 高级能力：

- Tool loop 或固定 action steps。
- 外部脚本执行。
- Artifact，例如 CSV、chart、notebook。
- Evaluator。
- Human review。

当前能否做到：

当前固定叙述型分析可以，真正的数据计算流程还不够。因为 Agent Node 当前没有成熟的脚本/action runtime 来稳定执行 Python/SQL 并把 artifacts 写回 state。

缺少能力：

- Python/SQL Adapter Skill。
- Dataset state 和 artifact store。
- Chart generation Skill。
- Sandbox 和权限。
- 数字校验 Skill。

适合放在哪：

- 固定报表流水线放 Editor。
- 探索式数据分析放桌宠 Agent 或特殊 AgentLoop/Subgraph。

### 4.7 编程 Agent / 代码修复

目标流程：

```text
read issue
-> inspect files
-> edit files
-> run tests
-> fix failures
-> summarize diff
```

LangGraph 高级能力：

- Autonomous tool loop。
- File system tools。
- Shell tools。
- Test feedback loop。
- Checkpoint and rollback。

当前能否做到：

不适合当前 Editor 普通四节点系统。编程 Agent 本质上是开放式探索和修复，需要动态读文件、改文件、运行命令、看失败、再修。

推荐定位：

- 放桌宠 Agent 或独立 Coding Agent runtime。
- 如果 Editor 要承接，只能承接固定 CI 分析流程，例如“输入日志 -> 提取错误 -> 生成修复建议”，不直接自动改代码。

缺少能力：

- 安全文件权限。
- Shell sandbox。
- Patch 审批。
- 测试运行和回滚。
- 多轮 tool loop。

### 4.8 工作流自动搭建助手

目标流程：

```text
user describes goal
-> companion asks clarifying questions
-> companion drafts graph
-> validate graph
-> user approves
-> companion edits canvas through GraphCommandBus
-> run graph
-> inspect result
-> refine graph
```

LangGraph 高级能力：

- Agent tool loop。
- Human-in-the-loop。
- Memory。
- Graph editing tools。
- Checkpoint/rollback。

当前能否做到：

当前 Editor 四节点是目标产物，不是执行主体。真正需要补的是桌宠 Agent 和 GraphCommandBus。

缺少能力：

- 桌宠 Agent runtime。
- 当前图读取工具。
- GraphCommandBus。
- 结构化 graph draft 生成。
- validate-run-refine 闭环。
- 命令审计和撤销。

适合放在哪：

- 明确放桌宠 Agent。
- Editor 负责展示、校验、运行最终图。

### 4.9 企业知识库问答与引用回答

目标流程：

```text
input question
-> query rewrite
-> retrieve docs
-> rerank
-> generate answer with citations
-> faithfulness check
-> output
```

LangGraph 高级能力：

- RAG。
- Routing。
- Evaluator。
- Citation artifact。
- Human review for low confidence。

当前能否做到：

基础版可以，增强版部分缺失。

缺少能力：

- 多阶段 RAG Skill。
- Rerank。
- Citation UI。
- Answer faithfulness evaluator。
- 多知识库选择和过滤。

适合放在哪：

- 标准知识问答流程放 Editor。
- 用户日常随问随答放桌宠 Agent。

### 4.10 Ambient Agent：后台邮件/任务助理

LangGraph 相关案例：

LangChain 官方博客中多次讨论 ambient agent，例如后台读取邮件或任务，在需要时打断用户审批。它通常依赖长运行、触发器、记忆、工具权限和人类在环。

目标流程：

```text
trigger new email/task
-> classify
-> retrieve context
-> decide action
-> draft response or task update
-> ask approval if needed
-> execute action
-> record memory
```

当前能否做到：

当前四节点可以表达“处理单封邮件”的固定流程，但还不能完整承载 ambient agent。

缺少能力：

- 外部 trigger。
- 邮件/日历/任务 Adapter Skill。
- 后台 daemon。
- 通知与审批。
- 长期记忆。
- 工具权限和审计。

适合放在哪：

- 后台自动化流程可以由 Editor graph 定义。
- 但是否执行、如何审批、如何和用户对话，适合桌宠 Agent 作为交互层。

## 5. 当前四节点能否搭建大多数 LangGraph 工作流

答案是：能搭建“大多数固定 workflow”，不能覆盖“大多数 autonomous agent 系统”。

### 5.1 已经能承接的 LangGraph 工作流类型

当前系统能较好承接：

- 顺序执行。
- 固定多 agent 协作。
- 条件路由。
- 有界循环。
- 基础 evaluator-optimizer。
- 基础 RAG。
- 基础 human review。
- 单次模型生成加固定 skill 上下文。
- 输出预览和持久化边界。

这些已经覆盖很多企业内部自动化、内容处理、知识问答、日报生成、审查流程的 MVP。

### 5.2 当前不能自然承接的 LangGraph 工作流类型

当前系统不能自然承接：

- 动态 worker 数量。
- 运行时生成边或目标节点。
- 多分支并行写同一 state 后自动合并。
- agent 自主多轮工具调用。
- agent handoff。
- subgraph 复用。
- long-running production jobs。
- 复杂 artifact pipeline。
- memory-driven personal agent。

这些并不是都要塞进四节点。应该按产品边界拆分：

- 固定、可复现、面向生产流程：补 Editor 能力。
- 开放、不确定、需要对话和自主探索：补桌宠 Agent 能力。

### 5.3 四节点是否需要增加新节点类型

短期不一定要增加。四节点可以继续作为用户心智主模型：

- input
- agent
- condition
- output

但 runtime 和配置层需要增加能力：

- Agent Node Skill 从“字符串列表”升级为强绑定配置。
- Skill 可以是 atomic/workflow/adapter/control。
- state 写入支持 reducer。
- condition 支持更强规则。
- graph 支持 trigger。
- run detail 支持 batch/subgraph 展开。

中长期可能值得增加少量高级节点，但不要过早扩张：

- `subgraph`：如果 Workflow Skill 无法自然表达。
- `batch/map`：如果 Control Skill 对用户不够直观。
- `join`：如果并行 fan-in 需要明确视觉表达。
- `action`：如果大量非模型步骤不应该伪装成 agent。

推荐策略：

1. 先不急着加节点类型。
2. 用 Skill、state reducer、runtime plan、run detail 扩展承接高级能力。
3. 当某种能力在 UI 上反复难解释时，再升级为节点。

## 6. 对 Skill 重构的具体落点

### 6.1 Agent Node Skill 必须强 schema

Agent Node Skill 应该声明：

- `targets: ["agent_node"]`
- `kind`
- `mode`
- inputs
- outputs
- permissions
- runtime
- config schema
- health check
- artifact schema
- error policy

示例：

```json
{
  "schemaVersion": 1,
  "skillKey": "web_fetch",
  "targets": ["agent_node", "companion"],
  "kind": "adapter",
  "mode": "workflow",
  "inputs": {
    "url": { "type": "text", "required": true }
  },
  "outputs": {
    "html": { "type": "text" },
    "statusCode": { "type": "number" }
  },
  "permissions": ["network"],
  "runtime": {
    "type": "python",
    "entrypoint": "main.py"
  }
}
```

Editor 中绑定 skill 时，应该明确：

- 哪些 state 映射到 skill input。
- skill output 写到哪些 state。
- skill 在模型前执行、模型后执行，还是作为固定 workflow 内部步骤执行。
- 失败后是停止、重试、走兜底、还是继续。

### 6.2 Companion Skill 可以更宽松，但权限更严格

Companion Skill 可以是：

- `context`
- `profile`
- `tool`
- `workflow`
- `adapter`

它不一定有强 schema，因为很多是给模型看的工作方式、知识包、认知框架。但它必须声明：

- 是否可联网。
- 是否可读当前 graph。
- 是否可修改 graph。
- 是否可调用本地文件。
- 是否可长期影响桌宠语气和决策。

### 6.3 `SKILL.md` 适配后还要保留吗

要保留，但职责不同。

`skill.json` 是 GraphiteUI Agent Node runtime 的真相源。它决定能不能安装、能不能绑定、如何校验、如何执行、如何记录。

`SKILL.md` 仍然有价值：

- 给 Companion Agent 做 progressive disclosure。
- 给人类解释这个 skill 什么时候用、怎么用、有什么限制。
- 给 LLM 适配器生成或修复 `skill.json` 提供上下文。
- 保留与 Claude Code / Codex / 其他生态的兼容入口。
- 记录示例、反例、操作说明、故障排查。

所以适配后不应该删除 `SKILL.md`，但 Agent Node 执行不能依赖它作为唯一真相源。

### 6.4 通用 Skill 自动适配 Agent Node 的流程

推荐导入流程：

```text
导入 Skill
-> 读取 SKILL.md / scripts / examples
-> LLM 判断适配性
-> 生成 skill.json draft
-> 用户确认 inputs/outputs/permissions
-> 系统运行 schema 校验
-> 系统运行 health check
-> 标记为 agent_node enabled
```

判断适配性的标准：

- 是否有稳定输入。
- 是否有稳定输出。
- 是否能在无对话状态下执行。
- 是否需要用户实时判断。
- 是否有副作用。
- 是否需要联网、本地文件、shell、外部账号。
- 失败能否被结构化表达。

不适合 Agent Node 的 Skill：

- 纯人格、语气、陪伴类。
- 需要长对话澄清目标的。
- 每次都要模型自主搜索和决策的。
- 会隐式修改工作台状态的。
- 没有明确输出 schema 的。

## 7. 能力补齐优先级

### P0：锁定产品边界与文档语义

目标：

- Editor = 固定、可复现、可审计 workflow builder。
- Companion = 自主、多轮、协作式 agent。
- 普通 Agent Node 不默认做动态 tool loop。
- Agent Node Skill 与 Companion Skill 同属 Skill Package，但 target 和 manifest 不同。

产物：

- 本文档。
- Skill manifest 规范。
- Agent Node runtime contract。
- Companion permission contract。

### P1：原生 Agent Node Skill 运行时

目标：

- `skill.json` 作为真相源。
- Agent Node 引用 skill 时有 input/output mapping。
- Skill 可以直接写 state 或生成 artifact。
- Skill run detail 可见。
- health check 和权限检查可见。

支持的场景：

- web_fetch。
- html_extract。
- sample_video_frames。
- ocr。
- json_extract。
- schema_validate。
- knowledge_search。

### P2：Workflow Skill / Subgraph Skill

目标：

- 把复杂能力封装为可复用 workflow。
- Run Detail 可展开内部步骤。
- 支持版本管理和依赖检查。

支持的场景：

- video_understanding。
- article_research。
- contract_review。
- rag_answer_with_citations。
- evaluator_optimizer_loop。

### P3：Batch / Map / Reducer / Join

目标：

- 支持数组输入的批处理。
- 支持动态 worker。
- 支持 reducer 合并结果。
- 支持 join 等待所有分支。

支持的场景：

- 新闻批量摘要。
- 视频帧分析。
- 多网页研究。
- 长文档分块审查。
- 多模型投票。

### P4：Trigger / Scheduler / Job Queue

目标：

- 让工作流真正自动化。
- 支持计划任务、Webhook、文件变化、手动运行。
- 支持后台任务、失败重试、取消、恢复。

支持的场景：

- 每日新闻日报。
- 定时竞品监控。
- 目录中新文件自动处理。
- 邮件或任务触发流程。

### P5：Companion Agent + GraphCommandBus

目标：

- 桌宠读取当前图。
- 桌宠解释图、规划图、生成草案。
- 用户确认后调用 GraphCommandBus 修改图。
- 所有修改可撤销、可审计。

支持的场景：

- 帮用户从自然语言生成 workflow。
- 根据运行错误修图。
- 边走边搭建流程。
- 把开放式探索沉淀成固定图。

### P6：高级 LangGraph 对齐能力

目标：

- 动态 Send。
- Command-like routing。
- Multi-agent handoff。
- Cross-subgraph navigation。
- Time travel / run fork。

是否需要：

这部分可以后置。只有在 P1-P5 稳定后，才需要追求更完整的 LangGraph parity。

## 8. 推荐的架构原则

### 8.1 固定流程必须显式化

如果一个任务要长期运行、定时运行、给别人复用、产生业务结果，就应该尽量显式化：

- 明确输入。
- 明确 state。
- 明确节点。
- 明确 skill。
- 明确输出。
- 明确失败策略。

不要依赖“模型自己看着办”。

### 8.2 自主能力必须可见、可暂停、可撤销

桌宠 Agent 可以自主，但不能偷偷改图或偷偷执行高风险工具。

它的行为要满足：

- 用户能看到它打算做什么。
- 高风险操作要确认。
- 修改要可撤销。
- 运行要可停止。
- 失败要能解释。

### 8.3 Agent Node 不等于 autonomous agent

在 GraphiteUI 语境里，Agent Node 更像 LangGraph node：一个被图调度的业务函数。它可以用模型，可以用 skill，可以有复杂内部实现，但它对 graph 应该表现为稳定输入输出。

Autonomous agent 是更大的运行体，适合放在 Companion 层或特殊 subgraph。

### 8.4 Skill 是能力包，不是单一工具函数

Skill 可以包含：

- 说明。
- schema。
- 脚本。
- workflow。
- 示例。
- 资源。
- 测试。
- 权限。

但 Agent Node 只应执行经过 manifest 校验的部分。

### 8.5 GraphiteUI 的差异化价值是可视化和可审计

纯代码 LangGraph 可以写任何动态逻辑。GraphiteUI 的价值不是取代所有 Python 能力，而是让高价值流程：

- 更容易被用户搭建。
- 更容易被理解。
- 更容易复用。
- 更容易调试。
- 更容易审计。
- 更容易交给桌宠协作生成。

## 9. 最终判断

当前四节点系统不是一个完整 LangGraph 高级能力平台，但它已经是一个正确的固定 workflow 基座。

它当前能承接：

- 大多数线性和分支型流程。
- 基础循环和质量门。
- 基础 RAG。
- 固定多 agent 协作。
- 初步人类在环。

它当前承接不了：

- 真正的动态 batch/map/reduce。
- 自主 agent tool loop。
- subgraph 复用。
- 生产级定时后台任务。
- 复杂 artifact 管线。
- 桌宠自动搭图闭环。

下一步不应该把普通 Agent Node 变成黑盒自主 Agent，而应该：

1. 先重构 Skill 系统，让 Agent Node Skill 强 schema、可校验、可执行、可记录。
2. 再做 Workflow Skill / Subgraph，把复杂固定能力封装起来。
3. 再补 batch/map/reducer/join，承接新闻、视频、文档等批处理场景。
4. 再补 scheduler/job queue，让 workflow 自动运行。
5. 并行建设桌宠 Agent，让开放式多轮决策和自动搭图有正确入口。

这样 GraphiteUI 的边界会更清楚：

- Editor 负责把流程做成图。
- Runtime 负责可靠执行图。
- Skill 负责把能力打包成可校验单元。
- Companion 负责帮助用户理解、规划、生成和调整图。

这条路线既保留 LangGraph 的图思想，也保留 Agent 的自主能力，但不会让两者互相污染。

## 10. 资料来源

- LangGraph Workflows and Agents：`https://docs.langchain.com/oss/python/langgraph/workflows-agents`
- LangGraph Graph API：`https://docs.langchain.com/oss/python/langgraph/graph-api`
- LangGraph Persistence：`https://docs.langchain.com/oss/python/langgraph/persistence`
- LangGraph Memory：`https://docs.langchain.com/oss/python/concepts/memory`
- LangGraph Interrupts / Human-in-the-loop：`https://docs.langchain.com/oss/python/langgraph/interrupts`
- LangGraph Subgraphs：`https://docs.langchain.com/oss/python/langgraph/use-subgraphs`
- LangGraph Streaming：`https://docs.langchain.com/oss/python/langgraph/streaming`
- LangChain Multi-agent patterns：`https://docs.langchain.com/oss/python/langchain/multi-agent`
- LangChain Multi-agent handoffs：`https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs`
- LangGraph case studies：`https://docs.langchain.com/oss/python/langgraph/case-studies`
- LangChain blog：`https://blog.langchain.com/`
- GraphiteUI 现有文档：`docs/future/2026-04-22-agent-only-langgraph-runtime.md`
- GraphiteUI 现有文档：`docs/future/2026-04-27-native-skill-system.md`
- GraphiteUI 现有文档：`docs/future/2026-04-27-skill-product-taxonomy.md`
- GraphiteUI 现有文档：`docs/future/2026-04-21-agent-companion-graph-orchestration.md`

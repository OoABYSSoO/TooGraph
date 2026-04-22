# Agent-only LangGraph Runtime 语义设想

## 背景

当前 GraphiteUI 的 `node_system` 里有四类节点：

- `input`
- `agent`
- `condition`
- `output`

当前后端 LangGraph runtime 会把 `graph.nodes` 里的每个节点都注册成 LangGraph 节点。也就是说，`input / agent / condition / output` 现在都会参与 `workflow.add_node(...)`。

这个实现让运行链路比较直接，但它也带来一个语义问题：GraphiteUI 画布上的“视觉边界节点”和 LangGraph 运行时里的“真实执行节点”被混在了一起。尤其在人类在环场景里，用户真正想审查的通常是 agent 刚生成的结果，而不是 output 这个展示边界是否执行过。

因此可以考虑把运行时语义收敛为：

> 只有 `agent` 是 LangGraph 意义上的真实节点；`input`、`output`、`condition` 都是 GraphiteUI 视觉图里的编排辅助，不直接编译成 LangGraph node。

## 目标语义

### 视觉图仍然保留四类节点

前端画布和保存协议仍然可以保留四类节点，因为它们对用户理解图很有价值：

- `input` 表示外部输入边界。
- `agent` 表示真正执行推理、调用 skill、读写 state 的工作单元。
- `condition` 表示条件边和循环分支的可视化代理。
- `output` 表示最终预览、展示和持久化边界。

也就是说，`node_system` 可以继续作为 GraphiteUI 的可视化文档协议。

### LangGraph runtime 只接收 agent 节点

编译到 LangGraph 时，应生成一张更窄的运行图：

- `agent` 编译成 LangGraph node。
- `input` 不编译成 node，而是用于构造初始 graph state。
- `output` 不编译成 node，而是在运行结束后由 GraphiteUI 读取 state 并生成 preview / saved output。
- `condition` 不编译成 node，而是编译成 LangGraph conditional edge 的路由函数。

这会形成两层模型：

```text
GraphiteUI Visual Graph
input -> agent -> condition -> agent -> output

LangGraph Runtime Graph
START -> agent -> conditional route -> agent -> END
```

## 各类节点的新职责

### input：状态注入边界

`input` 的职责是把外部值注入 `state_schema`。

目标语义：

- 不出现在 LangGraph `workflow.add_node(...)` 中。
- 不产生 node execution。
- 不产生 active path 节点状态。
- 它的 `writes[0].state` 决定注入哪个 state。
- 它的值在运行开始前进入初始 state。
- `input` 仍然可以在画布上连接到 agent，用于表达“这个 agent 读取了这个输入 state”。

需要明确的一点是：input 的运行时值应统一来自一个地方。推荐语义是：

- `state_schema[state].value` 是最终运行输入值。
- input 节点的 `config.value` 是前端编辑器对该 state 默认值的展示与编辑入口。
- 保存图时，两者应保持同步，避免“视觉输入值”和“运行输入值”分裂。

### output：结果边界

`output` 的职责是展示和持久化某个 state。

目标语义：

- 不出现在 LangGraph `workflow.add_node(...)` 中。
- 不产生 node execution。
- 不作为 LangGraph terminal node。
- 它的 `reads[0].state` 决定预览哪个 state。
- 图运行完成后，GraphiteUI 根据 output 节点配置生成 `output_previews`。
- 如果 `persistEnabled = true`，运行完成后由 GraphiteUI 的 output boundary collector 负责保存文件。

这意味着 output 是“结果边界”，不是“流程决策节点”。它可以在画布上显示最终结果，但不应该决定 LangGraph 是否继续运行。

### condition：条件边代理

`condition` 的职责是把条件边具象化。

目标语义：

- 不出现在 LangGraph `workflow.add_node(...)` 中。
- 不产生 node execution。
- 它的规则编译成 route callable。
- 它的分支编译成 `workflow.add_conditional_edges(...)`。
- true / false / exhausted 仍然在前端作为右侧分支手柄显示。
- 循环上限和 exhausted 分支仍由编译器和 runtime route logic 管理。

换句话说，condition 节点在视觉上是节点，在 LangGraph 里是条件边。

### agent：唯一真实执行节点

`agent` 是唯一应该进入 LangGraph 的业务节点。

目标语义：

- 编译成 LangGraph node。
- 读取 state。
- 调用模型和 skills。
- 写入 state。
- 产生 node execution。
- 参与 active path。
- 支持 LangGraph interrupt / checkpoint / resume。
- 支持人类在环断点。

这样，运行记录里的节点执行就更接近真实业务语义：用户看到的“执行过的节点”就是实际工作的 agent。

## 对边的编译规则

视觉图中的边不能直接一比一映射到 LangGraph 边，需要通过编译层转换。

### input -> agent

视觉语义：

```text
input_question -> answer_agent
```

运行时语义：

```text
START -> answer_agent
```

同时，input 注入的 state 会作为初始 state 传给 graph。

### agent -> output

视觉语义：

```text
answer_agent -> output_answer
```

运行时语义：

```text
answer_agent -> END
```

output 节点本身不执行。运行结束后，GraphiteUI 使用 output 节点的配置读取 state 并生成预览或持久化结果。

### agent -> condition -> agent

视觉语义：

```text
answer_agent -> score_gate -> pass_agent
answer_agent -> score_gate -> retry_agent
```

运行时语义：

```text
workflow.add_conditional_edges(
  "answer_agent",
  route_by_score_gate,
  {
    "true": "pass_agent",
    "false": "retry_agent",
    "exhausted": "fallback_agent",
  },
)
```

condition 节点不执行，但它提供 route function 的规则、分支名、循环限制和分支目标。

### agent -> agent

视觉语义和运行时语义一致：

```text
agent_a -> agent_b
```

编译成：

```text
workflow.add_edge("agent_a", "agent_b")
```

## 对人类在环的影响

这个语义调整会让人类在环更清晰。

推荐规则：

- 断点只允许设置在 agent 节点上。
- 默认语义是 `interrupt_after`，也就是 agent 执行完成后暂停。
- 暂停时展示该 agent 刚写出的 state。
- 如果某个 output 节点读取了这些 state，可以在 Human Review 面板里使用 output 的展示配置做预览，但 output 本身不需要运行。
- 用户可以修改 state 后 resume，让后续 agent 继续执行。

这样不会出现“output 后暂停但后面已经 END，不知道如何继续”的语义混乱。

## 收益

### 语义更接近 LangGraph

LangGraph 中真正有业务意义的 node 通常是执行函数。input / output 更像外部边界，condition 更像 edge routing。把三者从 runtime node 中移出后，运行图更贴近 LangGraph 心智。

### 运行记录更干净

当前 output 会出现在 `node_executions` 里。调整后，运行记录会只显示真正执行的 agent 节点。output preview 和 saved output 仍然存在，但它们属于 artifacts，不属于 node execution。

### 人类在环更自然

断点挂在 agent 后，用户审查的是 agent 的真实输出 state。是否继续、是否改 state、是否重新走分支，都能通过 resume 语义表达。

### 前端视觉表达不受损

用户仍然能看到 input、condition、output 节点。它们只是从“运行时节点”退回“可视化编排节点”，不会影响画布表达能力。

## 代价与风险

### 需要引入明确的编译层

当前 runtime 基本直接遍历 `graph.nodes` 注册 LangGraph node。新语义需要一个中间层：

```text
Visual Graph -> Runtime Plan -> LangGraph StateGraph
```

这个 Runtime Plan 要负责：

- 找出真实 agent nodes。
- 从 input 节点收集初始 state。
- 把 output 节点收集成 output boundary definitions。
- 把 condition 节点编译成 route functions。
- 把视觉边转换为 agent 间 runtime edges。

### output artifacts 需要独立收集器

当前 `_execute_output_node(...)` 负责生成 preview 和保存文件。移除 output runtime node 后，需要把这部分逻辑迁到运行结束后的 collector：

```text
collect_output_boundaries(graph, final_state, run_state)
```

它负责生成：

- `output_previews`
- `saved_outputs`
- `exported_outputs`
- `final_result`

### condition 的执行记录会变化

如果 condition 不再是 node execution，那么 run detail 中不会再出现 condition 节点执行记录。需要用 route artifact 或 edge activity 来表达：

- 哪个 condition route 被评估。
- 命中了哪个 branch。
- 是否触发 exhausted。
- 当前 cycle iteration 是多少。

### 图校验规则要更新

新的校验重点应从“所有节点都能执行”改成：

- 至少存在一个 agent 节点，除非是纯预览图。
- 每个 output 必须能从某个 agent 写出的 state 得到值。
- 每个 input 写出的 state 应至少被某个 agent 或 condition 使用。
- condition 必须有明确的上游 agent 和下游 agent / output boundary。

### 旧运行记录语义会不同

迁移后，新旧 run detail 的 `node_executions` 数量会不同。历史 run 可以保持原样，不强行重写。

## 推荐迁移路径

### Phase 1：只引入 Runtime Plan，不改变行为

先新增一个显式编译计划对象，描述：

- visual nodes
- runtime agent nodes
- input boundaries
- output boundaries
- condition routes
- runtime edges

这一阶段仍然维持当前执行行为，只用测试锁定新 plan 的结构。

### Phase 2：output 退出 LangGraph node

先把 output 从 `workflow.add_node(...)` 中移除。

改动点：

- terminal node 改成上游 agent。
- output preview / saved output 改由 collector 生成。
- run detail 保持能展示 output artifacts。

这是收益最大、风险相对可控的一步。

### Phase 3：input 退出 LangGraph node

把 input 从 `workflow.add_node(...)` 中移除。

改动点：

- input 只负责初始 state 注入。
- input 不再产生 node execution。
- input 的画布运行反馈改成 boundary state，而不是 running / success node。

### Phase 4：condition 退出 LangGraph node

把 condition 编译成 route function。

改动点：

- condition 不再产生 node execution。
- conditional_edges 的 source 从 condition node 转换为实际上游 agent。
- route artifact 记录分支选择。
- cycle tracking 继续保留。

这一步最复杂，建议放在 output/input 之后。

### Phase 5：人类在环只挂 agent

当 runtime graph 明确只包含 agent 节点后，人类在环语义自然收敛：

- agent 断点开关写入 graph metadata。
- 编译时转为 `interrupt_after`。
- Human Review 面板读取 agent 输出 state。
- output 只作为预览模板。

## 推荐结论

这个方向是合理的，而且更符合 LangGraph 的语义边界。

推荐目标定义为：

> GraphiteUI 保存的是视觉图；LangGraph 执行的是由视觉图编译出的 agent-only runtime graph。

短期不建议直接一次性重构全部 runtime。更稳的路径是先做 Runtime Plan，然后按 output、input、condition 的顺序逐步移出 LangGraph node。人类在环可以在这个目标语义下设计为 agent-only breakpoint，默认 `interrupt_after`。

## 暂不处理的范围

这份文档只定义目标语义和迁移方向，不直接要求立即修改代码。

暂不包含：

- 新增 Human 节点。
- 改动前端节点视觉形态。
- 改动保存协议中的四类节点。
- 重写历史 run 记录。
- 一次性删除当前 runtime 中 input / output / condition 的执行逻辑。

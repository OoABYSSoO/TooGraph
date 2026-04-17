# Edge Semantics

这份文档用于收口 GraphiteUI 当前“普通边 / 条件边 / state / LangGraph 运行语义”之间的关系，避免后续讨论反复回到同一批概念。

## 当前 GraphiteUI 的普通边语义

当前画布里的普通边，不是 LangGraph 原生意义上的纯控制流边。

它实际上同时表达了三件事：

1. 源节点写出了某个 state。
2. 目标节点读取了这个 state。
3. 因为存在这条边，源节点应先于目标节点执行。

也就是说，当前普通边更接近：

```txt
数据依赖 + 数据流向可视化 + 隐式执行顺序
```

这也是为什么当前普通边看起来像“顺序边”，但本质上更像“共享 state 的数据依赖边”。

## 当前后端运行时的真实行为

当前代码里，普通边已经进入正式运行语义，不只是前端展示。

- 普通边会被编进 LangGraph：`workflow.add_edge(edge.source, edge.target)`
- 条件边会被编进 LangGraph：`workflow.add_conditional_edges(...)`
- 入口节点和终点节点也是按 `edges + conditional_edges` 的入度和出度推导

因此，按当前实现：

- 普通边缺失，不是“仅仅少了一条展示线”
- 普通边缺失，会改变 entry node / terminal node 推导结果
- 普通边缺失，会直接改变实际执行顺序

## LangGraph 原生心智

LangGraph 原生图模型更接近下面这套：

```txt
State      = 全局共享状态
Node       = 读 state / 写 state
Edge       = 决定下一步执行谁
```

关键点：

- 数据不是沿着边传输的。
- 数据存放在共享 state 中。
- 边的职责是控制流，不是数据流。

按这个心智：

- 普通边表示 `A 执行完后轮到 B`
- 条件边表示 `A 执行完后，根据当前 state 选择下一跳`
- `reads / writes` 才负责描述节点与 state 的关系

所以，LangGraph 原生并没有“正式数据边”这个概念。

## 共享 state 覆盖语义

如果多个节点顺序修改同一个 state key，那么后续节点默认读取的是最新值，而不是历史值。

例如：

```txt
B -> C -> D

B 写 answer = "from B"
C 写 answer = "from C"
D 读 answer
```

则 `D` 默认读取到的是：

```txt
answer = "from C"
```

而不是 `"from B"`。

原因不是“边把 C 的值传给了 D”，而是：

- `D` 在执行时读取当前 graph state
- 此时 `answer` 已经被 `C` 覆盖

如果希望同时保留 `B` 和 `C` 的结果，需要显式设计：

1. 写入不同 state key，例如 `draft_answer` 和 `final_answer`
2. 或者给同一个 key 配置 reducer / 聚合语义

## 当前 GraphiteUI 与 LangGraph 的主要差异

当前 GraphiteUI 的普通边把两种概念压成了一种：

1. 控制流
2. 数据依赖

LangGraph 原生则把它们拆开：

1. `edges / conditional_edges` 负责控制流
2. `reads / writes` 负责 state 依赖

因此当前协议虽然直观，但在下面这些场景里会开始变混：

- 同一个 state 被多个节点顺序修改
- 一个节点同时读取多个 state
- 多个节点并行写同一个 state
- 用户误以为数据是“沿着边传递 payload”，而不是“读取当前共享 state”

## 当前讨论的结论

当前结论不是立即修改协议，而是先统一心智：

1. GraphiteUI 当前普通边不是 LangGraph 原生普通边。
2. 当前普通边更接近“共享 state 的数据依赖边”，只是顺便承担了执行顺序。
3. LangGraph 原生中，节点读取的是执行当下的共享 state，而不是某条边上传递的旧值。
4. 如果后续要进一步向 LangGraph-native 收口，最终需要明确区分：
   - 哪些边是控制流边
   - 哪些线只是数据依赖的可视化投影

## 后续待决策项

后续真正需要决定的是下面这个问题，而不是先决定“删不删普通边”：

```txt
GraphiteUI 正式协议里的普通边，到底是：
1. 控制流边
还是
2. 数据依赖边
```

这两个方向会导向完全不同的协议设计：

- 如果普通边是控制流边：
  - 更接近 LangGraph 原生
  - 数据依赖应由 `reads / writes` 表达
- 如果普通边是数据依赖边：
  - 画布更直观
  - 但需要另外解释或隐藏真正的控制流

这件事还没有最终定案，后续协议收口应基于这个问题继续展开。

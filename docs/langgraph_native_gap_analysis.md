# LangGraph Native Gap Analysis

这份文档只回答一件事：

- GraphiteUI 当前哪些能力可以继续演进成 LangGraph-native
- 哪些能力虽然心智相似，但运行时实现必须重做
- 哪些当前设计如果坚持保留，会阻碍原生 LangGraph 化

结论先写在最前面：

- 当前 GraphiteUI 是 **LangGraph-like / LangGraph-inspired 编辑器**
- 不是 LangGraph-native 编辑器
- 要变成 LangGraph-native，重点不是“前端长得像不像 LangGraph”，而是“后端是否真正以 LangGraph runtime 为执行主链”

## 当前状态

当前后端主运行链路是：

- 自定义 graph schema
- 自定义 validator
- 自定义 runtime executor
- 自定义 run state / cycle state / knowledge skill 注入

关键文件：

- [node_system.py](/home/abyss/GraphiteUI/backend/app/core/schemas/node_system.py)
- [validator.py](/home/abyss/GraphiteUI/backend/app/core/compiler/validator.py)
- [node_system_executor.py](/home/abyss/GraphiteUI/backend/app/core/runtime/node_system_executor.py)
- [state.py](/home/abyss/GraphiteUI/backend/app/core/runtime/state.py)

这意味着：

- 当前系统在“建模心智”上接近 LangGraph
- 但在“运行时事实”上并没有真正执行 LangGraph graph

## 一、可以继续演进成 LangGraph-native 的部分

这些内容不需要推倒重来，可以作为迁移基础。

### 1. Graph 级共享 state

当前已经有：

- `state_schema`
- 节点 `reads / writes`
- state snapshot / state events

这和 LangGraph 的核心心智是同方向的。

可以演进方式：

- 把 `state_schema` 编译成 LangGraph state schema
- 让 `reads / writes` 不再由自定义 executor 消费，而由编译层转成 LangGraph node 输入输出约束

### 2. `edges / conditional_edges`

当前已经有：

- 普通 `edges`
- 条件分支 `conditional_edges`

这可以继续保留为编辑器层协议，再在后端编译成：

- `add_edge`
- `add_conditional_edges`

注意：

- UI 层保留没有问题
- runtime 解释权要迁移给 LangGraph

### 3. 节点图编辑器本身

前端画布、节点卡片、State Panel、预设、模板机制都可以保留。

这些属于：

- 可视化建模层
- 不是运行时真相

只要后端编译链和执行链切成 LangGraph，前端并不需要推倒重做。

### 4. 模板与 graph JSON 化

当前：

- template 是 JSON
- graph 是 JSON
- preset 是 JSON

这非常适合做 LangGraph-native 迁移，因为：

- 图的交换格式已经独立于运行时实现
- 后端可以把同一份 graph JSON 编译成 LangGraph graph

### 5. 知识库作为资源引用

当前：

- graph 内保存稳定 `kb_id`
- editor 通过 input 节点把知识库接入 agent

这部分可以继续保留，但运行时实现应当改成：

- LangGraph node/tool 内显式使用 retriever 或工具调用

也就是说：

- 资源绑定心智可以保留
- 检索执行方式要迁到 LangGraph runtime 语义

## 二、必须重做才能变成 LangGraph-native 的部分

这些能力虽然现在存在，但实现方式不能直接沿用。

### 1. 自定义 executor 必须退出主链

当前执行核心是：

- [node_system_executor.py](/home/abyss/GraphiteUI/backend/app/core/runtime/node_system_executor.py)

如果目标是 LangGraph-native，这个文件不能再是主执行器。

它未来最多只能变成：

- 编译辅助层
- 迁移过渡层
- 或彻底删除

因为真正的 LangGraph-native 要求：

- graph 编译为 `StateGraph`
- runtime 由 LangGraph 驱动

### 2. 自定义 cycle 执行模型必须重写

当前 cycles 是你自己的循环调度逻辑：

- 回边检测
- iteration 计数
- max iteration 停止

这能保留“产品交互”，但不能保留“运行时实现”。

LangGraph-native 的做法应当是：

- 用 LangGraph 的节点和条件路由语义表达循环
- 而不是自定义 executor 管 iteration

### 3. 自定义 run state 模型必须重构

当前 run status 只有：

- `queued`
- `running`
- `completed`
- `failed`

要变成 LangGraph-native，至少要引入：

- checkpoint / thread / resume 的状态语义
- interrupt 相关状态
- 更接近 LangGraph execution lifecycle 的运行记录

所以：

- 当前 run detail UI 可以保留
- 但底层 run state 结构要重构

### 4. 知识库 skill 自动挂载机制需要降级为编译策略，而不是运行时事实

当前：

- agent 接上知识库后自动显式挂 `search_knowledge_base`

这个产品交互可以继续保留。

但如果走 LangGraph-native，更合理的实现是：

- 编译阶段把这类绑定转成 tool / retriever node / callable
- 而不是继续让自定义 runtime 注入 skill 行为

也就是说：

- “自动挂载”可以保留为编辑器行为
- “search_knowledge_base 作为当前自定义 skill 执行主链”需要重做

### 5. state 写入语义必须增强

当前 state 写入基本是：

- `replace`

这对 GraphiteUI 当前实现足够，但对 LangGraph-native 不够。

后续至少要支持：

- reducer / merge 语义
- 更明确的 typed state 更新方式

否则很多 LangGraph 原生模式无法准确映射。

## 三、如果坚持保留，会阻碍 LangGraph-native 的部分

这些不是“可逐步演进”，而是会形成技术方向冲突。

### 1. 把自定义 executor 当作长期主链

如果后面继续在 `node_system_executor.py` 上叠加：

- interrupt
- resume
- checkpoint
- subgraph
- dynamic routing

最终只会得到一个“越来越像 LangGraph 的自研框架”。

这条路和 LangGraph-native 是冲突的。

### 2. 把 skill 系统继续当 runtime 核心抽象

当前 skill 对产品很重要，但 LangGraph-native 里更自然的核心抽象通常是：

- node callable
- tool
- retriever
- state transition

所以如果坚持把“skill”当 runtime 第一抽象，后面会越来越偏离 LangGraph。

更稳的做法是：

- skill 保留为 GraphiteUI 产品层概念
- 编译后映射到 LangGraph node/tool

### 3. 继续把 cycles、interrupt、knowledge retrieval 都做成自定义 runtime 特性

这会让 GraphiteUI 持续停留在：

- LangGraph-like

而不是：

- LangGraph-native

## 四、基本可以保留不动的部分

这些即使未来迁到 LangGraph-native，也没有必要推翻。

- 前端可视化编辑器整体视觉和交互
- 模板 / graph / preset 的 JSON 文件化
- State Panel 作为 graph state 主编辑入口
- 节点 `name / description / ui` 这类编辑器元数据
- knowledge base 资源注册表
- run detail 页面本身的展示外壳

这些都属于：

- 产品层
- 编辑层
- 观察层

不是 LangGraph-native 的障碍。

## 五、建议的迁移路径

如果未来真的要转向 LangGraph-native，建议按这个顺序，而不是一口气推翻。

### Phase 1：明确编译边界

先增加一个明确的后端编译层：

- `graph JSON -> LangGraph build plan`

目标：

- 不立刻替换现有 editor
- 先把“GraphiteUI 图”和“LangGraph runtime 构造参数”之间的映射钉死

### Phase 2：最小 LangGraph runtime 验证

先选最小子集落地：

- input
- agent
- condition
- output
- edges
- conditional_edges
- state

用这部分编出真正的 `StateGraph` 并运行。

不要一开始就做：

- knowledge base
- cycles 高级策略
- interrupt
- subgraph

### Phase 3：切换运行主链

等最小子集稳定后：

- 让 LangGraph runtime 成为默认执行主链
- 自定义 executor 退为 fallback 或测试工具

### Phase 4：补 LangGraph 原生能力

再逐步补：

- checkpoint
- interrupt
- resume
- reducer
- subgraph
- dynamic routing

### Phase 5：清理自定义 runtime 遗留

最后再决定：

- 删除旧 executor
- 或仅保留为非原生兼容模式

## 六、当前最准确的产品定位

如果按代码现状表述，最准确的说法是：

- GraphiteUI 当前是一个 **LangGraph-inspired workflow editor**
- 不是一个 **LangGraph-native editor**

更具体一点：

- 它已经借鉴了 LangGraph 的 state / graph / conditional routing 心智
- 但后端执行的仍是 GraphiteUI 自己的 runtime
- 因此现在不能说“GraphiteUI 能原生执行 LangGraph graph”

## 七、当前讨论结论

当前阶段建议：

1. 继续先把现有 GraphiteUI 主链做好
2. 不要在还没确定编译边界前，贸然往 LangGraph-native 开发
3. 真要转向 LangGraph-native，先从“编译层”开始，而不是先改前端

也就是说：

- 现在先把现有能力做扎实
- 后面再决定是否开启一条正式的 LangGraph-native 迁移线

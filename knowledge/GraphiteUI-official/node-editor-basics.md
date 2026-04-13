# 节点编排基础

GraphiteUI 画布的基本单位是节点、state 和边。当前正式的心智是：

- `state` 是唯一数据源
- 节点只负责读写 state
- `edges` 和 `conditional_edges` 负责表达执行关系与条件分支

当前最重要的几类节点是：

- `input`：把文本、文件或 knowledge base 引入图中。
- `agent`：配置任务说明、skills，并读取或写入 state。
- `condition`：在规则判断或循环分支之间做选择。
- `output`：显示最终结果，也可以承担保存产物的职责。

当前画布里几个很关键的交互是：

- 双击画布打开创建菜单。
- 从节点 handle 拉线建立连接。
- 从连接点拉到空白处时，直接创建下一个节点。
- 在节点上新增输入或输出引用，并绑定已有 state 或即时新建 state。
- 通过右侧 `State Panel` 直接编辑唯一的 `state_schema` 数据源。
- 在节点上双击 state 名称或说明，直接修改同一份 state 数据。

关于 state 和节点的关系，现在需要按这套心智理解：

- 同一个 state 在任何地方显示的名称、说明、类型都一致
- 节点上看到的输入和输出只是对 state 的引用视图
- 新增一个输入或输出，本质上是在给节点新增一个 state 引用
- 如果选择了一个当前不存在的 state，编辑器会先创建这条 state，再把节点绑定上去

关于 skill 和知识库，有两个当前实现上的重点：

- skill 是显式挂在 agent 上的，不是隐藏能力。
- 当 knowledge base input 接到 agent 时，编辑器会自动把 `search_knowledge_base` 加到 agent 的 skill 列表里。

关于 cycles，当前已经有基础执行支持：

- `condition` 节点可以切到 `cycle` 模式
- runtime 会记录循环轮次和终止原因
- 但更高级的停止策略和回边可视化还在后续计划里

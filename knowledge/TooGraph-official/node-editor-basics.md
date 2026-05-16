# 节点编排基础

TooGraph 画布的基本单位是节点、state 和边。当前正式心智是：

- `state_schema` 是唯一数据源。
- 节点只负责读写 state。
- `edges` 表达普通执行顺序。
- `conditional_edges` 表达条件分支目标。
- 图整体才是 Agent；单个 LLM 节点只做一次模型运行、一次结构化输出或一次能力调用准备。

## 节点类型

- `input`：把文本、文件、图片、音频、视频或 knowledge base 引入图中；有且只有一个 state 输出。
- `agent`：当前协议里的 LLM 节点，配置任务说明、模型、thinking、一个显式 Skill 或一个动态 `capability` 输入，并读取或写入 state。
- `condition`：作为条件边的可视化代理，根据 source、判断符号、输入值和循环上限决定 true / false / exhausted 分支。
- `output`：显示、预览、导出或链接最终结果和 artifacts。
- `subgraph`：把一张图模板复制为父图中的可编辑子图实例，通过公开 input/output 边界与父图通信。

## 当前关键交互

- 拖拽节点调整画布布局。
- 双击空白画布打开节点创建菜单。
- 从节点手柄拖到空白处，打开带上下文的节点创建菜单。
- 从 state 输出拖到 LLM 节点时，可以生成新的输入引用胶囊。
- 从流程手柄拖到目标节点或目标手柄时，会自动吸附。
- 点击数据线或端口后，通过确认胶囊打开 state 编辑小窗。
- 点击流程线后，通过确认按钮删除边。
- 双击 `subgraph` 节点可以打开当前子图实例工作区页签。
- 右下角 minimap 可辅助定位画布。
- 左上角线条显示工具条可以切换智能 / 数据 / 顺序 / 全量模式。

## State 与节点引用

- 同一个 state 在任何地方显示的名称、说明、类型和颜色都来自 `state_schema`。
- 节点上看到的输入和输出只是对 state 的引用视图。
- 新增一个输入或输出，本质上是在给节点新增一个 state 引用。
- input 节点的 state 输出不能被删除；如果需要改变输入语义，应编辑 input 节点本身。
- 保存图时，没有被任何节点引用的 state 会被清理。
- `capability` state 表示一个互斥能力选择，`kind` 只能是 `skill`、`subgraph` 或 `none`。
- 动态能力执行节点必须把结果写入唯一 `result_package` state。

## Skills 与知识库

- Skill 是显式挂在 LLM 节点上的，不是隐藏能力。
- 一个 LLM 节点最多使用一个显式能力来源。
- Skill 的运行资源应放在 `skill/official/<skill_key>/` 或 `skill/user/<skill_key>/` 文件夹内，并通过 `skill.json` manifest 暴露给 LLM 节点。
- 当前官方 Skill 包括 `web_search`、`toograph_capability_selector`、`toograph_page_operator`、`toograph_skill_builder`、`toograph_script_tester`、`local_workspace_executor` 和内部 `buddy_home_writer`。
- knowledge base input 可以作为 state 进入图，但不会再自动挂载旧的内置检索 Skill。
- output 节点可以预览普通文本、Markdown、JSON，也可以读取本地 artifact 路径并展示文档、图片和视频。

## 条件、循环与断点

- condition 节点默认有 true / false / exhausted 三类分支。
- exhausted 表达超过循环上限后的出口。
- 循环上限默认 5，允许范围是 1 到 10。
- 节点断点使用 `metadata.interrupt_after` 表达，运行时进入标准 `awaiting_human`。
- 静态 Subgraph 节点和动态 `capability.kind=subgraph` 的内部断点都会传播到父 run 的标准暂停/恢复路径。

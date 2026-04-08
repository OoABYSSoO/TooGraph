# State-Aware Editor Interaction Spec

## 1. Purpose

本文件定义新 editor 的具体交互规则。

它服务于 [editor_rebuild_requirements.md](/home/abyss/GraphiteUI/docs/active/editor_rebuild_requirements.md)，回答的是：

- 页面上具体怎么呈现
- 用户具体怎么操作
- 哪些对象在何时出现什么反馈

## 2. Design Principles

新 editor 必须遵守以下交互原则：

1. 用户看到的不是抽象图，而是 state 处理链
2. state 必须是可见对象，而不是隐藏在 JSON 里的字段
3. 节点必须表达“读取什么、产出什么”
4. 每个 state 项都应尽量拥有独立连接线，便于观察来龙去脉
5. condition 是节点，不是边特效
6. 节点运行结果必须能在 editor 内直接查看
7. 前端边界应优先表现为 `Input / Output`，而不是直接暴露 `START / END`

## 3. Layout

## 3.1 Top Toolbar

顶部工具栏包含：

- graph name
- template / graph meta
- Save
- Validate
- Run
- Fit View
- 当前运行状态

要求：

- 高度压薄
- 操作优先级明显
- 运行中状态不能太隐蔽

## 3.2 Left Rail

左侧栏分成两个区块：

1. `State Panel`
2. `Node Palette`

要求：

- 默认都可见
- 可以滚动
- 二者区分清楚，不混成一个列表

## 3.3 Canvas

中央是主画布。

要求：

- 占据主工作区
- 背景有明显网格或点阵
- 支持平移和缩放
- 空画布状态有引导

空画布引导应优先提示：

- 先定义输入
- 再定义输出
- 再放置处理节点
- 最后连接逐项 state flow

## 3.4 Right Inspector

右侧 inspector 负责展示当前选中对象。

支持对象：

- graph
- node
- edge
- state

## 4. State Panel

## 4.1 List View

每个 state 条目至少显示：

- color swatch
- key
- type
- 简短描述

## 4.2 Edit Actions

每个 state 支持：

- 新增
- 编辑
- 删除
- 修改颜色

第一阶段若删除会影响读写绑定，可先使用保守策略：

- 有引用时禁止删除
- 或删除前给出明确警告

## 4.3 Relationship Display

选中一个 state 时，应尽量看到：

- 写入它的节点
- 读取它的节点
- 包含它的边标签

第一阶段至少在 inspector 中显示“writers / readers”文本列表。

## 4.4 Boundary Summary

左侧或画布边缘应能帮助用户理解：

- 哪些 state 是输入边界
- 哪些 state 是输出边界

第一阶段允许先用轻量方式实现：

- 输入 state 没有上游生产者、但被节点读取
- 输出 state 没有下游继续消费、但被节点写出

## 5. Node Palette

## 5.1 Palette Cards

节点卡片至少显示：

- label
- node type
- one-line description

## 5.2 Create Actions

支持两种方式：

- 点击建点
- 拖拽建点

拖拽时要求：

- 光标有明确 grab 反馈
- 画布 drag over 有高亮反馈
- 落点创建后自动选中新节点

## 6. Node Presentation

## 6.1 Card Structure

节点卡片应采用单行横向结构：

1. 左：Inputs
2. 中：节点类型、标题、职责摘要
3. 右：Outputs

## 6.2 Inputs and Outputs

输入输出必须满足：

- 输入在左侧
- 输出在右侧
- 每个 state 项有独立连接点
- 输入项顺序是 `连接点 -> state 名称`
- 输出项顺序是 `state 名称 -> 连接点`
- state 名称带颜色提示

第一阶段必须做到：

- 人眼能快速区分输入和输出
- 选中节点时可以编辑 `reads / writes`
- 每个 state 项都能形成独立连线

普通节点规则：

- 左侧只显示真实 `reads`
- 右侧只显示真实 `writes`

## 6.3 Special Nodes

`condition`：

- 重点展示判断性质
- 分支去向要清晰

`Input Boundary`：

- 表达图的真实输入
- 例如文本框、文件、媒体输入或结构化参数

`Output Boundary`：

- 表达图的真实输出
- 例如文本、图片、视频、音频或结构化对象

## 7. Edge Presentation

## 7.1 Visual Rule

边按 state 项逐条显示。

要求：

- 线条足够清楚
- 每条线只表达一个 state
- 标签不遮挡主要连线关系

## 7.2 Label Rule

边标签显示规则：

- 当前方向下，一条边通常只显示一个 state key
- condition 分支边应优先显示 branch label

若同时需要 branch label 和 flow keys：

- 第一阶段建议格式：
  - `pass · greeting`
  - `revise · issues`

## 7.3 Color Rule

state 的颜色来自 state 定义。

边使用颜色的原则：

- 颜色仅辅助理解
- 不让颜色本身承担全部语义
- 标签文本仍是主表达

第一阶段推荐：

- 边主线跟随对应 state 色彩
- 标签内继续显示 state key

## 8. Inspector Behavior

## 8.1 Graph Inspector

无节点或边选中时，右侧显示 graph 级信息：

- graph name
- template
- node count
- edge count
- state count
- run summary

## 8.2 Node Inspector

选中节点时，显示：

- 基本信息
- `reads`
- `writes`
- params
- 最近一次执行结果

最近一次执行结果至少包含：

- `status`
- `duration`
- `input_summary`
- `output_summary`
- `warnings`
- `errors`
- `artifacts`

建议新增一个重点区：

- `Changed Outputs`

规则：

- 只看该节点 `writes`
- 只显示最近 run 中非空输出
- 用于回答“这个节点实际写出了什么”

## 8.3 Edge Inspector

选中边时，显示：

- source
- target
- 当前 state key
- `edge_kind`
- `branch_label`

## 9. Runtime Feedback

## 9.1 Run Status

点击 `Run` 后，editor 内必须有持续可见的运行状态反馈：

- running
- completed
- failed

## 9.2 Node-Level Result

点击某个已执行节点时，必须能查看该节点最近一次运行结果。

这是新 editor 的关键要求，不允许只在 run detail 页面可见。

## 9.3 Final Result

运行完成后，用户至少需要在 editor 内看到：

- run 是否成功
- 最终结果摘要
- `hello_world` 的 greeting

## 10. Boundary Model

前端不应直接把 `START / END` 暴露为主要用户概念。

前端图模型：

- `Input Boundary`
- `Process Node`
- `Condition Node`
- `Output Boundary`

后端运行模型：

- `START`
- process nodes
- condition nodes
- `END`

转换规则：

1. 前端输入边界在编译时映射为 graph 初始输入和内部 `START`
2. 前端输出边界在编译时映射为 graph 最终输出和内部 `END`
3. 普通节点与条件节点尽量一一映射到后端节点
4. 前端逐项 state 连线保存时可合并为后端 `flow_keys`

## 11. Hello World Flow

第一阶段唯一必须跑通的交互流：

1. 打开 `/editor/new`
2. 定义输入 state `name`
3. 定义输出 state `greeting / final_result`
4. 创建 `hello_model`
5. 连接逐项 state flow
6. 配置名字参数
7. Save
8. Validate
9. Run
10. 点击 `hello_model` 查看节点结果
11. 在最终结果中看到 greeting

## 12. Non-Goals

第一阶段交互明确不做：

- 从空白连线处弹 Node Picker
- 子图
- 协作编辑
- 高级时序调试
- 自动布局
- 复杂的端口级多线 state routing

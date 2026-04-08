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
4. 边只做单线，但必须通过标签表达当前流动的重点 state
5. condition 是节点，不是边特效
6. 节点运行结果必须能在 editor 内直接查看

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

## 3.4 Right Inspector

右侧 inspector 负责展示当前选中对象。

支持对象：

- graph
- node
- edge
- state

第一阶段可先实现：

- graph
- node
- edge

如果选中 state，允许后续在第二阶段补完整。

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

节点卡片结构建议分为三层：

1. Header
   - 节点类型
   - 节点标题
2. Body
   - 节点职责摘要
3. IO Bands
   - 左：Inputs
   - 右：Outputs

## 6.2 Inputs and Outputs

输入输出应至少用文本 chip 或列表表达：

- 输入在左侧
- 输出在右侧
- state 名称带颜色提示

第一阶段不强制每个 state 都有独立 handle。

第一阶段必须做到：

- 人眼能快速区分输入和输出
- 选中节点时可以编辑 `reads / writes`

## 6.3 Special Nodes

`start`：

- 重点展示初始 state 入口
- 输出侧应清晰可见

`condition`：

- 重点展示判断性质
- 分支去向要清晰

`end`：

- 重点展示最终汇总
- 让用户感知 graph 最终收口到了哪些 state

## 7. Edge Presentation

## 7.1 Visual Rule

边统一使用单线。

要求：

- 线条足够清楚
- 不走复杂多通道视觉
- 标签不遮挡主要连线关系

## 7.2 Label Rule

边标签显示规则：

- 优先显示 `flow_keys`
- 多个 key 时可逗号分隔或折叠显示数量
- condition 分支边应优先显示 branch label

若同时需要 branch label 和 flow keys：

- 第一阶段建议格式：
  - `pass · greeting, final_result`
  - `revise · score, issues`

## 7.3 Color Rule

state 的颜色来自 state 定义。

边使用颜色的原则：

- 颜色仅辅助理解
- 不让颜色本身承担全部语义
- 文本标签仍是主表达

第一阶段推荐：

- 边主线保持统一基础色
- 标签内小色块或 key 文本可使用 state 色彩

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
- `flow_keys`
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

## 10. Hello World Flow

第一阶段唯一必须跑通的交互流：

1. 打开 `/editor/new`
2. 定义或确认所需 state
3. 创建 `start`
4. 创建 `hello_model`
5. 创建 `end`
6. 连接边并设置 `flow_keys`
7. 配置名字参数
8. Save
9. Validate
10. Run
11. 点击 `hello_model` 查看节点结果
12. 在最终结果中看到 greeting

## 11. Non-Goals

第一阶段交互明确不做：

- 从空白连线处弹 Node Picker
- 子图
- 协作编辑
- 高级时序调试
- 自动布局
- 复杂的端口级多线 state routing

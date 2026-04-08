# State-Aware Editor Requirements

## 1. Purpose

本文件定义 GraphiteUI 新 editor 的当前唯一产品需求。

新 editor 不再按“普通节点图编辑器”理解，而是按：

- LangGraph-compatible runtime
- state-aware visual editor
- node-driven state processing workflow

来设计和开发。

本文件优先级高于之前所有 editor 重构草案。

## 2. Product Positioning

GraphiteUI editor 的目标不是做通用流程图工具。

它的目标是让用户可以清晰看到：

- graph 中有哪些 state
- 哪些节点读取了哪些 state
- 哪些节点写出了哪些 state
- state 如何沿着 route 向下游继续流动
- 某个节点最近一次运行到底产出了什么

一句话定义：

> 这是一个与 LangGraph 运行模型兼容、但为了人类理解而增强可视化语义的 state-aware editor。

## 3. Runtime Model vs Editor Model

## 3.1 Runtime Model

底层运行时继续遵循 LangGraph 心智：

- `State` 是共享状态
- `Node` 读取当前 state，并返回 state update
- `Edge` 决定下一个执行节点
- `Condition` 是带路由能力的节点
- `START` / `END` 是执行边界

## 3.2 Editor Model

为了可视化和可编辑性，editor 在运行时模型之上增加以下表达：

- state 是一等对象
- 每个 state 可以配置颜色
- 节点明确显示输入和输出
- 边仍是一根线，但线上的标签显示当前重点传递的 `flow_keys`
- `END` 在 editor 中表现为“最终 state 汇总出口”
- 点击节点可以看到节点级运行结果

说明：

- 上述增强是 editor 语义，不等同于 LangGraph 原生 API 语义。
- 新 editor 必须与当前后端 graph 协议兼容，不允许为前端方便另造一套独立持久化协议。

## 4. Core Entities

## 4.1 State

每个 state 至少包含：

- `key`
- `type`
- `title`
- `description`
- `color`

其中：

- `color` 是 editor 可视化字段
- 若后端暂未正式持久化 `color`，第一阶段允许先放在 graph metadata 或前端兼容层中，但必须为后续正式收口预留位置

## 4.2 Node

每个节点必须明确表达：

- 节点类型
- 节点职责
- 输入 state
- 输出 state
- 结构化参数

节点视觉规则：

- 左侧是输入
- 右侧是输出
- 节点主体必须让用户一眼看出它在处理什么

## 4.3 Edge

边的基本语义仍然是 route。

但在 editor 中，边还承担“状态流转可视提示”的职责：

- 仍使用单线表示
- 不做多股线
- 线上的小标签显示 `flow_keys`
- `flow_keys` 对应 state 可通过颜色辅助理解

注意：

- 这不代表边本身是数据容器
- 真正的数据读写仍以节点的 `reads / writes` 为准

## 4.4 Condition

`condition` 必须被视为特殊节点，而不是特殊边。

它需要清晰表达：

- 输入 state
- 判断依据
- 分支结果
- 每个分支通往哪里

分支边只负责表达 route：

- `pass`
- `revise`
- `fail`

## 4.5 Start and End

`start` 表示 graph 的初始 state 入口。

`end` 在 editor 中表示最终 state 汇总出口：

- 默认接收并展示当前链路的最终 state
- 用户应能清楚理解 graph 最后收口到了哪些结果

说明：

- 这里的“接收全部最终 state”是 editor 可视化语义
- 它不要求把 `END` 误解成一个真正执行业务逻辑的处理节点

## 5. Scope

## 5.1 Phase 1 Required Scope

第一阶段必须完成：

- `/editor` 入口页
- `/editor/new`
- `/editor/[graphId]`
- canvas-first 画布
- 左侧 `State Panel + Node Palette`
- 节点拖拽建点
- 点击建点
- 节点连线
- 线标签显示 `flow_keys`
- 节点输入输出展示
- 右侧 inspector
- 节点运行结果查看
- Save / Validate / Run
- `hello_world` 闭环

## 5.2 Phase 1 Not In Scope

第一阶段明确不做：

- 子图
- 协作
- 撤销重做
- 自动布局
- 自然语言生成整图
- 高级 debugger
- 复杂模板推荐系统
- 多人同时编辑

## 6. Information Architecture

## 6.1 Routes

- `/editor`
  - editor 入口
  - 提供：
    - `新建图`
    - `打开已有图`

- `/editor/new`
  - 新 graph 编辑页

- `/editor/[graphId]`
  - 已保存 graph 编辑页

## 6.2 Screen Layout

新 editor 采用 `canvas-first` 布局：

- 顶部：窄工具栏
- 左侧：`State Panel` 与 `Node Palette`
- 中央：全尺寸画布
- 右侧：Inspector
- 右下：Mini Map
- 左下：轻量状态条

## 7. Detailed Requirements

## 7.1 Canvas

画布必须满足：

- 明显的网格或点阵背景
- 鼠标滚轮缩放
- 鼠标拖动画布
- `fit view`
- 最小 / 最大缩放限制
- 空画布时有明确引导

空画布提示应引导用户：

- 先定义 state
- 再创建节点
- 再连线形成状态处理链

## 7.2 State Panel

左侧必须有 `State Panel`。

它至少支持：

- state 列表展示
- state 搜索
- state 新增
- state 编辑
- 为 state 配置颜色
- 查看某个 state 被哪些节点读取
- 查看某个 state 被哪些节点写入

第一阶段允许 `State Panel` 与 `Node Palette` 同列展示，但二者必须是两个清晰区块。

## 7.3 Node Palette

节点库必须支持：

- 搜索
- 滚动
- 点击建点
- 拖拽建点
- 节点卡片显示拖拽反馈

节点卡片至少显示：

- 节点名称
- 节点类型
- 一句话说明

## 7.4 Node Creation

建点方式：

- 点击节点卡片：
  - 在当前可见区域创建节点
  - 自动选中新节点

- 拖拽节点卡片到画布：
  - 在落点创建节点
  - 自动聚焦到新节点
  - 画布在 drag over 时显示落区反馈

## 7.5 Node Rendering

节点必须直观表达输入输出关系。

要求：

- 左侧渲染输入 state
- 右侧渲染输出 state
- 节点中央显示节点标题和职责
- `start`、`condition`、`end` 需要有更明确的视觉区分

第一阶段不要求把每个 state 都渲染成复杂 port，但必须能让人一眼读懂输入和输出集合。

## 7.6 Edge Rendering

边必须满足：

- 使用单线
- 线条清晰可见
- 在线上显示小标签
- 小标签内容来自 `flow_keys`

颜色规则：

- 允许根据 state 色彩做辅助表达
- 但不能让多色方案影响可读性
- 当一条边包含多个 state 时，优先显示文本标签而不是强行做复杂多色线

## 7.7 Inspector

右侧 inspector 第一阶段最少包含：

- graph 级信息
- 节点基本信息
- 节点参数
- 边基本信息
- 节点最近一次运行结果

当选中节点时，必须能看到：

- `status`
- `duration`
- `input_summary`
- `output_summary`
- `warnings`
- `errors`
- `artifacts`

核心目标：

- 用户点击某个节点后，能立即理解它最近一次运行做了什么

## 7.8 Toolbar

顶部工具栏必须包含：

- Graph name
- Save
- Validate
- Run
- Fit View

第一阶段建议补充：

- template 标识
- 当前 run 状态

## 8. Hello World Validation

`hello_world` 是第一阶段唯一必须跑通的闭环模板。

目标：

- 用户输入名字
- `hello_model` 节点处理该输入
- 后端调用本地 OpenAI-compatible 模型服务
- 前端可见 `greeting`

必经流程：

1. 打开 `/editor/new`
2. 通过 state-aware editor 构建最小图
3. 保存 graph
4. 校验 graph
5. 运行 graph
6. 查看 run 成功或失败
7. 点击节点查看节点运行结果
8. 在最终结果中看到 greeting

## 9. Technical Constraints

## 9.1 Frontend

保留：

- Next.js
- TypeScript
- React Flow
- Tailwind CSS
- Zustand 仅在确有必要时引入

原则：

- 先实现稳定可读的 state-aware editor
- 不整体搬回旧 editor 状态模型
- 优先闭环，不优先堆功能

## 9.2 Backend

保留：

- FastAPI
- LangGraph
- SQLite
- 当前 graph 保存、校验、运行接口

原则：

- 优先兼容现有后端协议
- 前端新增语义字段时，要明确哪些是 editor-only，哪些需要正式进入后端 schema

## 10. Definition of Done

第一阶段完成标准：

- `/editor/new` 可打开
- 画布可缩放、可平移
- 左侧存在 `State Panel`
- 节点库支持搜索、点击建点、拖拽建点
- 节点可清晰显示输入和输出
- 边为单线，并在线上显示 `flow_keys`
- `condition` 作为节点被清晰表达
- `end` 被表达为最终 state 汇总出口
- 点击节点可看到节点运行结果
- `hello_world` 图可保存、校验、运行
- 前端构建通过
- 后端编译通过

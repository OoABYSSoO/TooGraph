# State-Aware Editor Development Plan

## 1. Purpose

本文件定义当前 editor 的执行计划。

它不再复述旧 editor 已实现什么，而是围绕新的 state-aware editor 目标，给出清晰的开发顺序、阶段目标和验收标准。

## 2. Current Baseline

当前代码已具备的基础：

- 前后端开发环境可启动
- graph 保存、校验、运行接口可用
- `hello_world` 模板存在
- `/editor`、`/editor/new`、`/editor/[graphId]` 路由已接回
- 画布、缩放、平移、Mini Map、基础建点、基础连线已存在
- 左侧已有 `State Panel + Node Palette`
- state 支持新增、搜索、颜色配置、readers / writers 展示
- 节点已切到单行横向布局
- 前端已用 `Text Input / Text Output` 替代显式 `start / end`
- 每个 state 项已支持独立连接线，并在保存时折叠回后端 `flow_keys`
- `hello_model` 已支持参数级连接覆盖本地值
- `Text Output` 已支持预览和可选保存
- Save / Validate / Run 已接通

当前代码与新目标之间的主要差距：

- `Text Input` 还没有在节点本体内直接提供可编辑文本框
- `Text Output` 还需要更明确的“未连接 / 已连接 / 预览 / 保存”终端语义
- 参数级 socket 目前只在 `hello_model.name` 上落地，尚未成为通用能力
- 节点运行结果仍以 run 级结果为主，节点级结果视图还不完整
- `condition` 节点仍未按新心智重建
- `hello_world` 闭环还需要按边界节点语义再做一次收口验收

## 2.1 Current Progress

当前阶段已经完成的里程碑：

- `M1 State-Aware Shell` 已基本完成
- `M2 Readable Processing Graph` 已完成大部分

已经稳定落地的部分：

- state 是 editor 的一等对象
- 输入输出按 state 项逐条连线
- 前端边界模型与后端 `START / END` 存在可运行映射
- `hello_model` 不再错误输出 `name`
- `hello_model.name` 已具备 ComfyUI 风格的“连接覆盖本地值”能力

## 2.2 Current Focus

当前开发聚焦，不再继续发散：

1. 收紧边界节点交互
2. 把 ComfyUI 风格的“widget + socket fallback”推广成通用规则
3. 补全节点内直接编辑体验
4. 补强节点级运行结果可视化

当前最优先的具体事项：

- `Text Input` 节点内嵌文本框
- `Text Output` 节点内嵌终端预览
- 参数 socket 通用化
- 节点结果 inspector 收口

## 3. Strategy

执行策略：

1. 先把编辑器语义做对
2. 先明确前端边界模型与后端 LangGraph 编译模型的映射
3. 再把 `hello_world` 跑通
4. 最后再做扩展体验

明确禁止：

- 在核心语义没稳定前，优先做大量样式微调
- 在 state model 没定清楚前，继续堆复杂交互
- 在边界模型没定清楚前，继续堆复杂节点类型

## 4. Phases

## Phase 1 State Model and Left Rail

目标：

- 让 state 成为一等对象
- 左侧形成真正的 `State Panel + Node Palette`

任务：

- 为 state 补齐颜色定义
- 增加 state 列表、搜索、编辑入口
- 展示 state 的 readers / writers
- 保持节点库搜索和建点入口稳定

完成标准：

- 左侧能同时查看 state 和 nodes
- state 不再只作为节点配置里的附属字段存在

## Phase 2 Boundary Model and Graph Semantics

目标：

- 让画布更像 state processing graph，而不是普通流程图

任务：

- 把前端边界模型切到 `Input / Output Boundary`
- 强化节点输入输出布局
- 收紧逐项 state 连线规则
- 定义前后端编译映射
- 为关键参数补 socket 覆盖本地值规则

完成标准：

- 用户能一眼看懂某节点读什么、写什么
- 用户能通过逐项连线读懂主要 state flow
- 用户不必直接理解 `START / END`
- 关键节点参数可通过连接覆盖 widget 本地值

## Phase 3 Inspector and Runtime Visibility

目标：

- 点击节点就能理解这个节点最近一次运行做了什么

任务：

- 完善 node inspector
- 接入节点级执行结果
- 增加 `Changed Outputs`
- 显示 run 状态、错误、警告和最终结果
- 把输出边界预览与保存信息整理进节点级视图

完成标准：

- editor 内即可查看节点级执行结果
- 不需要跳出到 run detail 才知道节点产出

## Phase 4 Hello World Closure

目标：

- 用 `hello_world` 验证整条链路

任务：

- 定义输入与输出边界
- 建最小图
- 配置输入参数
- Save / Validate / Run
- 在 editor 内查看 greeting
- 验证前端边界模型可被编译为后端 LangGraph

完成标准：

- `hello_world` 能稳定跑通
- editor 与后端模型调用闭环明确

## Phase 5 Cleanup and Expansion

目标：

- 在闭环稳定后再考虑扩展能力

任务：

- 收口 state color 的正式持久化位置
- 收口 template 与 graph 初始化逻辑
- 继续梳理 settings 中的旧概念
- 评估后续 Node Picker / advanced debugger / subgraph

## 5. Priority Order

当前推荐顺序：

1. Phase 2 Boundary Model and Graph Semantics
2. Phase 3 Inspector and Runtime Visibility
3. Phase 4 Hello World Closure
4. Phase 5 Cleanup and Expansion

## 6. Milestone Definition

## M1 State-Aware Shell

完成条件：

- 左侧存在清晰的 `State Panel`
- state 可见、可编辑、可着色
- 节点库与 state 面板分区明确

## M2 Readable Processing Graph

完成条件：

- 节点输入输出表达明确
- 逐项 state 连线可读
- `condition` 语义明确
- 边界模型明确

## M3 Observable Runtime

完成条件：

- 节点运行结果可在 editor 内查看
- run 状态和错误可见

## M4 Hello World Pass

完成条件：

- 新 editor 创建的 `hello_world` 图可保存、校验、运行
- greeting 在 editor 内可见
- 前端边界模型可稳定编译为后端 LangGraph

## 7. Risks

当前主要风险：

1. 过度把 edge 当成数据实体，导致 editor 语义偏离 LangGraph
2. state color 若只做前端临时字段，后续可能出现持久化断层
3. 若前端边界模型与后端编译规则不清晰，会导致前后端模型漂移

对应策略：

- 明确 edge 只是 route + visual hint
- 尽早确定 state color 的正式承载位置
- 先定义清楚前端 Input/Output 与后端 START/END 的转换规则

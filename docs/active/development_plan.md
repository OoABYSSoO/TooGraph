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

当前代码与新目标之间的主要差距：

- 左侧尚未形成真正的 `State Panel + Node Palette`
- state 还不是 editor 的一等对象
- 节点输入输出表达还不够强
- 边标签还没有形成稳定的 state flow 语义
- 节点运行结果展示还不够完整
- `hello_world` 闭环需要按新心智再收紧一次

## 3. Strategy

执行策略：

1. 先把编辑器语义做对
2. 再把 `hello_world` 跑通
3. 最后再做扩展体验

明确禁止：

- 在核心语义没稳定前，优先做大量样式微调
- 在 state model 没定清楚前，继续堆复杂交互
- 在 `hello_world` 没闭环前，继续扩模板能力

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

## Phase 2 Node and Edge Semantics

目标：

- 让画布更像 state processing graph，而不是普通流程图

任务：

- 强化节点输入输出布局
- 区分 `start` / `condition` / `end`
- 收紧边标签显示规则
- 让 `flow_keys` 表达稳定可读

完成标准：

- 用户能一眼看懂某节点读什么、写什么
- 用户能通过边标签读懂主要 state flow

## Phase 3 Inspector and Runtime Visibility

目标：

- 点击节点就能理解这个节点最近一次运行做了什么

任务：

- 完善 node inspector
- 接入节点级执行结果
- 增加 `Changed Outputs`
- 显示 run 状态、错误、警告和最终结果

完成标准：

- editor 内即可查看节点级执行结果
- 不需要跳出到 run detail 才知道节点产出

## Phase 4 Hello World Closure

目标：

- 用 `hello_world` 验证整条链路

任务：

- 建最小图
- 配置输入参数
- Save / Validate / Run
- 在 editor 内查看 greeting
- 检查 `end` 汇总状态

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

1. Phase 1 State Model and Left Rail
2. Phase 2 Node and Edge Semantics
3. Phase 3 Inspector and Runtime Visibility
4. Phase 4 Hello World Closure
5. Phase 5 Cleanup and Expansion

## 6. Milestone Definition

## M1 State-Aware Shell

完成条件：

- 左侧存在清晰的 `State Panel`
- state 可见、可编辑、可着色
- 节点库与 state 面板分区明确

## M2 Readable Processing Graph

完成条件：

- 节点输入输出表达明确
- 边标签可读
- `condition` 和 `end` 语义明确

## M3 Observable Runtime

完成条件：

- 节点运行结果可在 editor 内查看
- run 状态和错误可见

## M4 Hello World Pass

完成条件：

- 新 editor 创建的 `hello_world` 图可保存、校验、运行
- greeting 在 editor 内可见

## 7. Risks

当前主要风险：

1. 过度把 edge 当成数据实体，导致 editor 语义偏离 LangGraph
2. state color 若只做前端临时字段，后续可能出现持久化断层
3. 若节点 IO 表达做得太复杂，会把第一阶段拖进“端口系统设计”泥潭

对应策略：

- 明确 edge 只是 route + visual hint
- 尽早确定 state color 的正式承载位置
- 第一阶段先做清晰可读，不做复杂端口拓扑

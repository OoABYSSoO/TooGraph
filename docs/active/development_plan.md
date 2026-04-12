# State-Aware Editor Development Plan

## 1. Purpose

本文件定义当前 editor 的执行计划。

它不再复述旧 editor 已实现什么，而是围绕新的 state-aware editor 目标，给出清晰的开发顺序、阶段目标和验收标准。

## 2. Current Baseline

当前代码已具备的基础：

- 前后端开发环境可启动（`./scripts/start.sh`，前端 3477 / 后端 8765）
- graph 保存、校验、运行接口可用
- `hello_world` 与 `creative_factory` 两个模板存在，均由后端 `default_node_system_graph` 提供
- `/editor`、`/editor/new`、`/editor/[graphId]` 路由已接回
- 画布、缩放、平移、Mini Map、基础建点、基础连线已存在
- 左侧已有 `Node Palette`
- 节点已切到单行横向布局
- 前端以 `Input Boundary / Agent Node / Condition Node / Output Boundary` 四类原型为主
- `Input Boundary` 节点本体内直接提供可编辑文本框
- `Output Boundary` 支持运行后预览，正确展示提取后的文本字段（不显示原始 JSON）
- 节点支持手动 resize，尺寸随 Save 持久化，minHeight 按节点类型约束防止内容截断
- 模板新建时按实际渲染宽度自动对齐节点水平间距（gap=80px）
- agent 节点执行后 LLM JSON 响应被正确解析，按 output key 分字段提取
- Save / Validate / Run 已接通
- preset 持久化已接通（前端可另存为 preset，后端 `/api/presets` 可用）
- skill definitions API（`/api/skills/definitions`）已接通

当前代码与新目标之间的主要差距：

- `State Panel` 与 state 一等对象表达尚未落地
- 参数级 socket 仍未成为真实能力，当前仍以节点级 ports 为主
- 节点运行结果视图仍需进一步完善，editor 内尚未直接展示 `NodeExecutionDetail`
- `condition` 节点的结构化编辑器仍需收口
- `hello_world` 闭环验收需在最新代码上重新跑一遍

## 2.1 Current Progress

当前阶段已经完成的里程碑：

- `M1 State-Aware Shell` 尚未完成
- `M2 Readable Processing Graph` 已完成
- `M3 Observable Runtime` 已基本完成
- `M4 Hello World Pass` 已基本通过（后端调用链路通，输出正确展示）

已经稳定落地的部分：

- preset-driven node editor 主链已经可运行
- 前端边界模型与后端 node system runtime 已存在可运行映射
- LLM JSON 响应解析层已修复，输出节点展示提取后的字段值
- 节点可手动 resize 并持久化，各类型有合理的 minHeight 约束
- 模板新建时节点自动按实际宽度排列，视觉间距一致
- `hello_world` 与 `creative_factory` 两个模板都可由后端模板 API 提供

## 2.2 Current Focus

当前开发聚焦：

1. `State Panel` 与 state-aware 语义真正落地
2. 参数 socket 通用化
3. editor 内节点级运行结果视图补全
4. `hello_world` 完整闭环验收

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

当前状态：

- 该阶段目标尚未完成
- 当前左侧仅稳定提供 `Node Palette`

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

当前状态：

- 边界节点与基础可读性已初步建立
- 参数级 socket 覆盖本地值仍未完成

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

当前状态：

- 输出节点 preview 与 run link 已有
- 完整节点执行结果仍主要在 `/runs/[runId]` 查看

## Phase 4 Hello World Closure

目标：

- 用 `hello_world` 验证整条链路

任务：

- 定义输入与输出边界
- 建最小图
- 配置输入参数
- Save / Validate / Run
- 在 editor 内查看 answer
- 验证前端边界模型可被编译为后端 LangGraph

完成标准：

- `hello_world` 能稳定跑通
- editor 与后端模型调用闭环明确

当前状态：

- 模板、保存、校验、运行链路已具备
- 最新代码上的人工闭环验收仍待补跑

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
2. Phase 2 Boundary Model and Graph Semantics
3. Phase 3 Inspector and Runtime Visibility
4. Phase 4 Hello World Closure
5. Phase 5 Cleanup and Expansion

## 6. Milestone Definition

## M1 State-Aware Shell

完成条件：

- 左侧存在清晰的 `State Panel`
- state 可见、可编辑、可着色
- 节点库与 state 面板分区明确

当前判断：

- 未完成

## M2 Readable Processing Graph

完成条件：

- 节点输入输出表达明确
- 逐项 state 连线可读
- `condition` 语义明确
- 边界模型明确

当前判断：

- 基本完成，但仍偏原型态

## M3 Observable Runtime

完成条件：

- 节点运行结果可在 editor 内查看
- run 状态和错误可见

当前判断：

- 部分完成
- run 结果可回填到输出节点，但完整节点级执行详情未内嵌到 editor

## M4 Hello World Pass

完成条件：

- 新 editor 创建的 `hello_world` 图可保存、校验、运行
- answer 在 editor 内可见
- 前端边界模型可稳定编译为后端 LangGraph

当前判断：

- 接近完成
- 仍需补最新代码上的人工验收

## 7. Risks

当前主要风险：

1. 过度把 edge 当成数据实体，导致 editor 语义偏离 LangGraph
2. state color 若只做前端临时字段，后续可能出现持久化断层
3. 若前端边界模型与后端编译规则不清晰，会导致前后端模型漂移

对应策略：

- 明确 edge 只是 route + visual hint
- 尽早确定 state color 的正式承载位置
- 先定义清楚前端 Input/Output 与后端 START/END 的转换规则

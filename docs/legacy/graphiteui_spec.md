# GRAPHITEUI_SPEC.md

## 1. 文档目的

本文档定义 **GraphiteUI** 的产品范围、页面范围、核心功能、系统边界和交付标准。

本文档不在文件名中标注 V1，但内容只覆盖 **当前第一阶段可交付能力边界**，不讨论未来扩展版本。

---

## 2. 产品定义

**GraphiteUI** 是一个面向 LangGraph Agent Workflow 的可视化编排工作台。

它的核心目标不是提供一个聊天界面，而是让用户能够：

- 通过可视化节点与连线定义任务流
- 在工作台中查看最近图、最近运行和系统状态
- 运行图并观察执行状态
- 查看节点级执行摘要和最终结果
- 回看历史运行记录
- 查看知识库和记忆内容

GraphiteUI 由三部分构成：

1. **Workspace（工作台）**：总览、入口、最近运行和资产导航
2. **Editor（编排器）**：拖拽节点、连线、配置、校验、运行
3. **Runtime（后端运行时）**：图校验、图转 workflow、LangGraph 执行、状态记录、产物沉淀

---

## 3. 当前交付边界

当前阶段必须完成以下闭环：

1. 用户能创建或打开一个 graph
2. 用户能在 editor 中拖拽节点、连线并配置参数
3. 用户能保存 graph，并重新加载 graph
4. 用户能校验 graph 是否合法
5. 用户能运行 graph
6. 用户能看到当前运行节点和各节点状态
7. 用户能查看节点执行摘要和整体产物
8. 用户能在 workspace 和 runs 页面回看历史运行
9. 用户能查看知识库和记忆内容

---

## 4. 不在当前交付范围内的能力

以下内容不在当前交付范围内：

- 自然语言自动生成完整 graph
- 自动推导完整 state schema
- 双向无损 Python 编译
- 子图 / Subgraph
- 复杂断点调试
- 在线修改 state 后继续执行
- 多人协作编辑
- 插件系统
- 多 Agent 协同
- 云端分布式调度

---

## 5. 目标用户

### 5.1 主要用户

- AI 应用工程师
- Agent workflow 设计者
- 希望展示可编排 Agent 能力的候选人

### 5.2 用户目标

- 快速搭建一个可执行 workflow
- 理解 workflow 的执行路径
- 对节点进行配置与调试
- 查看执行过程而不是只看最终结果
- 沉淀 graph、run、知识和记忆资产

---

## 6. 产品信息架构

GraphiteUI 当前固定页面如下：

1. `/` 首页
2. `/workspace` 工作台
3. `/editor/[graphId]` 编排器
4. `/runs` 运行记录列表
5. `/runs/[runId]` 运行详情
6. `/knowledge` 知识库
7. `/memories` 记忆页
8. `/settings` 设置页

---

## 7. 页面职责划分

## 7.1 首页 `/`

### 作用
项目入口和定位说明。

### 必须展示
- 产品名称
- 产品一句话介绍
- 核心能力卡片
- 进入工作台按钮

---

## 7.2 工作台 `/workspace`

### 作用
控制台和总览页面。

### 必须展示
- Recent Graphs
- Recent Runs
- Running Jobs
- Failed Runs
- 模板入口或 Quick Actions

### 关键要求
工作台**集成编排入口**，但不承担完整拖拽编辑职责。

用户可以在这里：
- 新建 graph
- 打开已有 graph 到 editor
- 查看最近运行状态
- 跳转运行详情

---

## 7.3 编排器 `/editor/[graphId]`

### 作用
GraphiteUI 的核心页面，承载可视化编排能力。

### 必须包含
- 左侧节点面板
- 中间画布
- 右侧节点配置面板
- 顶部工具栏
- 运行状态展示区

### 必须支持
- 拖拽节点
- 连线
- 删除节点/边
- 配置节点参数
- Validate Graph
- Save Graph
- Run Graph
- 节点状态高亮
- 查看节点执行摘要

---

## 7.4 运行记录页 `/runs`

### 作用
查看历史执行记录。

### 必须展示
- run_id
- graph name
- status
- revision_count
- created_at
- duration
- final_score（若有）

### 必须支持
- 搜索 graph name
- 筛选 status

---

## 7.5 运行详情页 `/runs/[runId]`

### 作用
查看某次 workflow 的执行过程。

### 必须展示
- run 基本信息
- 当前节点或最终状态
- 节点时间线
- 节点执行摘要
- warnings / errors
- artifacts 摘要

---

## 7.6 知识库页 `/knowledge`

### 必须支持
- 列表展示
- 搜索
- 查看知识详情

---

## 7.7 记忆页 `/memories`

### 必须支持
- 列表展示
- 按 memory_type 过滤
- 查看记忆详情

---

## 7.8 设置页 `/settings`

### 当前要求
可以只读，但必须展示：
- 模型配置
- revision 配置
- evaluator 配置
- skill 状态

---

## 8. 图模型范围

当前阶段固定支持以下节点类型：

1. Start / Input Node
2. Knowledge Retrieval Node
3. Memory Loader Node
4. Planner Node
5. Skill Executor Node
6. Evaluator Node
7. Finalizer Node

固定支持以下边类型：

1. Normal Edge
2. Conditional Edge

Conditional Edge 只允许以下条件标签：
- pass
- revise
- fail

---

## 9. 核心能力需求

## FR-1 Graph 创建与保存
用户必须能够：
- 新建 graph
- 编辑 graph
- 保存 graph
- 加载 graph

## FR-2 Graph 可视化编排
用户必须能够：
- 拖拽节点
- 连线
- 选中节点并编辑参数
- 删除节点和边

## FR-3 Graph 校验
系统必须能够校验 graph 是否合法，并返回 issues。

## FR-4 Graph 运行
系统必须支持将 graph 提交到后端运行时执行，并返回 run_id。

## FR-5 运行状态可视化
系统必须显示：
- 当前运行节点
- 每个节点的状态
- run 整体状态

## FR-6 节点结果查看
点击节点后必须能够查看：
- input summary
- output summary
- duration
- warnings
- errors

## FR-7 历史运行记录
系统必须支持查看历史 runs。

## FR-8 知识与记忆查看
系统必须支持查看知识库和记忆内容。

---

## 10. 后端责任边界

后端运行时负责：

- graph 校验
- graph 转 workflow config
- workflow config 转 LangGraph graph
- 节点执行
- evaluator 执行
- revision loop
- run trace 存储
- artifact 存储
- current node 和 node status 返回

前端不负责解释执行 graph。

---

## 11. 当前阶段成功标准

满足以下条件即可视为当前阶段完成：

1. 能从 workspace 新建或打开一个 graph
2. 能在 editor 中完成节点拖拽、连线和参数配置
3. 能校验并保存 graph
4. 能运行 graph 并拿到 run_id
5. 能在 editor 或 runs detail 中看到节点级状态
6. 能查看节点执行摘要
7. 能在 runs 页面看到历史运行记录
8. knowledge 和 memories 页面有真实内容

---

## 12. 当前阶段一票否决项

出现以下任一情况则视为当前阶段未完成：

1. 只能画图，不能运行
2. 只能运行，不能看到节点状态
3. 只能看到最终结果，不能看到节点执行摘要
4. 没有 graph 保存/加载能力
5. workspace、editor、runtime 职责混乱，无法清楚解释


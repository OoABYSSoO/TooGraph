# Editor Rebuild Requirements

## 1. Purpose

本文件定义下一轮编排器开发的唯一实施依据。目标是实现一个稳定、可扩展、面向产品使用的可视化编排器。

边界：

- 编排器按新需求直接开发。
- 前端图结构可以重新设计。
- 新编排器需要兼容当前后端系统的保存、校验、运行和结果读取能力。
- 保留 `demo/slg_langgraph_single_file_modified_v2.py`，但新 editor 不得依赖该单文件。

## 2. Rebuild Goals

新 editor 必须优先满足以下硬要求：

1. 画布必须一眼可识别，具备明显的网格或点阵背景。
2. 画布必须支持鼠标滚轮缩放。
3. 节点列表必须支持拖拽建点，同时保留点击建点。
4. 新 editor 必须能跑通 `hello_world` 图，用于验证从前端编排到后端本地模型调用的完整闭环。

## 3. Product Scope

第一阶段只做以下范围：

- 编排器入口页
- 空白画布页
- 节点列表
- 画布交互
- Save / Validate / Run
- `hello_world` 新图可运行

第一阶段明确不做：

- 连线到空白处弹 `Node Picker`
- 子图
- 协作
- 撤销重做历史
- 高级调试器
- 多模板复杂切换策略

## 4. Information Architecture

### 4.1 Routes

- `/editor`
  - 编排器入口页
  - 提供：
    - `新建空白图`
    - `打开已有图`

- `/editor/new`
  - 空白图编辑页

- `/editor/[graphId]`
  - 已保存图编辑页

### 4.2 Screen Layout

重构后的 editor 必须采用 `canvas-first` 布局：

- 顶部：窄工具栏
- 左侧：可折叠节点面板
- 中央：全尺寸画布
- 右侧：可折叠检查器面板
- 右下：固定缩略图
- 左下：轻量状态条

## 5. Interaction Requirements

### 5.1 Canvas

画布必须满足：

- 默认全屏占据主工作区
- 背景为清晰可见的点阵或网格
- 允许鼠标拖动画布
- 允许鼠标滚轮缩放
- 支持 `fit view`
- 支持最小/最大缩放范围

空白画布状态必须显示：

- 明确的 `Empty Canvas` 提示
- 提示用户从左侧拖入节点或点击节点卡片

### 5.2 Mini Map

缩略图必须满足：

- 始终固定在右下角
- 不得被右侧检查器遮挡
- 空图时也要能明确看到缩略图卡片本身
- 有标题，例如 `Mini Map`
- 支持拖动缩略图视口

实现要求：

- 不依赖模糊的默认 React Flow 样式
- 必须有独立边框、背景和阴影

### 5.3 Node Palette

左侧节点列表必须满足：

- 支持搜索
- 支持滚动
- 支持点击建点
- 支持拖拽建点
- 节点卡片必须有明确的拖拽光标反馈

节点卡片至少显示：

- 节点名称
- 节点类型
- 节点一句话说明

### 5.4 Node Creation

第一阶段建点方式：

- 点击节点卡片：
  - 在默认可见区域创建节点
  - 自动选中新节点

- 拖拽节点卡片到画布：
  - 在落点位置创建节点
  - 视野自动对准新节点
  - 画布在 drag over 时显示高亮落区反馈

### 5.5 Inspector

右侧检查器第一阶段只做最小必需项：

- 未选中节点：显示图级信息
- 选中节点：显示节点基本信息和参数
- 选中边：显示边基本信息

第一阶段不要求恢复旧版复杂 inspector。

### 5.6 Toolbar

顶部工具栏必须包含：

- Graph name
- Save
- Validate
- Run
- Fit View

要求：

- 高度尽量压薄
- 不占用过多垂直空间

## 6. Hello World Validation Flow

`hello_world` 是第一阶段唯一必须跑通的验证任务。

### 6.1 Functional Goal

用户输入一个名字，后端通过本地 OpenAI-compatible 模型服务生成输出：

- `Hello, <name>`

### 6.2 Required Flow

1. 打开 `/editor/new`
2. 在新 editor 中创建最小 `hello world` 图
3. 输入名字参数
4. 点击 `Run`
5. 后端运行图
6. 前端能看到 run 成功
7. 最终结果中能读到 greeting

### 6.3 Acceptance

满足以下即视为通过：

- 页面能打开
- 图能保存
- 图能运行
- 本地模型请求成功
- 结果可见

## 7. Technical Constraints

### 7.1 Frontend

保留以下技术栈：

- Next.js
- TypeScript
- React Flow
- Zustand 仅在确有必要时引入
- Tailwind CSS

原则：

- 先用最少状态完成可用 editor
- 不要把旧 editor 的状态模型整体搬回来
- 先做小而稳的交互闭环

### 7.2 Backend

保留以下后端基础：

- FastAPI
- LangGraph
- SQLite
- `hello_world` 运行能力

原则：

- editor 重构阶段优先复用现有后端接口
- 非必要不同时重写后端

## 8. Implementation Plan

### Phase 1: Shell

目标：

- 提供干净的 editor 入口与页面骨架

完成标准：

- `/editor`、`/editor/new`、`/editor/[graphId]` 具备清晰页面结构

### Phase 2: New Canvas Base

目标：

- 从零实现最小可用画布

任务：

- 新建 editor 画布页面骨架
- 加入点阵/网格背景
- 实现滚轮缩放
- 实现画布拖动
- 实现右下固定缩略图

完成标准：

- 空白图页面具备明显画布感
- 画布可平移、可缩放、可通过缩略图观察范围

### Phase 3: Node Palette

目标：

- 实现节点列表和建点交互

任务：

- 节点搜索
- 点击建点
- 拖拽建点
- 拖拽落区高亮
- 新节点自动选中

完成标准：

- 用户不需要任何临时按钮即可创建节点

### Phase 4: Hello World Runtime Loop

目标：

- 跑通第一个完整闭环

任务：

- 接回保存
- 接回校验
- 接回运行
- 接回 run 结果展示

完成标准：

- 新 editor 创建的 `hello world` 图可运行成功

### Phase 5: Reintroduce Advanced Features

第二阶段才允许逐步加入：

- 更复杂 inspector
- state panel
- theme panel
- edge editing
- 拖线创建节点
- condition 节点体验增强

原则：

- 只有 Phase 2 到 Phase 4 稳定后才允许继续扩展

## 9. Definition of Done

第一阶段完成的判定标准：

- `/editor/new` 可打开
- 画布有清晰背景
- 鼠标滚轮可缩放
- 画布可拖动
- 缩略图固定可见
- 节点列表可搜索
- 节点可点击创建
- 节点可拖拽创建
- 新建的 `hello world` 图可运行成功
- 前端构建通过
- 后端编译通过

## 10. Explicit Non-Goals

第一阶段明确不做：

- 子图
- 协作
- 复杂调试器
- 模板推荐系统

第一阶段必须遵守：

- 先做稳定交互，再做复杂能力

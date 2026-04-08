# GraphiteUI Framework Rebuild Task Plan

## 1. 文档目的

本文档是 GraphiteUI 在 **不兼容旧图文件、允许大胆重构** 前提下的具体开发任务书。

这份文档不再讨论“是否要兼容旧协议”。

默认前提：

- 不兼容旧 graph 文件
- 不保留旧 runtime 分支
- 不保留旧 demo 入口
- 可以重构目录结构
- 可以重命名节点、state、模板和工具
- 保留 [slg_langgraph_single_file_modified_v2.py](/home/abyss/GraphiteUI/demo/slg_langgraph_single_file_modified_v2.py) 作为独立可运行参考实现
- 任何正式程序不得依赖该单文件

目标：

**把 GraphiteUI 从“能承接 demo 的编排器”推进成“以 Core + Template + Theme 为结构的可扩展 Agent Framework”。**

---

## 2. 重构总原则

### 2.1 先清 Core，再做 Template

不要继续一边背模板逻辑、一边抽框架。

先把框架层抽干净，再让 `creative_factory` 作为第一套模板回接进去。

### 2.2 强制区分三层

所有新增代码都必须先判断属于哪一层：

- `Core`
- `Template`
- `Theme`

如果判断不清，不要直接写进 runtime 主路径。

### 2.3 不为旧命名背包袱

允许重命名：

- 节点名
- tool 名
- state key
- 目录结构
- editor UI 文案

### 2.4 模板必须通过注册系统接入

后续任何模板都不能“直接在 editor preset 里手搓一套特例逻辑”。

模板必须具备：

- 模板定义文件
- 模板注册表
- 模板加载流程

---

## 3. 最终目标状态

完成本轮重构后，仓库应达到下面这个结构目标。

### 3.1 Core 层

负责：

- graph schema
- graph validation
- graph parsing
- workflow building
- runtime execution
- node handler registry
- tool registry
- state registry
- template registry
- editor canvas
- state panel
- run detail

### 3.2 Template 层

负责：

- `creative_factory` 模板定义
- 模板节点默认链路
- 模板 state schema
- 模板主题默认值
- 模板产物结构

### 3.3 Theme 层

负责：

- `slg_launch`
- `rpg_fantasy`
- `survival_chaos`
- 未来更多 theme preset

### 3.4 Editor 层

负责：

- 选择模板创建新图
- 选择主题预设
- 调整节点顺序
- 修改节点读写 state
- 修改节点内部策略参数

---

## 4. 重构范围

## 4.1 明确保留

- FastAPI 后端主体
- Next.js 前端主体
- React Flow 画布能力
- Zustand editor store 思路
- 当前标准 graph 协议基础方向
- creative factory 作为第一模板
- `demo/slg_langgraph_single_file_modified_v2.py` 作为单文件参考实现继续保留

## 4.2 明确删除或重构

- `skills/` 继续作为主表达层的思路
- editor 中任何 “demo graph” 心智
- 模板直接写死在页面入口里的方式
- runtime 中继续堆在 `standard.py` 的大而全逻辑
- 模板逻辑和工具逻辑混在一起的结构
- 任何对 `demo/slg_langgraph_single_file_modified_v2.py` 的正式运行时依赖

## Task 0.1 明确 demo 单文件边界

优先级：`P0`

目标：

把 demo 单文件从“潜在依赖源”明确降级为“参考实现与对照样板”。

必须满足：

- demo 文件继续存在于 `demo/`
- demo 文件可单独通过 `python -m py_compile` 和独立运行方式自检
- 正式程序中不得出现对该文件的 import
- 文档中明确说明它是 reference，不是 runtime dependency

验收标准：

- `rg` 搜索代码层时，不出现对该文件的 import 依赖
- demo 文件可单独通过基础编译检查

---

## 5. Phase 1：Core 协议重整

## Task 1.1 收紧 Graph Schema

优先级：`P0`

目标：

把 graph schema 定义成真正服务于 framework core 的协议，而不是服务于单一模板的协议。

后端文件：

- [graph.py](/home/abyss/GraphiteUI/backend/app/schemas/graph.py)

前端文件：

- [editor.ts](/home/abyss/GraphiteUI/frontend/types/editor.ts)
- [graph-api.ts](/home/abyss/GraphiteUI/frontend/lib/graph-api.ts)

必须完成：

- 补齐 `template_id`
- 补齐 `theme_config`
- 补齐 `state_schema`
- 节点保留 `reads / writes / params / implementation`
- 边保留 `flow_keys / edge_kind / branch_label`
- 明确 `metadata` 的用途

验收标准：

- 前后端协议字段完全一致
- 不再出现前端 camelCase 和后端 snake_case 语义不清的问题

## Task 1.2 引入 `NodeCategory`

优先级：`P1`

目标：

为节点加一层类别信息，避免所有节点都混在同一个平面上。

建议类别：

- `core_control`
- `core_data`
- `template_stage`
- `template_output`

后端文件：

- [graph.py](/home/abyss/GraphiteUI/backend/app/schemas/graph.py)

前端文件：

- [editor.ts](/home/abyss/GraphiteUI/frontend/types/editor.ts)
- [workflow-node.tsx](/home/abyss/GraphiteUI/frontend/components/editor/workflow-node.tsx)

验收标准：

- 节点卡片可按 category 区分样式
- editor palette 可按 category 分组

## Task 1.3 引入 `StateFieldScope`

优先级：`P1`

目标：

显式区分系统状态和模板状态。

新增字段：

- `scope: system | template | run_only`

后端文件：

- [graph.py](/home/abyss/GraphiteUI/backend/app/schemas/graph.py)

前端文件：

- [editor.ts](/home/abyss/GraphiteUI/frontend/types/editor.ts)
- [state-panel.tsx](/home/abyss/GraphiteUI/frontend/components/editor/state-panel.tsx)

验收标准：

- `run_id/status/current_node_id` 这类字段明确属于 system
- `creative_brief/script_variants` 这类字段明确属于 template

---

## 6. Phase 2：目录与模块重组

## Task 2.1 重组后端目录

优先级：`P0`

目标：

把当前偏实现堆叠的结构改成更清晰的 core/template 分层。

目标目录：

```text
backend/app/
├── api/
├── core/
│   ├── schemas/
│   ├── compiler/
│   ├── runtime/
│   ├── registry/
│   └── storage/
├── templates/
│   ├── creative_factory/
│   │   ├── template.py
│   │   ├── nodes.py
│   │   ├── state.py
│   │   └── themes.py
│   └── registry.py
├── tools/
├── knowledge/
├── memory/
└── main.py
```

当前建议迁移：

- `schemas/` -> `core/schemas/`
- `compiler/` -> `core/compiler/`
- `runtime/` -> `core/runtime/`
- `storage/` -> `core/storage/`

验收标准：

- 模板相关文件不再混在 core runtime 里
- `demo/` 目录保持独立，不出现在 `backend/app` 的运行依赖链中

## Task 2.2 拆分 runtime handlers

优先级：`P0`

目标：

把 [standard.py](/home/abyss/GraphiteUI/backend/app/runtime/handlers/standard.py) 拆成可持续维护的模块。

建议拆分：

- `core/runtime/handlers/control.py`
- `templates/creative_factory/handlers/research.py`
- `templates/creative_factory/handlers/assets.py`
- `templates/creative_factory/handlers/generation.py`
- `templates/creative_factory/handlers/review.py`
- `templates/creative_factory/handlers/output.py`

验收标准：

- 不再存在一个大文件承担整套模板逻辑

## Task 2.3 缩减 `skills/`

优先级：`P1`

目标：

让 `skills/` 只承担极少量独立 helper，不再承担主运行逻辑。

建议：

- 移除 `skills/` 对主流程的参与
- 保留时也只作为二级封装
- 设置页不再把 `skills` 当主能力列表展示

验收标准：

- runtime 主链只依赖 handler registry + tool registry

---

## 7. Phase 3：模板系统一等公民化

## Task 3.1 引入 Template Registry

优先级：`P0`

目标：

模板不能只存在于前端 `editor-presets.ts`。

必须有后端模板注册中心。

新增文件：

- `backend/app/templates/registry.py`

接口职责：

- 列出所有模板
- 根据 `template_id` 返回模板定义
- 返回模板默认 graph
- 返回模板默认 state schema
- 返回模板默认 theme presets

验收标准：

- 前端创建新图时可以从后端读取模板列表

## Task 3.2 抽出 `creative_factory` 模板定义

优先级：`P0`

目标：

把当前散落在前后端的 `creative factory` 默认逻辑集中起来。

新增文件：

- `backend/app/templates/creative_factory/template.py`
- `backend/app/templates/creative_factory/state.py`
- `backend/app/templates/creative_factory/themes.py`
- `frontend/lib/templates/creative-factory.ts`

模板定义必须包含：

- 默认节点列表
- 默认边列表
- 默认 state schema
- 默认 graph 名
- 默认 theme presets

验收标准：

- 前后端都通过模板定义生成默认图
- 不再在多个文件里重复维护同一套节点链
- 模板定义来源于框架内部模板文件，而不是来源于 demo 单文件

## Task 3.3 新建模板创建流程

优先级：`P1`

目标：

支持从模板创建图，而不是只能打开固定 graph id。

前端改造点：

- 首页
- 工作台快捷入口
- editor 初始化逻辑

新增交互：

- “Create from Template”
- 选择模板
- 选择 theme preset
- 创建图实例

验收标准：

- `/editor/creative-factory` 不再是唯一创建路径
- 模板成为创建入口的一等公民

---

## 8. Phase 4：Theme 系统升级

## Task 4.1 Theme Config Panel 结构化

优先级：`P0`

目标：

当前 editor 顶部的 theme 区还偏“散字段输入框”。

需要升级成结构化策略面板。

前端文件：

- [editor-workbench.tsx](/home/abyss/GraphiteUI/frontend/components/editor/editor-workbench.tsx)
- 新增 `theme-config-panel.tsx`

分区建议：

- Basic
- Market
- Style
- Evaluation
- Strategy Profile

Strategy Profile 必须显式可编辑：

- `hookTheme`
- `payoffTheme`
- `visualPattern`
- `pacingPattern`
- `evaluationFocus`

验收标准：

- 用户不需要直接改 JSON 就能调整主题策略

## Task 4.2 Theme Preset Registry

优先级：`P1`

目标：

让 theme preset 也从“前端写死数组”进化成注册系统。

新增文件：

- `backend/app/templates/creative_factory/themes.py`
- `frontend/lib/theme-presets.ts`

必须支持：

- 列表
- 获取默认 preset
- 复制 preset
- 保存自定义 preset

验收标准：

- preset 可以从模板定义加载
- 前端不再硬编码所有 preset

## Task 4.3 Theme 覆盖优先级规则

优先级：`P1`

目标：

明确：

- 模板默认值
- preset 值
- 用户手动改值

三者之间谁覆盖谁。

建议规则：

1. 模板默认值
2. preset 覆盖
3. 用户修改最终生效

验收标准：

- 切 preset 时不会意外抹掉用户已手调字段

---

## 9. Phase 5：Node 与 Tool 的进一步抽象

## Task 5.1 建立 Core Node Set

优先级：`P1`

目标：

开始把模板节点往通用节点抽象，而不是让 framework 永远只长创意工厂节点。

建议第一批 core nodes：

- `start`
- `end`
- `condition`
- `fetch`
- `analyze`
- `transform`
- `generate`
- `review`
- `export`

说明：

- 不是要求立刻替换掉现有模板节点
- 而是建立未来的通用方向

验收标准：

- 文档中明确 core node 和 template node 的边界
- 至少有 1 到 2 个 creative factory 节点能映射到 core node 语义

## Task 5.2 Tool 能力标准化命名

优先级：`P1`

目标：

统一工具命名规范，避免一部分叫业务名，一部分叫动作名。

命名建议：

- 动词 + 对象
- 不带具体题材词

例子：

- `fetch_market_news_context`
- `normalize_asset_records`
- `generate_storyboard_packages`

验收标准：

- tools registry 中不再出现不一致命名风格

## Task 5.3 Node Implementation 声明化

优先级：`P1`

目标：

让节点自己声明它如何执行，而不是完全依赖隐式 handler 推断。

建议字段：

- `implementation.executor`
- `implementation.handler_key`
- `implementation.tool_keys`
- `implementation.template_namespace`

验收标准：

- 图协议本身能说明节点归属哪个执行域

---

## 10. Phase 6：Editor 交互升级

## Task 6.1 Palette 分层

优先级：`P0`

目标：

Palette 不再是一串平铺节点。

要分成：

- Core Nodes
- Template Nodes
- Utilities

前端文件：

- [editor-workbench.tsx](/home/abyss/GraphiteUI/frontend/components/editor/editor-workbench.tsx)

验收标准：

- 用户能明确区分“框架节点”和“模板节点”

## Task 6.2 Start / End Source-Sink 强化

优先级：`P0`

目标：

让 Start 真正像 state source，End 真正像 state sink。

必须实现：

- Start 显示初始状态项
- End 显示最终导出状态项
- 新增 state key 时可选择是否暴露给 Start / End

验收标准：

- 画布上能更直观看到输入输出边界

## Task 6.3 节点顺序重排体验

优先级：`P1`

目标：

用户可以方便调整节点顺序，而不是每次都手拉线。

可选实现：

- 插入节点按钮
- 自动重排布局
- 在边上插入节点

验收标准：

- 至少支持“在两节点之间插入一个新节点”

## Task 6.4 边的 bus 视图

优先级：`P1`

目标：

把边从“普通线”进一步升级成“携带 flow keys 的可视化总线”。

必须支持：

- 显示主要 `flow_keys`
- branch edge 特殊样式
- hover 后展示完整 keys

验收标准：

- 用户能看懂每条边在传什么

---

## 11. Phase 7：运行与观测升级

## Task 7.1 Run State 精简与分层

优先级：`P0`

目标：

将当前 run detail 中混杂的字段整理为：

- system state
- business state
- artifacts
- execution trace

后端文件：

- [run.py](/home/abyss/GraphiteUI/backend/app/schemas/run.py)
- [executor.py](/home/abyss/GraphiteUI/backend/app/runtime/executor.py)

验收标准：

- `RunDetail` 结构更清晰
- 前端不需要猜某字段应去哪里取

## Task 7.2 Node Execution Trace 细化

优先级：`P1`

目标：

每个节点执行记录里补更多结构化信息：

- input keys
- output keys
- artifacts summary
- warnings
- errors
- decision basis

验收标准：

- 点击节点时不只看到一段摘要文本

## Task 7.3 Polling / Live Run View

优先级：`P1`

目标：

编辑器运行后支持持续更新，而不是只拉一次详情。

前端文件：

- [editor-workbench.tsx](/home/abyss/GraphiteUI/frontend/components/editor/editor-workbench.tsx)

验收标准：

- 点击 Run 后，节点状态可以逐步变化

---

## 12. 建议的实际实施顺序

如果现在立刻开工，我建议严格按下面顺序做：

1. `Task 2.1` 后端目录重组
2. `Task 3.1` Template Registry
3. `Task 3.2` 抽出 `creative_factory` 模板
4. `Task 4.1` Theme Config Panel 结构化
5. `Task 6.1` Palette 分层
6. `Task 7.1` Run State 分层
7. `Task 6.3` 节点顺序重排
8. `Task 4.2` Theme Preset Registry
9. `Task 5.1` Core Node Set
10. `Task 7.3` Live Run View

---

## 13. 第一批必须落地的文件变更

### 后端

- [main.py](/home/abyss/GraphiteUI/backend/app/main.py)
- [graph.py](/home/abyss/GraphiteUI/backend/app/schemas/graph.py)
- [run.py](/home/abyss/GraphiteUI/backend/app/schemas/run.py)
- [graph_parser.py](/home/abyss/GraphiteUI/backend/app/compiler/graph_parser.py)
- [validator.py](/home/abyss/GraphiteUI/backend/app/compiler/validator.py)
- [workflow_builder.py](/home/abyss/GraphiteUI/backend/app/compiler/workflow_builder.py)
- [executor.py](/home/abyss/GraphiteUI/backend/app/runtime/executor.py)
- [registry.py](/home/abyss/GraphiteUI/backend/app/runtime/registry.py)
- [standard.py](/home/abyss/GraphiteUI/backend/app/runtime/handlers/standard.py)

### 前端

- [editor.ts](/home/abyss/GraphiteUI/frontend/types/editor.ts)
- [graph-api.ts](/home/abyss/GraphiteUI/frontend/lib/graph-api.ts)
- [editor-presets.ts](/home/abyss/GraphiteUI/frontend/lib/editor-presets.ts)
- [editor-store.ts](/home/abyss/GraphiteUI/frontend/stores/editor-store.ts)
- [editor-workbench.tsx](/home/abyss/GraphiteUI/frontend/components/editor/editor-workbench.tsx)
- [state-panel.tsx](/home/abyss/GraphiteUI/frontend/components/editor/state-panel.tsx)
- [workflow-node.tsx](/home/abyss/GraphiteUI/frontend/components/editor/workflow-node.tsx)
- [workflow-edge.tsx](/home/abyss/GraphiteUI/frontend/components/editor/workflow-edge.tsx)

---

## 14. 重构完成的判断标准

这一轮重构完成时，应满足下面这些条件：

1. 框架层和模板层在目录和代码职责上已经分开。
2. `creative_factory` 不再散落在多个文件里，而是模板一等公民。
3. theme preset 不再只是前端数组，而是有注册和覆盖机制。
4. editor 可以通过模板创建、选择主题、编排节点、调整顺序。
5. runtime 结果能够清楚区分系统状态、模板状态和产物。
6. 后续新增第二个模板时，不需要再复制一套 creative factory 逻辑。

---

## 15. 当前最值得马上执行的 3 个任务

如果只做三件事，我建议直接做这三个：

1. `Task 2.1` 后端目录重组
2. `Task 3.1` + `Task 3.2` 模板注册与 `creative_factory` 抽离
3. `Task 4.1` 主题配置面板结构化

这三步做完，GraphiteUI 才会真正从“单模板可运行系统”进入“可扩展 framework”轨道。

# GraphiteUI Development Plan

## 1. 文档目的

这份文档记录 **当前代码已经实现的能力**、**当前真实存在的缺口** 和 **接下来应该继续推进的事项**。

这不是历史规划复述，而是基于当前仓库代码的状态同步文档。

---

## 2. 当前代码状态

截至当前版本，GraphiteUI 已进入：

**标准协议 + creative factory 模板 + 可执行运行链 + Tailwind/语义组件化前端**

当前代码中已经明确实现的能力：

- 前后端均可启动，开发脚本可用，默认端口：
  - 前端 `3477`
  - 后端 `8765`
- 后端 API 已包含：
  - `/health`
  - `/api/graphs`
  - `/api/runs`
  - `/api/knowledge`
  - `/api/memories`
  - `/api/settings`
  - `/api/templates`
- 标准 graph 协议已落地，核心字段包括：
  - `template_id`
  - `theme_config`
  - `state_schema`
  - 节点 `reads / writes / params`
  - 边 `flow_keys / edge_kind / branch_label`
- graph 已支持：
  - `validate`
  - `save`
  - `load`
  - `list`
  - `run`
- 后端已使用 SQLite 持久化 `graphs / runs`
  - 数据库文件：`backend/data/graphiteui.db`
  - 历史 `graphs/*.json`、`runs/*.json` 会自动导入
- 后端 `core/` 分层已建立：
  - `compiler`
  - `runtime`
  - `schemas`
  - `storage`
- 模板系统已存在，当前模板注册表里实际只有一个模板：
  - `creative_factory`
- 模板 API 已能返回：
  - 模板元数据
  - `theme_presets`
  - `state_schema`
  - `default_graph`
- editor 已具备：
  - `State Panel`
  - 自定义节点卡片
  - 左入右出
  - `reads / writes` 绑定
  - 结构化参数编辑
  - 快速新增 state key
  - Validate / Save / Run
  - 节点执行摘要展示
- 前端模板路由已优先按后端模板 `default_graph` 初始化
- 主题系统已支持多个 preset，并能影响：
  - `theme_config`
  - 节点默认参数
  - creative factory 产出策略
- 页面已全部可访问：
  - `/`
  - `/workspace`
  - `/editor/[graphId]`
  - `/runs`
  - `/runs/[runId]`
  - `/knowledge`
  - `/memories`
  - `/settings`
- Tailwind 迁移已完成大半，且已建立两层前端 UI 抽象：
  - 基础组件：`Button / Input / Select / Textarea / Card / Badge`
  - 语义组件：`SectionHeader / EmptyState / InfoBlock / MetricCard`
- `demo/slg_langgraph_single_file_modified_v2.py` 仍保留，且主程序不依赖它

---

## 3. 代码核对后确认的事实

### 3.1 已完成

- editor 点击 `Run` 后会立即请求一次 `/api/runs/{run_id}`，并把结果映射回节点状态
- editor 已具备持续轮询
  - run 未进入终态前，会周期性刷新 `/api/runs/{run_id}`
- editor 已具备基础运行观测增强
  - 顶部会显示轮询中的 run 状态
  - run 级 `warnings / errors` 会在编辑器内展示
  - 选中节点后会请求 `/api/runs/{run_id}/nodes/{node_id}` 查看节点级执行明细
- `runs` 页面已支持按 `graph_name` 搜索、按 `status` 过滤
- `knowledge` 页面已支持搜索和展开详情
- `memories` 页面已支持按 `memory_type` 过滤和展开详情
- `/api/settings` 目前同时返回：
  - `tools`
  - `skills`
  - `templates`
- `creative_factory` 默认图已由后端模板层生成
- editor 模板主路径已优先依赖后端 `default_graph`
  - 前端本地完整模板图仅作为异常兜底

### 3.2 尚未完成

- 模板注册表目前 **只有一个模板**
  - 还没有第二个模板用于验证框架通用性
- 前端和后端的模板定义虽然已收拢很多，但仍不是完全单一来源
  - 前端仍保留 fallback 模板逻辑，但已不再参与主路径
- `settings` 里仍保留 `skills` 字段
  - 说明 skill 层还没有完全退出主概念层
- 前端已建立 primitives 与语义组件，但还没有形成完整设计系统

---

## 4. 里程碑状态

## M1 工程骨架

状态：`已完成`

已完成内容：

- `frontend/` 和 `backend/` 正式工程存在
- `Makefile`
- `scripts/dev_up.sh`
- `/health`
- 固定开发端口

## M2 Graph 基础能力

状态：`已完成`

已完成内容：

- graph schema
- save / load / validate / list / run
- 前后端 graph 协议映射

## M3 Runtime 主流程

状态：`已完成`

已完成内容：

- graph 校验与编译
- condition 路由
- run 落盘
- node execution 落盘
- creative factory 主链可执行

备注：

- 当前普通节点仍要求单一主后继
- 分支必须通过 `condition` 节点

## M4 Editor 基础交互

状态：`已完成`

已完成内容：

- 画布交互
- 节点拖拽
- 连线
- State Panel
- 节点输入输出绑定
- 结构化参数编辑
- Save / Validate / Run

## M5 页面闭环

状态：`已完成`

已完成内容：

- Workspace
- Runs / Run Detail
- Knowledge
- Memories
- Settings

## M6 模板化与标准化

状态：`已完成第一轮`

已完成内容：

- `core/` 目录分层
- `creative_factory` 模板目录拆分
- 模板注册 API
- 主题 preset 体系
- SQLite 持久化

## M7 设计系统与前端收口

状态：`进行中`

已完成内容：

- Tailwind 基础设施
- 基础 UI primitives
- 语义组件第一轮

仍待推进：

- 继续减少页面中散落的重复布局 class
- 形成更完整的前端 UI 约定

---

## 5. 当前 Todo

### P0

- 继续收拢模板单一来源
  - 继续减少前端 fallback 模板图维护量
  - 让后端模板定义成为更明确的源头

### 已完成的近期增量

- editor 运行轮询已完成
- editor run 级 `warnings / errors` 展示已完成
- editor 节点级执行明细查看已完成

### P1

- 增加第二个模板
  - 用来验证 `Core / Template / Theme` 分层不是只适配 creative factory
- 继续清理主概念层中的 `skills`
  - 至少在 UI 和 settings 语义上弱化 skill 暴露
- 增强模板系统
  - 更细的 preset 可视化
  - 更清晰的 theme strategy 编辑

### P2

- 建立更完整的前端设计系统约定
  - `FormField`
  - `DataList`
  - `Dialog/Popover`
- 更细的 state diff / run debug 可视化

---

## 6. 当前最重要的判断

GraphiteUI 当前已经不是“能不能跑起来”的阶段。

当前最准确的判断是：

**主链路已完成，模板系统和 UI 体系已建立第一轮基础，接下来应优先补运行观察与模板抽象，而不是继续扩散零散功能。**

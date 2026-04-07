# GraphiteUI Development Plan

## 1. 文档目的

本文档用于描述 **GraphiteUI 当前实际开发进度**、主线里程碑完成情况，以及接下来最值得继续推进的工作。

它不再假设仓库还停留在“刚搭骨架”的阶段，而是作为当前代码状态的同步文档。

---

## 2. 当前项目判断

截至当前版本，GraphiteUI 已经从“最小闭环原型”进入 **标准编辑器协议 + 标准 creative factory 模板 + 可执行运行链** 阶段。

当前已经完成的主线能力：

- 前后端工程、开发脚本、健康检查、语言切换
- 标准 graph 协议：`template_id / theme_config / state_schema / reads / writes / params / flow_keys`
- graph 的 `validate / save / load / run`
- 基于 LangGraph 的标准节点执行链
- creative factory 默认模板
- 编辑器中的 `State Panel`
- 节点左入右出、自定义节点卡片
- 节点输入输出绑定、结构化参数面板、快速新增 state key
- runs / run detail / knowledge / memories / settings 的基础页面联通

当前项目最准确的状态应理解为：

**“标准编排模型已经落地，主链路可运行，正在从可用走向更强的可视化表达和更完整的资产管理体验。”**

---

## 3. 当前标准模型

当前系统以以下模型为主：

- `State First`
- `Node First`
- `Condition Node` 替代特殊条件边
- 边表示“执行流转 + 一组主要 flow keys”
- `theme_config` 负责切换主题、题材、市场和表达风格

标准节点体系当前已支持：

- `start`
- `research`
- `collect_assets`
- `normalize_assets`
- `select_assets`
- `analyze_assets`
- `extract_patterns`
- `build_brief`
- `generate_variants`
- `generate_storyboards`
- `generate_video_prompts`
- `review_variants`
- `condition`
- `prepare_image_todo`
- `prepare_video_todo`
- `finalize`
- `end`

---

## 4. 里程碑状态

## M1 工程骨架

状态：`已完成`

已完成内容：

- `frontend/` 与 `backend/` 正式工程落地
- `Makefile` 与 `scripts/dev_up.sh`
- 前后端固定开发端口
- `/health` 与启动链路

---

## M2 Graph 基础能力

状态：`已完成`

已完成内容：

- graph schema
- save / load / validate / list
- 前后端 graph 协议映射

---

## M3 Runtime 主流程

状态：`已完成`

已完成内容：

- 标准 graph 解析
- workflow 编译
- condition 路由
- creative factory 主链可运行
- run detail / state snapshot / artifacts 落盘

备注：

- 当前普通节点默认只支持单一主后继
- 分支必须通过 `condition` 节点完成

---

## M4 Editor 基础交互

状态：`已完成并持续增强`

已完成内容：

- 节点增删改
- 节点拖拽与连线
- `State Panel`
- 自定义节点卡片
- 左入右出
- 输入输出绑定
- 快速新增 state key
- 结构化参数编辑
- Validate / Save / Run

---

## M5 页面闭环

状态：`大体完成`

已完成内容：

- 首页
- Workspace
- Editor
- Runs
- Run Detail
- Knowledge
- Memories
- Settings

仍待增强：

- Runs 搜索 / 筛选
- Knowledge / Memories 搜索与详情
- 更强的运行轮询与调试体验

---

## M6 最终形态推进

状态：`进行中`

当前已落地的最终形态能力：

- 标准协议
- `State Panel`
- `theme_config`
- `Condition Node`
- `Node Handler Registry`
- 自定义节点语义
- creative factory 模板

仍在推进中的能力：

- 更强的边可视化与 bus 表达
- Start / End 特殊节点语义增强
- 节点顺序重排体验
- Tool Registry / Handler Registry 正式拆分
- 模板系统与主题系统继续抽象

---

## 5. 当前优先级

## P0 正在推进

- 提升 editor 画布语义表达
- 提升 `Start / End / Condition` 的可理解性
- 让边更明确表达 flow keys
- 让 creative factory 更接近 demo 的真实编排体验

## P1 高价值后续项

- Tool Registry 下沉，弱化 demo 时代的 `slg_*` 命名
- 主题模板系统
- 节点顺序调整与插入体验
- 更强的 Run 轮询和调试能力

## P2 后续增强

- SQLite 持久化替代 JSON
- Runs / Knowledge / Memories 搜索筛选增强
- 更精细的 state diff 与调试可视化

---

## 6. 近期实施顺序建议

建议按以下顺序继续：

1. 继续增强 Editor 语义表达
2. 把 `Start / End / Condition` 交互进一步做实
3. 将运行节点逻辑拆成正式 handler registry
4. 将 demo 相关 helper 下沉为通用工具层
5. 补齐资产页搜索筛选和调试体验

---

## 7. 当前完成标准

如果以“编辑器能通过编排完成 demo 任务，并能方便切换主题或调整顺序”为判断标准，那么当前完成度可以理解为：

- 标准协议：`已完成`
- 标准模板：`已完成`
- 标准执行链：`已完成`
- 编辑器基础交互：`已完成`
- 最终形态视觉与交互：`进行中`
- 更彻底的模块化抽象：`进行中`

---

## 8. 当前最重要的结论

GraphiteUI 已经不再是“演示级画布”，而是一个正在成形的 **LangGraph 状态驱动编排器**。

接下来的重点不再是“从 0 到 1 搭起来”，而是：

- 把 editor 的语义表达做得更强
- 把 runtime 的内部抽象做得更干净
- 把模板和主题系统做得更可复用

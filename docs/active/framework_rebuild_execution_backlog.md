# GraphiteUI Framework Rebuild Execution Backlog

## 1. 文档目的

这份文档是在 [framework_rebuild_task_plan.md](/home/abyss/GraphiteUI/docs/architecture/framework_rebuild_task_plan.md) 基础上的 **执行级 backlog**。

它只关心一件事：

**下一步到底改哪些文件，先删什么，再建什么，做到什么算完成。**

前提与约束：

- 不兼容旧图
- 可以激进重构
- 必须保留 [slg_langgraph_single_file_modified_v2.py](/home/abyss/GraphiteUI/demo/slg_langgraph_single_file_modified_v2.py)
- 但正式程序绝不依赖这个单文件

---

## 2. 当前代码现实判断

当前仓库已经具备这些条件：

- 标准 graph 协议已存在
- 标准 creative factory 模板已存在
- runtime 主链可执行
- editor 已具备 state panel 和节点读写 state 的能力
- 基础模板注册 API 已落地
- 主题配置面板已组件化

当前最明显的问题：

1. `creative_factory` 仍然散落在多个文件中
2. 后端尚未形成 `core/` 与 `templates/` 的目录分层
3. 前端模板源已经开始抽离，但模板主题与默认图仍需继续向统一注册源收拢
4. theme panel 还不是完整结构化策略编辑器
5. runtime handler 仍偏单文件集中

所以当前第一轮重构不该再做“大而全新功能”，而应聚焦：

- 目录重组
- 模板抽离
- 主题系统收拢

---

## 3. 第一批必须执行的任务

## Task A1 后端目录重组

优先级：`P0`

目标：

建立真正的 `core/` 与 `templates/` 分层。

### A1.1 新建目录

需要新增：

```text
backend/app/core/
backend/app/core/schemas/
backend/app/core/compiler/
backend/app/core/runtime/
backend/app/core/runtime/handlers/
backend/app/core/registry/
backend/app/core/storage/
backend/app/templates/
backend/app/templates/creative_factory/
```

### A1.2 迁移文件

建议迁移：

- `backend/app/schemas/graph.py` -> `backend/app/core/schemas/graph.py`
- `backend/app/schemas/run.py` -> `backend/app/core/schemas/run.py`
- `backend/app/compiler/graph_parser.py` -> `backend/app/core/compiler/graph_parser.py`
- `backend/app/compiler/validator.py` -> `backend/app/core/compiler/validator.py`
- `backend/app/compiler/workflow_builder.py` -> `backend/app/core/compiler/workflow_builder.py`
- `backend/app/runtime/executor.py` -> `backend/app/core/runtime/executor.py`
- `backend/app/runtime/nodes.py` -> `backend/app/core/runtime/nodes.py`
- `backend/app/runtime/registry.py` -> `backend/app/core/registry/node_registry.py`
- `backend/app/storage/graph_store.py` -> `backend/app/core/storage/graph_store.py`
- `backend/app/storage/run_store.py` -> `backend/app/core/storage/run_store.py`

### A1.3 同步 import

必须同步修改：

- `backend/app/main.py`
- `backend/app/api/routes_graphs.py`
- `backend/app/api/routes_runs.py`
- `backend/app/api/routes_settings.py`

完成标准：

- `python -m compileall backend/app` 通过
- 所有 API import 正常

---

## Task A2 抽出模板注册系统

优先级：`P0`

目标：

让 `creative_factory` 从“分散逻辑”变成“注册模板”。

### A2.1 新建文件

新增：

- `backend/app/templates/registry.py`
- `backend/app/templates/creative_factory/template.py`
- `backend/app/templates/creative_factory/state.py`
- `backend/app/templates/creative_factory/themes.py`
- `backend/app/templates/creative_factory/handlers.py`

### A2.2 后端职责拆分

`template.py`
- 返回模板 id
- 返回模板默认 graph 结构

`state.py`
- 返回模板默认 state schema

`themes.py`
- 返回模板内置 theme presets

`handlers.py`
- 返回模板节点和具体 handler 的绑定关系

### A2.3 前端对应抽离

新增：

- `frontend/lib/templates/creative-factory.ts`
- `frontend/lib/templates/index.ts`

从 [editor-presets.ts](/home/abyss/GraphiteUI/frontend/lib/editor-presets.ts) 中抽离：

- 模板图构造
- 默认 state schema
- 节点链定义

保留在 `editor-presets.ts` 的只应是轻量入口或兼容导出。

当前状态：

- `frontend/lib/templates/creative-factory.ts` 已创建
- 默认 graph 构造和 theme preset 已从通用 preset 文件中抽离
- 下一步需要继续把模板源和后端模板返回做统一，而不是双份维护

完成标准：

- `creative_factory` 的节点链不再散落在多个文件里
- 前后端都能通过模板定义生成默认图

---

## Task A3 Theme 系统收拢

优先级：`P0`

目标：

把 theme preset 从“前端数组为主”改成“模板主题定义为主”。

### A3.1 后端主题源

在：

- `backend/app/templates/creative_factory/themes.py`

定义：

- `slg_launch`
- `rpg_fantasy`
- `survival_chaos`

每个 preset 应包含：

- basic fields
- market fields
- style fields
- evaluation policy
- strategy profile
- node param overrides

### A3.2 前端主题读取层

新增：

- `frontend/lib/theme-registry.ts`

职责：

- 读取模板主题
- 提供默认 theme
- 处理 preset 切换

### A3.3 从 editor 里移除“硬编码 preset 逻辑”

重点改造：

- [editor-workbench.tsx](/home/abyss/GraphiteUI/frontend/components/editor/editor-workbench.tsx)
- [editor-store.ts](/home/abyss/GraphiteUI/frontend/stores/editor-store.ts)

完成标准：

- 切换 preset 不依赖前端固定数组
- 主题定义来源清晰

---

## 4. 第二批重要任务

## Task B1 Theme Config Panel 组件化

优先级：`P1`

目标：

把 editor 顶部主题区从散输入框改成完整组件。

新增：

- `frontend/components/editor/theme-config-panel.tsx`

分区：

- Basic
- Market
- Style
- Evaluation
- Strategy Profile

必须支持直接编辑：

- `hookTheme`
- `payoffTheme`
- `visualPattern`
- `pacingPattern`
- `evaluationFocus`

完成标准：

- 用户不需要手改 JSON

## Task B2 Palette 分层

优先级：`P1`

目标：

节点面板必须区分：

- Core Nodes
- Template Nodes
- Utility Nodes

改动文件：

- [editor-workbench.tsx](/home/abyss/GraphiteUI/frontend/components/editor/editor-workbench.tsx)
- [workflow-node.tsx](/home/abyss/GraphiteUI/frontend/components/editor/workflow-node.tsx)

完成标准：

- 用户能看懂哪些是框架能力，哪些是模板能力

## Task B3 Run Detail 分层

优先级：`P1`

目标：

把 `RunDetail` 的输出分成：

- system
- state
- artifacts
- trace

改动文件：

- `backend/app/core/schemas/run.py`
- `backend/app/core/runtime/executor.py`
- [run-detail-client.tsx](/home/abyss/GraphiteUI/frontend/components/runs/run-detail-client.tsx)

完成标准：

- 前端不再需要猜字段归属

---

## 5. 第三批增强任务

## Task C1 Start / End Source-Sink 强化

优先级：`P2`

目标：

让 Start / End 变成真正的 state source / sink。

文件：

- [workflow-node.tsx](/home/abyss/GraphiteUI/frontend/components/editor/workflow-node.tsx)
- [state-panel.tsx](/home/abyss/GraphiteUI/frontend/components/editor/state-panel.tsx)

## Task C2 边的 bus 视图

优先级：`P2`

目标：

让边的 `flow_keys` 变成真正有信息量的总线视图。

文件：

- [workflow-edge.tsx](/home/abyss/GraphiteUI/frontend/components/editor/workflow-edge.tsx)

## Task C3 节点插入与顺序重排

优先级：`P2`

目标：

支持“在两节点之间插入节点”和自动重排。

文件：

- [editor-workbench.tsx](/home/abyss/GraphiteUI/frontend/components/editor/editor-workbench.tsx)
- [editor-store.ts](/home/abyss/GraphiteUI/frontend/stores/editor-store.ts)

---

## 6. demo 单文件的专门处理方式

## Task D1 保持 demo 可独立运行

优先级：`P0`

目标：

保证 [slg_langgraph_single_file_modified_v2.py](/home/abyss/GraphiteUI/demo/slg_langgraph_single_file_modified_v2.py) 仍是可独立运行的样板。

必须做到：

- demo 文件不删除
- demo 文件不被 runtime import
- demo 文件不被模板系统 import
- demo 文件可继续单独编译检查

建议检查：

```bash
python -m py_compile demo/slg_langgraph_single_file_modified_v2.py
rg -n "slg_langgraph_single_file_modified_v2" .
```

完成标准：

- 代码层只有文档引用它

## Task D2 用模板能力对齐 demo 能力，而不是调用 demo

优先级：`P0`

目标：

让 `creative_factory` 模板表达 demo 的能力集合，但不依赖 demo 文件本身。

必须覆盖：

- 研究
- 素材收集
- 规范化
- 素材分析
- 模式提取
- brief 生成
- variants 生成
- storyboard 生成
- 视频提示词生成
- review
- image/video todo 导出

完成标准：

- 模板输出结构与 demo 核心产物对齐
- 但代码依赖链不经过 `demo/`

---

## 7. 建议实施节奏

推荐按下面顺序执行：

1. `Task D1`
2. `Task A1`
3. `Task A2`
4. `Task A3`
5. `Task B1`
6. `Task B3`
7. `Task B2`
8. `Task D2`
9. `Task C1`
10. `Task C2`
11. `Task C3`

---

## 8. 本轮重构的完成标志

满足下面这些条件时，可以认为这轮“framework 化重构”进入稳定阶段：

1. `demo/` 只保留为参考实现，不参与正式运行依赖。
2. `creative_factory` 已是模板注册系统中的正式模板。
3. theme preset 已从前端硬编码迁移到模板定义体系。
4. 后端目录已形成 `core/` 与 `templates/` 分层。
5. editor 能围绕模板、主题、state、节点配置进行标准创建和修改。
6. 文档已全部同步到新的代码结构。

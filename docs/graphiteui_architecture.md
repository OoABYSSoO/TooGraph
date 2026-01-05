# GRAPHITEUI_ARCHITECTURE.md

## 1. 文档目的

本文档定义 **GraphiteUI** 的前后端架构、模块边界、数据流、图协议、运行时结构和页面层级关系。

本文档只覆盖当前交付边界，不讨论未来扩展设计。

---

## 2. 总体架构

GraphiteUI 分为四层：

1. **Workspace Layer**：总览、导航、最近 graph / runs
2. **Editor Layer**：节点编排、配置、校验、运行
3. **Runtime Layer**：graph 校验、graph 编译、LangGraph 执行
4. **Persistence Layer**：graphs、runs、node executions、artifacts、memories 存储

---

## 3. 前端架构

## 3.1 页面层级

- `/` 首页
- `/workspace` 工作台
- `/editor/[graphId]` 编排器
- `/runs` 运行记录页
- `/runs/[runId]` 运行详情页
- `/knowledge` 知识库页
- `/memories` 记忆页
- `/settings` 设置页

## 3.2 关键设计原则

### Workspace 和 Editor 分离

- **Workspace** 负责总览与入口
- **Editor** 负责专注编排

Workspace 可以集成“进入编辑器”的能力，但不承担完整画布编辑逻辑。

这样做的原因：
- 工作台和画布的心智不同
- 画布需要更大的可用空间
- 节点配置和运行状态需要独立布局
- 有利于后期扩展 run detail 页面

## 3.3 前端目录建议

```text
frontend/
├── app/
│   ├── page.tsx
│   ├── workspace/page.tsx
│   ├── editor/[graphId]/page.tsx
│   ├── runs/page.tsx
│   ├── runs/[runId]/page.tsx
│   ├── knowledge/page.tsx
│   ├── memories/page.tsx
│   └── settings/page.tsx
├── components/
│   ├── workspace/
│   ├── editor/
│   ├── runs/
│   ├── knowledge/
│   ├── memories/
│   └── common/
├── hooks/
├── lib/
├── stores/
└── types/
```

## 3.4 前端状态划分

### 远程数据
使用 TanStack Query 管理：
- graph detail
- graph validation result
- run detail
- runs list
- knowledge list
- memories list
- settings

### 本地 UI 状态
使用 Zustand 管理：
- 当前选中节点
- 当前选中边
- 节点配置面板开关
- editor 局部 UI 状态
- runs filter 状态

### 表单状态
使用 React Hook Form + Zod 管理：
- 节点配置表单
- 新建 graph 表单

---

## 4. Editor 架构

## 4.1 Editor 页面布局

Editor 页面采用四区布局：

1. 左侧：Node Palette
2. 中间：Graph Canvas
3. 右侧：Node Config Panel
4. 顶部：Toolbar

## 4.2 主要组件

- `GraphToolbar`
- `NodePalette`
- `GraphCanvas`
- `NodeConfigPanel`
- `NodeExecutionDrawer`
- `RunStatusBar`

## 4.3 图形引擎

推荐使用 **React Flow**。

原因：
- 支持节点拖拽和连线
- 支持自定义节点组件
- 支持画布缩放和平移
- 足以支撑当前阶段的可视化编排能力

---

## 5. 后端架构

后端建议拆为三层：

1. **Graph API Layer**
2. **Graph Compiler Layer**
3. **GraphiteUI Runtime**

## 5.1 Graph API Layer

职责：
- 保存 graph
- 加载 graph
- 校验 graph
- 启动 run
- 查询 runs
- 查询 node execution
- 查询 knowledge / memories / settings

## 5.2 Graph Compiler Layer

职责：
- 校验 graph json 合法性
- 将 graph json 转为 workflow config
- 将 workflow config 转为 LangGraph workflow

## 5.3 GraphiteUI Runtime

职责：
- 执行 LangGraph workflow
- 更新 run state
- 更新 current node
- 执行 skill
- 执行 evaluator
- 处理 revise 路由
- 记录 node execution
- 记录 artifacts

---

## 6. 后端目录建议

```text
backend/
├── app/
│   ├── api/
│   │   ├── routes_graphs.py
│   │   ├── routes_runs.py
│   │   ├── routes_knowledge.py
│   │   ├── routes_memories.py
│   │   └── routes_settings.py
│   ├── compiler/
│   │   ├── validator.py
│   │   ├── graph_parser.py
│   │   └── workflow_builder.py
│   ├── runtime/
│   │   ├── state.py
│   │   ├── nodes.py
│   │   ├── router.py
│   │   └── executor.py
│   ├── skills/
│   ├── evaluator/
│   ├── knowledge/
│   ├── memory/
│   ├── storage/
│   ├── schemas/
│   └── main.py
└── data/
    ├── graphs/
    ├── kb/
    ├── memories/
    └── runs/
```

---

## 7. 图协议

## 7.1 Graph 顶层结构

```json
{
  "graph_id": "graph_001",
  "name": "Marketing Workflow",
  "nodes": [],
  "edges": [],
  "metadata": {}
}
```

## 7.2 Node 结构

```json
{
  "id": "node_1",
  "type": "planner",
  "label": "Plan Task",
  "position": { "x": 320, "y": 160 },
  "config": {}
}
```

## 7.3 Edge 结构

```json
{
  "id": "edge_1",
  "type": "conditional",
  "source": "node_eval",
  "target": "node_plan",
  "condition_label": "revise"
}
```

---

## 8. 图编译流程

图编译分四步：

1. 前端提交 graph json
2. `validator` 校验 graph 合法性
3. `graph_parser` 解析节点与边
4. `workflow_builder` 生成 LangGraph workflow

### 关键点
前端不直接执行 graph。
前端只负责：
- 编辑图
- 提交图
- 展示结果

执行逻辑只在后端。

---

## 9. Runtime 状态对象

后端统一使用 `RunState` 表示执行状态。

建议字段：
- run_id
- graph_id
- graph_name
- status
- current_node_id
- revision_round
- max_revision_round
- task_input
- retrieved_knowledge
- matched_memories
- plan
- selected_skills
- skill_outputs
- draft_result
- evaluation_result
- final_result
- node_status_map
- warnings
- errors
- started_at
- completed_at

---

## 10. Runtime 节点映射

图中的节点类型映射到运行时节点逻辑：

- `input` -> ingest_task
- `knowledge` -> retrieve_knowledge
- `memory` -> load_memory
- `planner` -> plan_task
- `skill_executor` -> execute_skills
- `evaluator` -> evaluate_result
- `finalizer` -> finalize

### 注意
当前阶段不要求图上每个节点都直接映射成任意 Python 代码，而是映射成 **固定能力节点**。

这有利于：
- 控制复杂度
- 保持 graph 合法性
- 保持运行时可解释性

---

## 11. 路由机制

当前阶段只支持有限条件路由。

### Evaluator 后的合法路由
- `pass` -> Finalizer
- `revise` -> Planner
- `fail` -> Finalizer

### revise 逻辑
若 `evaluation_result.pass = false` 且 `revision_round < max_revision_round`：
- revision_round + 1
- 回到 planner 再次规划
- 然后继续执行后续节点

---

## 12. Persistence 架构

Persistence 负责存储：
- graphs
- runs
- node_executions
- artifacts
- memories

## 12.1 推荐存储方式
- graph：SQLite 或 JSON 文件
- run：SQLite
- artifacts：SQLite 或文件
- knowledge：本地文件目录
- memories：SQLite 或本地文件

## 12.2 必须保存的 graph 信息
- graph_id
- name
- graph_json
- updated_at

## 12.3 必须保存的 run 信息
- run_id
- graph_id
- status
- current_node_id
- revision_round
- started_at
- completed_at
- duration_ms

## 12.4 必须保存的 node execution 信息
- node_id
- node_type
- status
- started_at
- finished_at
- duration_ms
- input_summary
- output_summary
- warnings
- errors

---

## 13. API 架构

当前阶段至少提供以下接口：

### Graph
- `POST /api/graphs/save`
- `GET /api/graphs/{graph_id}`
- `POST /api/graphs/validate`
- `POST /api/graphs/run`

### Run
- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/nodes/{node_id}`

### Assets
- `GET /api/knowledge`
- `GET /api/memories`
- `GET /api/settings`
- `GET /health`

---

## 14. 页面与接口绑定

## 14.1 Workspace
依赖：
- `GET /api/runs`
- `GET /api/graphs/{graph_id}`（摘要方式）

## 14.2 Editor
依赖：
- `GET /api/graphs/{graph_id}`
- `POST /api/graphs/save`
- `POST /api/graphs/validate`
- `POST /api/graphs/run`
- `GET /api/runs/{run_id}`

## 14.3 Runs
依赖：
- `GET /api/runs`
- `GET /api/runs/{run_id}`

## 14.4 Knowledge
依赖：
- `GET /api/knowledge`

## 14.5 Memories
依赖：
- `GET /api/memories`

## 14.6 Settings
依赖：
- `GET /api/settings`

---

## 15. 错误处理边界

## 15.1 前端
必须展示：
- graph 校验失败提示
- run 启动失败提示
- 接口错误提示
- 空数据状态

## 15.2 后端
必须记录：
- graph 校验失败原因
- runtime 节点失败原因
- evaluator 失败原因
- node execution warnings / errors

---

## 16. 架构完成标准

满足以下条件则架构达标：

1. Workspace、Editor、Runtime 三者职责清晰
2. 前端只做图编辑和结果展示，不直接解释执行
3. graph 可以被校验、保存、加载、运行
4. runtime 能返回 current node 和 node status map
5. run detail 可以看到节点级执行摘要


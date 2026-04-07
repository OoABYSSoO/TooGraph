# GraphiteUI Acceptance Runbook

## 1. 文档目的

这份文档用于把当前仓库中的实现能力，映射到验收文档中的可执行验证步骤。

适用场景：

- 本地自测
- Demo 演示前检查
- 向他人交接当前阶段能力

---

## 2. 启动准备

默认开发端口：

- 前端：`3477`
- 后端：`8765`

启动命令：

```bash
make backend-install
make frontend-install
make backend-dev
make frontend-dev
```

健康检查：

```bash
make backend-health
```

前端地址：

```bash
http://localhost:3477
```

后端地址：

```bash
http://localhost:8765
```

---

## 3. 建议使用的示例图

当前仓库提供两份示例图：

- [graph_minimal_pass.json](/home/abyss/GraphiteUI/examples/graph_minimal_pass.json)
- [graph_revise.json](/home/abyss/GraphiteUI/examples/graph_revise.json)

用途：

- `graph_minimal_pass.json`：验证正常路径
- `graph_revise.json`：验证 revise 路由

---

## 4. 环境与启动验收

### AC-ENV-1 前端可启动

验证：

1. 执行 `make frontend-dev`
2. 打开 `http://localhost:3477`

通过标准：

- 首页可以访问
- 能看到产品名称和入口按钮

### AC-ENV-2 后端可启动

验证：

1. 执行 `make backend-dev`
2. 访问 `http://localhost:8765/health`

通过标准：

- 返回 `{"status":"ok"}`

### AC-ENV-3 本地数据目录可用

检查目录：

- `backend/data/graphs/`
- `backend/data/kb/`
- `backend/data/memories/`
- `backend/data/runs/`

通过标准：

- 目录存在
- 启动和运行时不因目录缺失报错

---

## 5. Graph 与 Runtime 验收

### AC-GRAPH-1 / AC-GRAPH-2 / AC-GRAPH-3

可通过 Editor 页面验证：

1. 打开 `http://localhost:3477/editor/demo-graph`
2. 调整节点后点击 `Validate Graph`
3. 点击 `Save Graph`
4. 观察地址是否切换到真实 `/editor/{graphId}`
5. 刷新页面，确认 graph 仍能加载

通过标准：

- `Validate Graph` 成功返回
- `Save Graph` 成功
- 保存后刷新仍能打开 graph

### AC-GRAPH-4 / AC-RUNTIME-1

验证：

1. 在 Editor 中点击 `Run Graph`
2. 观察 editor 左侧和画布节点状态
3. 打开 Runs 页面或自动进入 run detail

通过标准：

- 返回 `run_id`
- run 可查询
- run 终态为 `completed` 或 `failed`

### AC-RUNTIME-2 revise 路由

验证方式一：

- 使用 [graph_revise.json](/home/abyss/GraphiteUI/examples/graph_revise.json) 通过接口保存后运行

验证方式二：

- 在 editor 中把 evaluator 的 `Decision` 改为 `revise`
- 给 evaluator 增加 `revise` 和 `fail` 条件边
- 再次运行

通过标准：

- `revision_round` 增加
- workflow 回到 planner 路径
- 最终 run detail 中能看见多次节点执行

### AC-RUNTIME-3 / AC-RUNTIME-4 / AC-RUNTIME-5

验证：

1. 打开 Runs 页面
2. 进入某次 run detail
3. 检查：
   - `current_node_id`
   - `node_status_map`
   - `knowledge_summary`
   - `memory_summary`
   - `plan`
   - `skill_outputs`
   - `evaluation`
   - `final_result`
4. 在 Editor 中点击某个已执行节点，查看右侧 `Latest Execution`

通过标准：

- node execution 至少显示 `node_id`、`node_type`、`status`、`duration_ms`
- editor 右侧可看 `input_summary`、`output_summary`
- run detail 页面可看 artifacts 摘要

---

## 6. 前端页面与交互验收

### AC-FE-1 首页

检查：

- 能看到 GraphiteUI 名称
- 能看到产品定位
- 能看到进入 Workspace 按钮

### AC-FE-2 Workspace

检查：

- Recent Graphs
- Recent Runs
- Quick Actions

### AC-FE-3 Editor

检查：

- Node Palette
- Canvas
- Config Panel
- Toolbar

### AC-FE-4 / AC-FE-5

检查：

- 可新增节点
- 可拖拽节点
- 可创建边
- 选中节点后可修改显式字段

### AC-FE-6 / AC-FE-7 / AC-FE-8

检查：

- Validate / Save / Run 按钮可用
- 运行后节点状态颜色变化
- 点击节点后可看执行摘要

### AC-FE-9 / AC-FE-10 / AC-FE-11 / AC-FE-12

检查：

- Runs 页面读取真实 runs
- Run Detail 页面读取真实 run detail
- Knowledge 页面读取真实知识条目
- Memories 页面读取真实记忆条目
- Settings 页面读取真实只读配置

---

## 7. 全链路演示建议

建议演示顺序：

1. 打开首页
2. 进入 Workspace
3. 进入 `demo-graph` Editor
4. 添加一个 `knowledge` 或 `memory` 节点
5. 修改 evaluator 配置
6. `Validate Graph`
7. `Save Graph`
8. `Run Graph`
9. 在 editor 中查看节点状态与执行摘要
10. 打开 Runs 页面
11. 打开对应 Run Detail
12. 打开 Knowledge / Memories / Settings 页面

---

## 8. 当前已知仍可继续增强的点

当前阶段已经具备主闭环，但仍有这些后续增强空间：

- Runs 页面搜索和筛选还未完成
- Knowledge / Memories 页面仍缺搜索和详情抽屉
- Editor 运行状态目前是单次回读，不是持续轮询
- 持久化仍使用本地 JSON，而不是 SQLite

这些不会阻断当前主链路演示，但属于下一阶段优先事项。

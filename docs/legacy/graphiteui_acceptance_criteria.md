# GRAPHITEUI_ACCEPTANCE_CRITERIA.md

## 1. 文档目的

本文档定义 **GraphiteUI** 当前交付阶段的验收标准。

原则：
- 所有标准都必须可验证
- 所有标准都必须有明确通过/不通过条件
- 验收只针对当前交付边界

---

## 2. 总体验收规则

当前阶段必须按四层验收：

1. 环境与启动验收
2. Graph 与 Runtime 验收
3. 前端页面与交互验收
4. 全链路演示验收

四层全部通过才算完成。

---

## 3. 环境与启动验收

## AC-ENV-1 前端可启动

### 验证步骤
1. 启动前端开发服务器
2. 打开首页

### 通过标准
- 服务可启动
- 首页可访问

### 不通过标准
- 无法启动
- 页面空白或报错

---

## AC-ENV-2 后端可启动

### 验证步骤
1. 启动后端服务
2. 请求 `/health`

### 通过标准
- 服务可启动
- `/health` 返回成功

---

## AC-ENV-3 本地数据目录可用

### 验证步骤
检查目录：
- `backend/data/graphs/`
- `backend/data/kb/`
- `backend/data/memories/`
- `backend/data/runs/`

### 通过标准
目录存在且运行时不因目录缺失报错。

---

## 4. Graph 与 Runtime 验收

## AC-GRAPH-1 Graph 可保存

### 接口
`POST /api/graphs/save`

### 验证步骤
提交一个合法 graph。

### 通过标准
- 返回 graph_id
- graph 可再次读取

---

## AC-GRAPH-2 Graph 可读取

### 接口
`GET /api/graphs/{graph_id}`

### 验证步骤
读取已保存 graph。

### 通过标准
- 返回完整 graph json
- nodes 和 edges 正常

---

## AC-GRAPH-3 Graph 可校验

### 接口
`POST /api/graphs/validate`

### 验证步骤
分别提交：
- 一个合法 graph
- 一个非法 graph

### 通过标准
- 合法 graph 返回 `valid=true`
- 非法 graph 返回 `valid=false` 且包含 issues

---

## AC-GRAPH-4 Graph 可运行

### 接口
`POST /api/graphs/run`

### 验证步骤
对已保存 graph 发起运行。

### 通过标准
- 返回 run_id
- run 状态能被查询

---

## AC-RUNTIME-1 Workflow 可执行

### 验证步骤
运行一个完整 graph。

### 通过标准
- graph 能被映射为 runtime workflow
- workflow 能执行到终态
- 终态为 completed 或 failed

---

## AC-RUNTIME-2 revise 路由可用

### 验证步骤
运行一个会触发 revise 的 graph。

### 通过标准
- revision_round 增加
- workflow 回到 planner 路径
- 后续继续执行

---

## AC-RUNTIME-3 current node 可见

### 验证步骤
运行 graph 并查询 run detail。

### 通过标准
返回：
- current_node_id
- run_status
- node_status_map

---

## AC-RUNTIME-4 node execution 可记录

### 验证步骤
运行一条 graph 后查询 node execution 数据。

### 通过标准
每个已执行节点至少保存：
- node_id
- node_type
- status
- duration_ms
- input_summary
- output_summary

---

## AC-RUNTIME-5 artifacts 可查看

### 验证步骤
运行 graph 后查询 run detail 或 artifacts。

### 通过标准
至少可查看以下内容中的大部分：
- knowledge summary
- memory summary
- plan
- skill outputs
- evaluation
- final result

---

## 5. 前端页面与交互验收

## AC-FE-1 首页可访问

### 通过标准
能看到：
- GraphiteUI 名称
- 产品定位
- 进入工作台入口

---

## AC-FE-2 Workspace 可访问

### 通过标准
Workspace 至少展示：
- Recent Graphs
- Recent Runs
- Quick Actions

---

## AC-FE-3 Editor 可访问

### 通过标准
Editor 页面至少展示：
- Node Palette
- Canvas
- Config Panel
- Toolbar

---

## AC-FE-4 节点可拖拽和连线

### 验证步骤
在 Editor 中拖拽节点并连线。

### 通过标准
- 节点可加入画布
- 节点可移动
- 边可创建

---

## AC-FE-5 节点可配置

### 验证步骤
选中节点并修改配置。

### 通过标准
- 配置表单显示正确
- 修改后 graph state 更新

---

## AC-FE-6 Validate / Save / Run 可用

### 验证步骤
在 Editor 中点击对应按钮。

### 通过标准
- Validate 返回校验结果
- Save 成功
- Run 返回 run_id 并进入运行态

---

## AC-FE-7 节点状态高亮可见

### 验证步骤
运行 graph 并观察画布。

### 通过标准
至少可区分：
- idle
- running
- success
- failed

---

## AC-FE-8 节点执行摘要可查看

### 验证步骤
运行 graph 后点击节点。

### 通过标准
能查看：
- input summary
- output summary
- duration
- warnings / errors

---

## AC-FE-9 Runs 页面可访问

### 通过标准
- runs 列表正常显示
- 支持搜索或筛选

---

## AC-FE-10 Run Detail 可访问

### 通过标准
- 能看到 run 基本信息
- 能看到节点执行摘要
- 能看到最终状态

---

## AC-FE-11 Knowledge 页面可访问

### 通过标准
- 知识列表正常显示
- 支持搜索或查看详情

---

## AC-FE-12 Memories 页面可访问

### 通过标准
- 记忆列表正常显示
- 支持按类型查看

---

## 6. 全链路演示验收

## AC-E2E-1 正常路径

### 验证步骤
1. 从 Workspace 进入 Editor
2. 新建 graph
3. 拖拽和连线
4. 配置节点
5. Validate
6. Save
7. Run
8. 查看节点状态
9. 查看 run detail

### 通过标准
以上链路全部可走通。

---

## AC-E2E-2 revise 路径

### 验证步骤
运行一个会触发 revise 的 graph。

### 通过标准
- evaluator 结果不通过
- revision_round 增加
- 再次进入 planner 路径
- 运行状态持续更新

---

## AC-E2E-3 历史记录沉淀

### 验证步骤
执行至少两次 run，然后进入 runs。

### 通过标准
- runs 页面能看到多条历史记录
- 每条记录可进入 detail

---

## AC-E2E-4 资产页可用

### 验证步骤
打开 knowledge / memories 页面。

### 通过标准
- knowledge 页面有真实内容
- memories 页面有真实内容

---

## 7. 一票否决项

出现以下任一情况则直接不通过：

1. 只能画图，不能运行
2. 能运行，但看不到节点状态
3. 能运行，但点节点看不到执行摘要
4. Workspace、Editor、Runtime 职责说不清楚
5. graph 不能保存或加载
6. knowledge / memories 页面只是空壳

---

## 8. 最终通过标准

只有以下条件同时满足，当前阶段才算通过：

1. 环境与启动验收通过
2. Graph 与 Runtime 验收通过
3. 前端页面与交互验收通过
4. 全链路演示验收通过
5. 没有触发一票否决项


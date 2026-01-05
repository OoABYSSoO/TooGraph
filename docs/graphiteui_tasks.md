# GRAPHITEUI_TASKS.md

## 1. 文档目的

本文档将 **GraphiteUI** 的当前交付范围拆成可执行、可验证、可交给 Codex 的开发任务。

要求：
- 每个任务边界清晰
- 每个任务有明确完成标准
- 每个任务完成后都可验证
- 所有任务只服务于当前交付范围

---

## 2. 总体开发阶段

当前阶段固定拆成 8 个阶段：

1. 项目骨架初始化
2. Graph 后端基础能力
3. Runtime 主流程
4. Knowledge / Memory / Skills
5. Persistence
6. 前端 Workspace 与 Editor 骨架
7. 前后端联调
8. 验收与演示整理

---

## 3. 阶段一：项目骨架初始化

## Task 1.1 初始化仓库目录

### 目标
建立前后端和文档目录。

### 产出
- `frontend/`
- `backend/`
- `backend/data/graphs/`
- `backend/data/kb/`
- `backend/data/memories/`
- `backend/data/runs/`
- `docs/`

### 完成标准
目录结构存在。

### 验证方式
手工检查目录。

---

## Task 1.2 初始化前端项目

### 目标
创建 React/Next.js + TypeScript 基础项目。

### 产出
- 基础 layout
- Tailwind
- shadcn/ui 基础组件环境

### 完成标准
首页能打开。

### 验证方式
运行前端开发服务器并访问首页。

---

## Task 1.3 初始化后端项目

### 目标
创建 FastAPI 项目。

### 产出
- `main.py`
- `/health` 接口
- 基础路由注册机制

### 完成标准
后端服务可启动。

### 验证方式
请求 `/health` 返回成功。

---

## 4. 阶段二：Graph 后端基础能力

## Task 2.1 定义 graph schema

### 目标
定义 graph、node、edge 的结构。

### 产出
- Graph schema
- Node schema
- Edge schema

### 完成标准
支持保存与校验 graph json。

### 验证方式
构造示例 graph json 并通过 schema 校验。

---

## Task 2.2 实现 graph 保存接口

### 接口
`POST /api/graphs/save`

### 完成标准
可保存 graph json 并返回 graph_id。

### 验证方式
提交 graph 并再次读取。

---

## Task 2.3 实现 graph 读取接口

### 接口
`GET /api/graphs/{graph_id}`

### 完成标准
能返回 graph json。

### 验证方式
读取刚保存的 graph。

---

## Task 2.4 实现 graph 校验接口

### 接口
`POST /api/graphs/validate`

### 完成标准
输入 graph json 后返回：
- valid
- issues

### 验证方式
分别用合法和非法 graph 测试。

---

## 5. 阶段三：Runtime 主流程

## Task 3.1 定义 RunState

### 目标
定义 runtime 状态对象。

### 完成标准
包含 graph、run、node execution 所需关键字段。

### 验证方式
写最小初始化测试。

---

## Task 3.2 实现 compiler: graph_parser

### 目标
把 graph json 解析为可执行 workflow config。

### 完成标准
能读取 nodes / edges 并生成拓扑结构。

### 验证方式
输入示例 graph，输出 workflow config。

---

## Task 3.3 实现 compiler: workflow_builder

### 目标
把 workflow config 映射成 LangGraph workflow。

### 完成标准
能生成并执行一条最小路径：
Input -> Planner -> Evaluator -> Finalizer

### 验证方式
执行最小图并拿到最终 state。

---

## Task 3.4 实现 runtime 节点逻辑

### 当前阶段必须节点
- ingest_task
- retrieve_knowledge
- load_memory
- plan_task
- execute_skills
- evaluate_result
- finalize

### 完成标准
节点可独立接收 state 并返回 state 增量。

### 验证方式
分别调用节点测试。

---

## Task 3.5 实现 revise 路由

### 目标
支持 evaluator 不通过后重新进入 planner。

### 完成标准
- pass -> finalize
- revise -> planner
- fail -> finalize

### 验证方式
构造 3 种 evaluator 输出测试分支。

---

## Task 3.6 实现 graph 运行接口

### 接口
`POST /api/graphs/run`

### 完成标准
提交 graph 后返回 run_id，并启动 runtime。

### 验证方式
运行 graph 并能查询 run 状态。

---

## 6. 阶段四：Knowledge / Memory / Skills

## Task 4.1 实现知识库加载器

### 完成标准
- 读取 `backend/data/kb/` 中样例文件
- 返回标题、来源、内容摘要

### 验证方式
打印或接口返回知识列表。

---

## Task 4.2 实现知识检索

### 完成标准
输入 query，返回匹配文档片段。

### 验证方式
对样例知识做检索测试。

---

## Task 4.3 实现记忆加载

### 完成标准
能读取 success_pattern 和 failure_reason。

### 验证方式
对样例 memory 做查询测试。

---

## Task 4.4 实现记忆写入

### 完成标准
运行结束后能按结果写入 memory。

### 验证方式
执行成功和失败两类 run 后检查 memories 数据。

---

## Task 4.5 实现 skill registry

### 完成标准
支持注册、获取和调用 skill。

### 验证方式
写最小注册和读取测试。

---

## Task 4.6 实现 `search_docs`

### 完成标准
输入任务信息，返回文档摘要。

### 验证方式
调用 skill 测试。

---

## Task 4.7 实现 `analyze_assets`

### 完成标准
输入 materials，返回结构化分析摘要。

### 验证方式
调用 skill 测试。

---

## Task 4.8 实现 `generate_draft`

### 完成标准
基于 plan、knowledge 和 memory 生成 draft。

### 验证方式
用 mock 上下文测试输出结构。

---

## Task 4.9 实现 `evaluate_output`

### 完成标准
返回 issues、suggestions、基础评分。

### 验证方式
用合格/不合格样例测试。

---

## 7. 阶段五：Persistence

## Task 5.1 初始化 SQLite

### 完成标准
数据库文件生成成功。

### 验证方式
启动后检查数据库文件。

---

## Task 5.2 创建数据表

### 必须表
- graphs
- runs
- node_executions
- artifacts
- memories

### 完成标准
表创建成功。

### 验证方式
检查 schema。

---

## Task 5.3 实现 graph 存储

### 完成标准
graph 可保存、可读取。

### 验证方式
保存后重新读取并比对。

---

## Task 5.4 实现 run 存储

### 完成标准
run 可创建、可更新、可查询。

### 验证方式
执行 run 后查询状态。

---

## Task 5.5 实现 node execution 存储

### 完成标准
每个节点执行记录可落库。

### 验证方式
执行一次 graph 后检查 node_executions。

---

## Task 5.6 实现 artifact 存储

### 完成标准
至少保存：
- plan
- knowledge summary
- skill outputs
- evaluation
- final result

### 验证方式
执行后查询 artifacts。

---

## 8. 阶段六：前端 Workspace 与 Editor 骨架

## Task 6.1 实现全局布局

### 完成标准
- 侧边导航存在
- 页面可切换

### 验证方式
浏览器查看。

---

## Task 6.2 实现 Workspace 页面

### 完成标准
- Recent Graphs 卡片
- Recent Runs 卡片
- Quick Actions

### 验证方式
页面可访问并展示 mock/真实数据。

---

## Task 6.3 实现 Editor 页面骨架

### 完成标准
包含：
- Node Palette
- Canvas
- Config Panel
- Toolbar

### 验证方式
页面可访问。

---

## Task 6.4 实现 React Flow 画布

### 完成标准
支持：
- 拖拽节点到画布
- 节点移动
- 连线
- 删除节点/边

### 验证方式
浏览器手工操作。

---

## Task 6.5 实现节点配置面板

### 完成标准
选中节点后可编辑配置字段。

### 验证方式
修改配置并检查 graph state 更新。

---

## Task 6.6 实现 Save / Load / Validate / Run 按钮

### 完成标准
四个动作都能触发对应接口或逻辑。

### 验证方式
手工点击按钮测试。

---

## Task 6.7 实现节点状态高亮

### 完成标准
根据 run status 显示：
- idle
- running
- success
- failed

### 验证方式
运行 graph 时观察节点状态变化。

---

## 9. 阶段七：前后端联调

## Task 7.1 打通 graph 保存/加载

### 完成标准
Editor 中的图可真实保存并重新加载。

### 验证方式
保存图后刷新页面重新打开。

---

## Task 7.2 打通 graph 校验

### 完成标准
非法 graph 会返回 issues 并在前端展示。

### 验证方式
提交缺节点或错误连线的 graph。

---

## Task 7.3 打通 graph 运行

### 完成标准
点击 Run 后返回 run_id，并能进入运行观察状态。

### 验证方式
在 Editor 中运行 graph。

---

## Task 7.4 打通节点级状态展示

### 完成标准
Editor 或 Run Detail 中能看到 current node 和 node status map。

### 验证方式
运行时观察节点变化。

---

## Task 7.5 打通节点执行摘要

### 完成标准
点击节点后可查看：
- input summary
- output summary
- duration
- warnings/errors

### 验证方式
运行 graph 后点击节点。

---

## Task 7.6 打通 Runs 页面

### 完成标准
Runs 页面读取真实后端列表数据。

### 验证方式
创建多次 run 后查看列表。

---

## Task 7.7 打通 Knowledge / Memories 页面

### 完成标准
两个页面读取真实数据。

### 验证方式
打开页面检查内容。

---

## 10. 阶段八：验收与演示整理

## Task 8.1 准备样例 graph

### 完成标准
至少有：
- 1 个正常通过 graph
- 1 个触发 revise 的 graph

### 验证方式
两条路径都能现场演示。

---

## Task 8.2 准备样例知识与记忆

### 完成标准
- 至少 3 条 knowledge
- 至少 2 条 memory

### 验证方式
Knowledge / Memories 页面可见。

---

## Task 8.3 补充 README

### 完成标准
README 能说明：
- 项目定位
- 启动方式
- 页面说明
- 演示路径

### 验证方式
按 README 独立跑通项目。

---

## Task 8.4 演示顺序整理

### 固定演示顺序
1. 首页
2. Workspace
3. 打开 Editor
4. 拖拽和连线
5. Validate
6. Save
7. Run
8. 查看节点状态
9. 查看 runs
10. 查看 knowledge / memories

### 完成标准
全链路可在 5~8 分钟内完成。

---

## 11. Codex 使用建议

每次只给 Codex 一个小任务块，例如：
- Task 2.1 ~ 2.4
- Task 3.1 ~ 3.4
- Task 6.3 ~ 6.5
- Task 7.3 ~ 7.5

不要一次性让 Codex 做完整个阶段。

---

## 12. 当前阶段完成判定

只有当以下全部成立，GRAPHITEUI_TASKS 才算完成：

1. Graph 可创建、保存、加载、校验、运行
2. Editor 可拖拽、连线、配置节点
3. Runtime 可执行 workflow 并记录节点状态
4. Runs 页面可回看历史运行
5. 节点执行摘要可查看
6. Workspace、Editor、Runtime 的职责可以清楚解释


# GraphiteUI

A visual node-based editor and runtime workspace for LangGraph agent workflows.

GraphiteUI 不是一个聊天应用，也不是一个单轮 prompt 包装器。它的目标是把复杂业务任务的执行过程，从“黑盒代码”变成 **可视化编排、可运行、可观察、可回看** 的 workflow 系统。

---

## 当前仓库状态

当前仓库已经完成：

- 产品范围文档
- 架构设计文档
- 任务拆解文档
- 验收标准文档
- 开发计划文档
- Python demo 原型
- 后端 graph / run / assets 基础接口
- 前后端可运行骨架
- Editor 画布交互、本地状态与后端联调
- Workspace、Runs、Run Detail、Knowledge、Memories、Settings 真实数据接入
- 一套可直接打开的 `creative factory` 标准编辑器模板
- 标准 graph 协议与标准 creative factory 运行链
- `State Panel`、左入右出节点、自定义节点卡片、结构化参数编辑
- 运行时 `Node Handler Registry` 拆分
- `Tool Registry` 基础抽象与通用 creative factory tools
- 主题预设切换：当前已支持 `SLG Launch`、`RPG Fantasy`、`Survival Chaos`
- 主题预设会联动节点默认参数，例如 `top_n`、`variantCount`、`scoreThreshold`
- 主题预设已进入“策略驱动”阶段：可显式控制 `hook / payoff / visual pattern / pacing / evaluation focus`

当前仓库尚未完成：

- Runs 页面搜索和筛选
- Knowledge / Memories 页面搜索和详情交互
- Editor 运行状态持续轮询和更细调试能力
- SQLite 持久化替代当前本地 JSON 存储
- Tool Registry 的进一步模块化抽象
- 更多主题模板与参数策略抽象
- 主题策略编辑器与更细粒度的 preset 可视化

因此，本仓库现在更适合视为“标准编排器主链已经可运行，正在朝最终形态持续升级”的状态。

在 GraphiteUI 中，用户可以：

- 在 **Workspace** 中查看最近 graph、最近 runs 和系统状态
- 在 **Editor** 中拖拽节点、连线、配置 graph
- 在同一条 creative factory 流水线中切换不同主题预设
- 将 graph 提交给后端 runtime 执行
- 在运行过程中查看当前节点和节点级状态
- 查看节点执行摘要、最终结果、知识和记忆资产

---

## 1. 产品结构

GraphiteUI 由三部分组成：

### 1.1 Workspace
负责总览与入口。

包含：
- Recent Graphs
- Recent Runs
- Running Jobs
- Failed Runs
- Quick Actions

Workspace 集成编排能力的入口，但不承担完整编辑功能。

### 1.2 Editor
负责可视化编排。

包含：
- Node Palette
- Graph Canvas
- Node Config Panel
- Toolbar
- Run Status 展示

用户在 Editor 中完成：
- 拖拽节点
- 连线
- 参数配置
- Validate
- Save
- Run

### 1.3 Runtime
负责执行与记录。

包含：
- graph 校验
- graph 转 workflow config
- LangGraph runtime 执行
- node status 更新
- evaluator 与 revise 路由
- persistence

---

## 2. 当前交付边界

当前阶段只交付以下能力：

- graph 创建、保存、加载
- 节点拖拽与连线
- 节点参数配置
- graph 合法性校验
- graph 运行
- 节点级运行状态显示
- 节点执行摘要查看
- runs 列表与 run detail
- knowledge 和 memories 查看

以下内容不在当前交付范围内：

- 自然语言自动生成完整 graph
- 双向无损代码编译
- 子图 / Subgraph
- state diff 调试
- 人类在环在线中断编辑
- 多人协作
- 多 Agent 协同

---

## 3. 页面结构

GraphiteUI 当前包含以下页面：

- `/` 首页
- `/workspace` 工作台
- `/editor/[graphId]` 编排器
- `/runs` 运行记录列表
- `/runs/[runId]` 运行详情
- `/knowledge` 知识库
- `/memories` 记忆页
- `/settings` 设置页

---

## 4. 节点与图模型

当前阶段标准支持以下节点类型：

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

当前阶段标准支持以下边模型：

- `normal`
- `branch`

其中：

- 普通节点默认只有一个主后继
- 分支必须通过 `condition` 节点完成
- `branch` 当前支持 `pass / revise / fail`

---

## 5. 技术栈

### 前端
- React / Next.js
- TypeScript
- React Flow
- Zustand
- 自定义 CSS

### 后端
- Python
- FastAPI
- Pydantic
- LangGraph
- 本地 JSON 存储

---

## 6. 建议目录结构

```text
repo/
├── frontend/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── stores/
│   └── types/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── compiler/
│   │   ├── runtime/
│   │   ├── evaluator/
│   │   ├── knowledge/
│   │   ├── memory/
│   │   ├── skills/
│   │   ├── storage/
│   │   ├── schemas/
│   │   └── main.py
│   └── data/
│       ├── graphs/
│       ├── kb/
│       ├── memories/
│       └── runs/
├── GRAPHITEUI_SPEC.md
├── GRAPHITEUI_ARCHITECTURE.md
├── GRAPHITEUI_TASKS.md
├── GRAPHITEUI_ACCEPTANCE_CRITERIA.md
└── README.md
```

---

## 7. 核心运行流程

### 编辑流程
1. 进入 Workspace
2. 新建 graph 或打开已有 graph
3. 跳转 Editor
4. 拖拽节点和连线
5. 配置节点参数
6. Validate
7. Save

### 运行流程
1. 点击 Run
2. 前端提交 graph json 到后端
3. 后端校验 graph
4. 后端将 graph 编译成 workflow config
5. 后端构建 LangGraph workflow
6. Runtime 执行 workflow
7. 前端读取 current node 和 node status
8. 用户查看节点执行摘要和最终结果

---

## 8. 关键接口

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

## 9. 本地开发启动

### 当前可直接启动的部分

目前可以直接启动前后端开发环境。为减少常见端口冲突，默认使用：

- 前端：`3477`
- 后端：`8765`

启动方式：

```bash
make backend-install
make frontend-install
make backend-dev
make frontend-dev
```

也可以直接一键启动前后端：

```bash
./scripts/dev_up.sh
```

建议演示入口：

```bash
http://localhost:3477/workspace
http://localhost:3477/editor/demo-graph
http://localhost:3477/editor/slg-creative-factory
http://localhost:3477/runs
```

目前可以直接启动后端最小骨架：

```bash
make backend-install
make backend-dev
```

健康检查：

```bash
make backend-health
```

默认地址：

```bash
http://localhost:8765/health
```

### 前端

前端目录已预留，但尚未初始化为完整 Next.js 应用。

后续建议在 `frontend/` 内完成初始化后再使用：

```bash
cd frontend
npm install
npm run dev
```

默认访问地址：
```bash
http://localhost:3477
```

### 后端

当前后端最小骨架可直接使用以下方式启动：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8765
```

默认访问地址：
```bash
http://localhost:8765
```

---

## 10. 示例与验收

当前仓库已提供：

- 示例图目录：`examples/`
- 验收手册：[acceptance_runbook.md](/home/abyss/GraphiteUI/docs/acceptance_runbook.md)

建议先用以下三个文件做验证：

- [graph_minimal_pass.json](/home/abyss/GraphiteUI/examples/graph_minimal_pass.json)
- [graph_revise.json](/home/abyss/GraphiteUI/examples/graph_revise.json)
- [slg_creative_factory_graph.json](/home/abyss/GraphiteUI/examples/slg_creative_factory_graph.json)

### 健康检查
```bash
curl http://localhost:8000/health
```

预期结果：
```json
{"status": "ok"}
```

---

## 10. 本地数据准备

### graph 数据
存放在：
```text
backend/data/graphs/
```

### 知识库数据
存放在：
```text
backend/data/kb/
```

### 记忆数据
存放在：
```text
backend/data/memories/
```

### run 数据
存放在：
```text
backend/data/runs/
```

---

## 11. 推荐开发顺序

1. 初始化前后端项目
2. 完成 graph schema 和 graph API
3. 完成 compiler 与 runtime 骨架
4. 接入 knowledge / memory / skills / evaluator
5. 完成 persistence
6. 完成 Workspace 和 Editor 页面骨架
7. 接入 React Flow
8. 打通 Save / Validate / Run
9. 打通 runs、knowledge、memories 页面
10. 准备样例 graph 和演示路径

---

## 12. 与 Codex 配合开发建议

建议只让 Codex 一次处理一个小任务块，不要一次性让它修改整个项目。

### 适合单次交给 Codex 的任务示例
- 初始化 graph schema 和 validate 接口
- 实现 graph save/load API
- 实现 runtime state 和基础节点骨架
- 实现 Editor 页面骨架
- 实现 React Flow 画布
- 实现节点配置面板
- 打通 Run 按钮与 run status 展示

### 每次给 Codex 的输入最好明确写出
- 目标文件
- 目标功能
- 完成标准
- 验证方式

---

## 13. 演示顺序建议

推荐面试演示顺序：

1. 首页：说明 GraphiteUI 定位
2. Workspace：说明这是总览与入口
3. Editor：演示拖拽、连线、配置
4. Validate：说明 graph 不是随便画的
5. Run：触发运行
6. 节点状态：展示白盒可观测性
7. 节点摘要：展示每步执行结果
8. Runs：展示历史沉淀
9. Knowledge / Memories：展示资产页

---

## 14. 配套文档

本项目配套文档包括：

- `GRAPHITEUI_SPEC.md`
- `GRAPHITEUI_ARCHITECTURE.md`
- `GRAPHITEUI_TASKS.md`
- `GRAPHITEUI_ACCEPTANCE_CRITERIA.md`

各文档职责：

- `GRAPHITEUI_SPEC.md`：定义产品范围和边界
- `GRAPHITEUI_ARCHITECTURE.md`：定义前后端架构和模块边界
- `GRAPHITEUI_TASKS.md`：定义可执行开发任务
- `GRAPHITEUI_ACCEPTANCE_CRITERIA.md`：定义验收标准

---

## 15. 一句话总结

GraphiteUI 的目标不是“做一个像 ComfyUI 的画布”，而是：

**做一个能把可视化 graph 转成真实 LangGraph workflow，并把执行过程白盒化展示出来的 Agent 编排工作台。**

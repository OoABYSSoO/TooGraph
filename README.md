# 💎 GraphiteUI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

> A Visual Node-Based Editor & Runtime Workspace for LangGraph-style Agent Workflows

GraphiteUI 是一款面向 AI Agent 工作流开发的可视化编排工作台。它把接近 LangGraph 心智的 graph、state、skills、cycles 和 runtime 执行过程，收敛成一套可编辑、可校验、可运行的节点系统。

在 GraphiteUI 中，开发者可以通过拖拽节点、连线、配置 state、挂载 skills 和知识库，清楚地看到一个 agent graph 是如何被保存、校验、运行和追踪的。当前正式心智是：`state` 是唯一数据源，节点只负责读写 state，`edges` 和 `conditional_edges` 负责表达执行依赖与分支关系。

> 当前状态：`node_system` 已经是唯一正式协议，Vue 前端迁移也已经完成；首页、编辑器、运行记录、运行详情和设置页都已经回到正式主链。当前还在继续推进的是产品路线图层的 WebSocket 推送、人类在环前端、导出入口、memory 和更强的 knowledge base 管理，而不是这次迁移本身。

---

## ✨ 核心特性 (Key Features)

### 🔷 可视化 Graph 与 State 编排

将复杂的 Agent 工作流转化为所见即所得的节点拓扑图，并用统一的 `node_system` 协议保存 graph、nodes、edges、state 和运行配置。

| 功能 | 状态 |
|------|------|
| 节点拖拽与放置 | ✅ 已完成 |
| 节点连线与 state 引用 | ✅ 已完成 |
| 条件分支 (Conditional Edges) | ✅ 已完成 |
| 循环逻辑 (Cycles) | ✅ 已完成基础执行主链 |
| 节点参数配置面板 | ✅ 已完成 |
| State Panel 图内编辑 | ✅ 已完成 |
| JSON 模板单一来源 | ✅ 已完成 |
| 图 / 预设 / 运行记录 JSON 存储 | ✅ 已完成 |

### 🔷 白盒化可观测性 (Full Observability)

运行 graph 时，系统会记录结构化运行结果，包括节点执行信息、state snapshot、state events、skills 输出、knowledge summary 和 cycles 轮次信息。

| 功能 | 状态 |
|------|------|
| 节点执行状态高亮 | ✅ 已完成 |
| 节点级执行明细 | ✅ 已完成 |
| State Snapshot / Events | ✅ 已完成 |
| Knowledge Summary | ✅ 已完成 |
| Cycle Summary / Iterations | ✅ 已完成 |
| WebSocket 实时推送 | 🔜 计划中 |

### 🔷 知识库与技能驱动执行

GraphiteUI 当前支持正式知识库资源和显式技能挂载。用户仍通过 input 节点把 knowledge base 传给 agent，运行时由 `search_knowledge_base` skill 执行真实检索。

| 功能 | 状态 |
|------|------|
| 显式 skills 挂载 | ✅ 已完成 |
| knowledge base 输入到 agent | ✅ 已完成 |
| SQLite FTS 检索 | ✅ 已完成 |
| Python 官方文档库 | ✅ 已导入 |
| LangGraph 官方文档库 | ✅ 已导入 |
| GraphiteUI 项目知识库 | ✅ 已导入 |

### 🔷 意图驱动开发 (Meta-Agent Architect) | 🔜 计划中

> 仍在规划中。目标是基于自然语言需求自动辅助生成 graph、state schema 和节点配置，但目前还不是正式能力。

### 🔷 人类在环 (Human-in-the-Loop) | 🔜 计划中（后端主链已具备）

> 后端已经具备 LangGraph 的 interrupt / checkpoint / resume 主链，并支持等待人工输入后的恢复执行；但前端断点配置、恢复面板和人工介入审计闭环还没有产品化完成。

### 🔷 代码双向同步 (Zero-Friction Compilation) | 🔜 计划中（后端接口已具备）

> 后端已经支持将图导出为可执行的 LangGraph Python 源码；前端的导出入口、源码预览和下载交互仍在路线图中。

---

## 🛠️ 技术选型 (Tech Stack)

### 前端 (Frontend)

- **核心框架**: Vue 3 + Vite + TypeScript
- **路由**: Vue Router
- **状态管理**: Pinia
- **交互基元**: Reka UI
- **画布与节点系统**: 自定义实现

### 后端 (Backend)

- **核心语言**: Python 3.11+
- **Web 框架**: FastAPI
- **数据校验**: Pydantic
- **Agent 底层框架**: LangGraph + LangChain
- **持久化**:
  - Knowledge Base: SQLite + FTS5
  - Graph / Preset / Run / Settings / Skill State: JSON Files

---

## 🚀 快速开始 (Quick Start)

### 环境要求

- Node.js 20.9+
- Python 3.11+
- (可选) OpenAI-compatible API 或本地 LLM

### 安装与启动

```bash
# 克隆仓库
git clone https://github.com/AbyssBadger0/GraphiteUI.git
cd GraphiteUI

# 一键启动前后端
./scripts/start.sh
```

或者手动启动：

```bash
# 后端
make backend-install
make backend-dev

# 前端
make frontend-install
make frontend-dev
```

启动后访问：

- 前端: http://localhost:3477
- 后端 API: http://localhost:8765
- 健康检查: http://localhost:8765/health

如需重新导入正式知识库：

```bash
python scripts/import_official_knowledge_bases.py
```

### 环境变量 (可选)

```bash
# 本地 LLM 配置
LOCAL_BASE_URL=http://localhost:11434  # 或 OpenAI 地址
LOCAL_API_KEY=sk-xxx
LOCAL_TEXT_MODEL=gpt-4o  # 或 ollama 模型名
```

---

## 📁 项目结构 (Project Structure)

```
GraphiteUI/
├── frontend/                 # Vue + Vite 前端
│   ├── src/
│   │   ├── api/              # 前端 API 封装
│   │   ├── editor/           # 画布、节点、状态面板与工作区
│   │   ├── layouts/          # 页面壳层
│   │   ├── pages/            # 首页 / 编辑器 / runs / settings
│   │   ├── router/           # Vue Router 配置
│   │   ├── stores/           # Pinia stores
│   │   └── types/            # 协议与运行态类型
├── backend/                  # FastAPI 后端
│   └── app/
│       ├── api/              # API 路由
│       ├── core/             # 核心模块
│       │   ├── compiler/     # Graph 校验与编译前处理
│       │   ├── runtime/      # 工作流执行器
│       │   ├── schemas/      # Pydantic 模型
│       │   └── storage/      # JSON 与知识库存储
│       ├── knowledge/        # 知识库导入与检索
│       └── templates/        # 工作流模板
├── knowledge/                # GraphiteUI 项目知识库源文件
├── docs/                     # 开发文档
└── demo/                     # 参考示例
```

---

## 📚 知识库在哪里

知识库有两个层次：

1. 源文件层

- GraphiteUI 项目知识库的源文件主要在 [knowledge/GraphiteUI-official](knowledge/GraphiteUI-official)。
- 另外还会合并项目内的 [README.md](README.md) 和 [current_project_status.md](docs/current_project_status.md)。
- Python 和 LangGraph 的知识库源不是仓库里手写的文档，而是在导入时从官方站点抓取或下载。

2. 导入后的正式存储层

- 三个知识库导入后都统一落到 [backend/data/kb](backend/data/kb) 这一层。
- 每个知识库各自有一个目录保存 `manifest.json`，例如：
  - [backend/data/kb/graphiteui-official/manifest.json](backend/data/kb/graphiteui-official/manifest.json)
  - [backend/data/kb/python-official-3.14/manifest.json](backend/data/kb/python-official-3.14/manifest.json)
  - [backend/data/kb/langgraph-official-v1/manifest.json](backend/data/kb/langgraph-official-v1/manifest.json)
- 真正用于检索的数据索引在 SQLite 里，由后端统一管理。

除知识库外，其余运行态数据当前都走 JSON 文件存储：

- graph: [backend/data/graphs](backend/data/graphs)
- presets: [backend/data/presets](backend/data/presets)
- runs: [backend/data/runs](backend/data/runs)
- settings: [backend/data/settings](backend/data/settings)
- skill registry state: [backend/data/skills](backend/data/skills)

结论很简单：

- 源文件层不完全一样
- 导入后的正式知识库位置是一样的
- GraphiteUI、Python、LangGraph 三个库在运行时属于同一套知识库系统

---

## 📖 当前阶段与路线图

| 阶段 | 功能 | 状态 |
|------|------|------|
| v0.1 | 可视化节点编排基础 | ✅ 已完成 |
| v0.2 | Graph 保存/加载/校验 | ✅ 已完成 |
| v0.3 | 运行时主链与 skills | ✅ 已完成 |
| v0.4 | 执行状态与 run detail | ✅ 已完成 |
| v0.5 | State Panel 与 state 编辑 | ✅ 已完成 |
| v0.6 | 正式协议原生化与兼容层删除 | ✅ 已完成 |
| v0.7 | LangGraph-native 后端迁移 | ✅ 已完成 |
| v0.8 | Vue 前端迁移与旧前端主逻辑恢复 | ✅ 已完成 |
| v0.9 | Cycles / Knowledge Base 增强 | ⚙️ 进行中 |
| v1.0 | Memory / 人类在环前端 / 导出入口 / WebSocket 推送 | 🔜 计划中 |

---

## 🎯 快速演示路径

1. **Home** (`/`) — 工作台入口，查看最近 graphs、templates 和 runs
2. **Editor** (`/editor`) — 选择模板或新建 graph
3. **Editor 画布** — 拖拽节点、连线、配置参数
4. **Validate** — 校验 graph 合法性
5. **Run** — 触发执行，查看节点执行状态
6. **Runs** (`/runs`) — 查看历史运行记录与结果

---

## 📝 许可证 (License)

本项目基于 [MIT License](LICENSE) 开源。

---

## 🙏 致谢 (Acknowledgments)

- [LangGraph](https://github.com/langchain-ai/langgraph) — Agent 执行框架
- [Vue](https://vuejs.org/) — 前端框架
- [Reka UI](https://www.reka-ui.com/) — 交互基元
- [ComfyUI](https://github.com/comfy-org/ComfyUI) — 节点式工作流设计灵感

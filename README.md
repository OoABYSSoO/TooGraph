# 💎 GraphiteUI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

> A Visual Node-Based Editor & Runtime Workspace for LangGraph Agent Workflows

GraphiteUI 是一款专为 AI Agent 开发者设计的可视化编排工作台。它将 LangGraph 底层复杂的状态机（State Machine）逻辑，转化为直观的、类似 ComfyUI 的节点连线界面。

在 GraphiteUI 中，开发者告别了难以追踪的"黑盒"代码逻辑，可以通过拖拽节点、连线和配置状态，精准掌控 Agent 的每一步流转。

> **路线图**：LangGraph 的完整循环图（Cycles）支持已在路线图中规划，当前运行时基于 DAG（Directed Acyclic Graph）架构，可处理条件分支、重试和子图编排。

---

## ✨ 核心特性 (Key Features)

### 🔷 可视化状态机编排 (Visual State Machine)

将复杂的 Agent 工作流转化为所见即所得的节点拓扑图。原生支持条件分支（Conditional Edges），未来将扩展循环逻辑（Cycles）。

| 功能 | 状态 |
|------|------|
| 节点拖拽与放置 | ✅ 已完成 |
| 节点连线与数据流 | ✅ 已完成 |
| 条件分支 (Conditional Edges) | ✅ 已完成 |
| 循环逻辑 (Cycles) | 🔜 计划中（LangGraph 循环图支持） |
| 节点参数配置面板 | ✅ 已完成 |
| 模板化节点预设 | ✅ 已完成 |

### 🔷 白盒化可观测性 (Full Observability)

运行 Agent 时，画布会实时高亮当前正在执行的节点。支持查看节点执行摘要与最终结果。

| 功能 | 状态 |
|------|------|
| 节点执行状态高亮 | ✅ 已完成 |
| 运行时状态面板 | ⚙️ 开发中 |
| 节点级执行明细 | ⚙️ 开发中 |
| 状态快照对比 (State Diff) | 🔜 计划中 |
| WebSocket 实时推送 | 🔜 计划中 |

### 🔷 意图驱动开发 (Meta-Agent Architect) | 🔜 计划中

> 内置 AI 开发助手。只需输入一句自然语言需求，系统即可自动推导并生成全局 State Schema（数据字典结构），并自动为 LLM 节点填充最佳 System Prompt 和变量占位符。

### 🔷 人类在环 (Human-in-the-Loop) | 🔜 计划中

> 完美映射 LangGraph 的中断机制（Interrupts）。可在图表的特定连线上设置可视化断点，工作流运行至此自动挂起，等待人工干预修改 State 后继续流转。

### 🔷 代码双向同步 (Zero-Friction Compilation) | 🔜 计划中

> 在界面上连线构建的拓扑图，可一键编译为生产级标准的 LangGraph Python 脚本。

---

## 🛠️ 技术选型 (Tech Stack)

### 前端 (Frontend)

- **核心框架**: Next.js 15 + React 19 + TypeScript
- **节点可视化引擎**: React Flow (xyflow v12)
- **状态管理**: Zustand
- **样式**: Tailwind CSS v4 + shadcn/ui

### 后端 (Backend)

- **核心语言**: Python 3.11+
- **Web 框架**: FastAPI
- **数据校验**: Pydantic
- **Agent 底层框架**: LangGraph + LangChain
- **持久化**: SQLite

---

## 🚀 快速开始 (Quick Start)

### 环境要求

- Node.js 18+
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
├── frontend/                 # Next.js 前端
│   ├── app/                  # App Router 页面
│   ├── components/          # React 组件
│   │   ├── editor/           # 节点编辑器核心
│   │   └── skills/           # 技能管理
│   ├── lib/                  # 工具函数与预设
│   └── stores/               # Zustand 状态管理
├── backend/                  # FastAPI 后端
│   └── app/
│       ├── api/              # API 路由
│       ├── core/             # 核心模块
│       │   ├── compiler/     # Graph → LangGraph 编译
│       │   ├── runtime/      # 工作流执行器
│       │   ├── schemas/      # Pydantic 模型
│       │   └── storage/      # SQLite 持久化
│       └── templates/        # 工作流模板
├── docs/                     # 开发文档
└── demo/                     # 参考示例
```

---

## 📖 功能路线图 (Roadmap)

| 阶段 | 功能 | 状态 |
|------|------|------|
| v0.1 | 可视化节点编排基础 | ✅ 已完成 |
| v0.2 | Graph 保存/加载/校验 | ✅ 已完成 |
| v0.3 | LangGraph 运行时对接 | ✅ 已完成 |
| v0.4 | 执行状态可视化 | ⚙️ 进行中 |
| v0.5 | State Schema 编辑器 | 🔜 计划中 |
| v0.6 | WebSocket 实时推送 | 🔜 计划中 |
| v0.7 | 人类在环断点机制 | 🔜 计划中 |
| v0.8 | 代码导出 (Python) | 🔜 计划中 |
| v1.0 | Meta-Agent 意图驱动 | 🔜 计划中 |

---

## 🎯 快速演示路径

1. **Workspace** (`/workspace`) — 总览入口，查看最近 graphs 和 runs
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
- [React Flow](https://reactflow.dev/) — 节点可视化引擎
- [shadcn/ui](https://ui.shadcn.com/) — UI 组件库
- [ComfyUI](https://github.com/comfy-org/ComfyUI) — 节点式工作流设计灵感

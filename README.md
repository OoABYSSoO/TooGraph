# GraphiteUI

GraphiteUI 是一个面向 LangGraph 风格 Agent 工作流的可视化编排与运行工作台。它把 graph、state、节点、数据流、顺序流、条件分支和运行反馈统一到一套可保存、可校验、可运行的 `node_system` 协议里。

当前项目已经完成 Vue 前端迁移，正式主链是：

- 前端：Vue 3 + Vite + TypeScript + Pinia + Element Plus
- 后端：FastAPI + Pydantic + LangGraph
- 协议：`node_system` 是唯一正式图协议，`state_schema` 是唯一正式数据源
- 存储：graph / preset / run / settings / skill state 使用 JSON 文件，knowledge base 使用 SQLite + FTS

## 当前能力

### 可视化编排

- 四类核心节点：`input`、`agent`、`condition`、`output`
- 数据流：节点通过 state 引用读写同一份 `state_schema`
- 顺序流：普通执行边和条件节点分支边都能在画布上编辑
- 条件节点：作为 LangGraph 条件边的具象化入口，支持 true / false / exhausted 分支和 1-10 次循环上限
- 节点创建：支持空画布双击创建、从输出/流程手柄拖出创建、文件拖入生成 input 节点、保存并复用 agent preset
- 画布交互：节点拖拽、线条吸附、边删除确认、状态端口编辑、右下角缩略图、线条显示模式工具条
- UI 策略：优先使用 Element Plus 和 `@element-plus/icons-vue`，自定义 UI 主要集中在画布、节点和连线这些编辑器专属区域

### 运行与观察

- graph 保存、校验、运行
- run 列表和 run detail
- 节点级执行状态、active path 高亮和 output preview
- LangGraph runtime 只把 agent 编译为真实节点；input / output / condition 作为视觉边界和条件边代理
- state snapshot、state events、skill outputs、knowledge summary
- cycle summary / cycle iterations
- 后端具备 LangGraph Python 源码导出接口
- 后端具备 interrupt / checkpoint / resume 主链，前端人类在环闭环仍在路线图中

### Skills 与知识库

- agent 节点显式挂载 skills
- knowledge base 可以通过 input 节点进入图
- 当 agent 读取 knowledge base state 时，编辑器会同步 `search_knowledge_base` skill
- 项目内置 GraphiteUI / Python / LangGraph 三类正式知识库导入路径
- 技能定义会从 `skill/`、`backend/app/skills` 和兼容的外部 skill 目录中解析

## 快速开始

### 环境要求

- Node.js 20.9+
- Python 3.11+
- 可选：OpenAI-compatible API 或 EZLLM 本地 runtime

### 安装依赖

首次运行前先安装前后端依赖：

```bash
git clone https://github.com/AbyssBadger0/GraphiteUI.git
cd GraphiteUI
npm --prefix frontend install
python -m pip install -r backend/requirements.txt
```

如果系统里的 Python 命令是 `python3`，可以把最后一行换成：

```bash
python3 -m pip install -r backend/requirements.txt
```

### 启动

推荐使用 Node 跨平台启动器，Windows / macOS / Linux / WSL 都可以走同一套流程：

```bash
npm run dev
```

这条命令等价于：

```bash
node scripts/start.mjs
```

Windows PowerShell 如果拦截 `npm.ps1`，使用 `npm.cmd` 即可绕过执行策略限制：

```powershell
npm.cmd run dev
```

如果 Python 安装在 Conda 环境中，或没有加入 PATH，可以显式指定解释器后再启动：

```powershell
$env:PYTHON = "C:\ProgramData\miniconda3\python.exe"
npm.cmd run dev
```

类 Unix 环境也可以继续使用 Bash 启动脚本：

```bash
./scripts/start.sh
```

默认端口：

- 前端：http://127.0.0.1:3477
- 后端：http://127.0.0.1:8765
- 健康检查：http://127.0.0.1:8765/health

Node 启动器和 `scripts/start.sh` 都会释放已占用的前后端端口，并把日志写入：

在 macOS / Linux 上，Node 启动器会优先使用 `lsof` 查找端口占用，其次尝试 `fuser`；Windows 下会使用 `netstat` / `taskkill`。

- `.dev_frontend.log`
- `.dev_backend.log`

### 手动命令

```bash
make frontend-install
make frontend-dev
make frontend-build

make backend-install
make backend-dev
make backend-health
```

### 本地 runtime（EZLLM）

推荐把本地模型 runtime 交给 EZLLM 管理：

```bash
pipx install ezllm
ezllm start
LOCAL_BASE_URL=http://127.0.0.1:8888/v1
LOCAL_TEXT_MODEL=your-local-model
```

如果你的 EZLLM 网关需要鉴权，再额外设置 `LOCAL_API_KEY`。GraphiteUI 自身的开发环境仍然使用上面的 `npm run dev` 或 `node scripts/start.mjs` 启动。

也兼容这些别名：

- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `TEXT_MODEL`

### 导入官方知识库

```bash
python scripts/import_official_knowledge_bases.py
```

## 项目结构

```text
GraphiteUI/
├── frontend/
│   ├── src/api/              # 前端 API 封装
│   ├── src/editor/           # 画布、节点、状态面板、工作区
│   ├── src/layouts/          # 应用壳层和侧栏
│   ├── src/pages/            # Home / Editor / Runs / Run Detail / Settings
│   ├── src/router/           # Vue Router
│   ├── src/stores/           # Pinia stores
│   ├── src/styles/           # 全局样式和 Element Plus 主题覆盖
│   └── src/types/            # 图协议和运行态类型
├── backend/
│   └── app/
│       ├── api/              # graphs / runs / templates / presets / settings / skills / knowledge
│       ├── core/compiler/    # node_system 校验
│       ├── core/langgraph/   # LangGraph runtime 与 codegen
│       ├── core/runtime/     # 执行状态、state、输出边界工具
│       ├── core/schemas/     # Pydantic schemas
│       ├── core/storage/     # JSON 和 SQLite 存储
│       ├── knowledge/        # 知识库导入、切分、检索
│       └── templates/        # 内置 graph 模板
├── knowledge/GraphiteUI-official/
│   └── *.md                  # GraphiteUI 项目知识库源文档
├── docs/
│   ├── current_project_status.md
│   └── future/
├── skill/                    # 可挂载 skill 定义
└── scripts/
```

## 核心 API

| API | 作用 |
| --- | --- |
| `GET /health` | 后端健康检查 |
| `GET /api/graphs` | 列出已保存 graph |
| `POST /api/graphs/save` | 保存 graph |
| `POST /api/graphs/validate` | 校验 graph |
| `POST /api/graphs/run` | 运行 graph |
| `POST /api/graphs/export/langgraph-python` | 导出 LangGraph Python 源码 |
| `GET /api/runs` | 列出运行记录 |
| `GET /api/runs/{run_id}` | 查看运行详情 |
| `POST /api/runs/{run_id}/resume` | 从 failed / paused / awaiting_human 状态恢复运行 |
| `GET /api/templates` | 列出内置模板 |
| `GET /api/presets` | 列出 agent presets |
| `GET /api/knowledge/bases` | 列出知识库 |
| `GET /api/skills/definitions` | 列出可用 skills |
| `GET /api/settings` / `POST /api/settings` | 读取和更新设置 |

## 内置模板

当前内置模板位于 `backend/app/templates/`：

- `hello_world.json`
- `knowledge_base_validation.json`
- `conditional_edge_validation.json`
- `cycle_counter_demo.json`

这些模板都使用当前 `node_system` 协议，不再保留旧协议兼容模板。

## 文档策略

当前文档只保留仍有维护价值的内容：

- `README.md`：项目主入口和当前能力说明
- `docs/current_project_status.md`：当前状态快照，也是知识库导入源之一
- `docs/future/`：仍然有效的长期设想
- `knowledge/GraphiteUI-official/`：项目知识库源文档
- `CLAUDE.md` / `AGENTS.md`：协作代理工作说明

已经完成使命的迁移计划、临时进度记录、一次性分析报告和偏离当前实现的设计稿不再保留。

## 未来方向

### 近期路线图

- WebSocket 实时运行推送
- 更完整的人类在环前端：断点配置、恢复输入、暂停审计
- LangGraph Python 导出 UI：源码预览、下载、运行说明
- memory 的写入、召回、展示和调试
- cycles 更高级的终止策略和可视化
- 知识库管理：更新、删除、重建索引、检索质量评估

### 桌宠 Agent 与自动编排图

GraphiteUI 的长期方向不是只提供一个画布，而是提供一个可见、可控、可验证的 Agent 协作层。

未来可以引入一个桌宠 Agent 作为交互入口。它可以用轻量 HTML/CSS、SVG 或前端动画能力绘制，停靠在画布或侧栏附近，具备待机、观察、思考、建议、执行、等待确认、完成和失败等状态。它不应该模拟 DOM 点击，而应该通过明确的图编辑命令操作 GraphiteUI，例如创建节点、连接 state、连接流程线、打开面板、校验图、运行图和保存图。

自动编排图分两种模式：

1. 规划后等待人类确认：Agent 根据任务生成 graph 草案，用户检查和调整后手动运行。
2. 边走边画的自主编排：Agent 在授权后逐步创建节点、连接线、运行校验、根据反馈继续生长图，直到认为图能完成任务，再保存和运行。

这条路线的硬性边界是：所有修改必须可见、可撤销、可审计；删除、覆盖、运行和可能产生费用的操作必须确认；Agent 不能绕过 GraphiteUI 的校验器，也不能直接写不可见状态。

## License

MIT License

## Acknowledgments

- LangGraph
- Vue
- Element Plus
- ComfyUI

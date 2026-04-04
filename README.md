# GraphiteUI

GraphiteUI 是一个面向 Agent 工作流的可视化编排与运行工作台。它把 graph、state、节点、数据流、顺序流、条件分支、运行记录和人工确认统一到一套可保存、可校验、可运行的 `node_system` 协议里。

项目当前由 Vue 前端、FastAPI 后端和 LangGraph 运行时组成，适合用来搭建、调试和观察基于状态流转的 Agent graph。

## 当前仓库状态

- 前端：Vue 3、Vite、TypeScript、Pinia、Vue Router、Element Plus、vue-i18n。
- 后端：FastAPI、Pydantic、LangGraph、SQLite FTS、JSON 文件存储。
- 图协议：`node_system` 描述节点、状态、边、运行配置和画布布局；`state_schema` 是节点读写状态的统一来源。
- 启动方式：仓库根目录使用 `npm start`，实际执行 `node scripts/start.mjs`，构建前端后由 FastAPI 在单个端口同时服务 UI 和 API。
- 本地数据：graph、preset、run、settings、skill state 和 checkpoint 写入 `backend/data/`；knowledge base 使用 SQLite + FTS。
- 主要页面：Home、Editor、Runs、Run Detail、Settings。

## 核心能力

### 可视化编辑器

- 支持 `input`、`agent`、`condition`、`output` 四类核心节点。
- 通过 `state_schema` 连接节点输入和输出，区分数据流、顺序流和条件分支。
- `condition` 节点支持 true / false / exhausted 分支和循环上限配置。
- 支持画布拖拽、节点选择、连线、边删除确认、节点端口编辑、右下角缩略图、线条显示模式和运行态高亮。
- 支持从空画布、节点输出端口、流程端口和文件拖入创建节点。
- 支持多图页签、保存状态提示、未保存关闭确认、模板创建、已有图打开和运行记录恢复编辑。
- 支持编辑器内 State 面板和 Human Review 面板；图进入人工确认暂停时，画布保持可查看但不可编辑。
- 支持多语言界面：简体中文、繁體中文、English、日本語、한국어、Español、Français、Deutsch。

### 运行与观察

- 支持保存、校验、运行 graph。
- LangGraph runtime 会把可执行 graph 编译为后端运行计划，并记录状态快照、节点状态、输出预览、artifacts、warnings 和 errors。
- 支持 checkpoint、pause snapshot、completed snapshot，以及从可恢复快照继续运行。
- 支持断点暂停后的 Human Review 输入，继续运行前可以填写当前需要人工补充的 state。
- 支持 SSE/EventSource 运行事件流，Editor 可以实时更新 Run Activity 和 Output 节点预览。
- Runs 首页支持状态筛选、搜索、分页、断点结果和最终结果切换。
- Run Detail 页面展示运行概览、节点过程、循环信息、state、artifacts、输出预览和恢复编辑入口。
- 后端提供 LangGraph Python 源码导出和 Python 源码导入接口。

### 模型 Provider

GraphiteUI 把默认模型入口视为 OpenAI-compatible 自定义 Provider。你可以接本地模型网关、私有模型网关或云端兼容网关。

主要环境变量：

```bash
LOCAL_BASE_URL=http://127.0.0.1:8888/v1
LOCAL_API_KEY=sk-local
LOCAL_TEXT_MODEL=your-model-name
```

也支持这些别名：

- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `TEXT_MODEL`
- `LOCAL_LLM_BASE_URL`
- `LOCAL_LLM_API_KEY`
- `LOCAL_LLM_MODEL`

Settings 页面会读取后端模型目录。当前代码里 `local` Provider 是可用入口，OpenAI、Anthropic、Google Gemini 和 OpenRouter 作为 Provider 配置入口保留在模型目录中。

### Skills 与知识库

- 图整体才是 Agent；单个 LLM 节点只做一次模型运行，并且最多使用一个显式能力来源。
- LLM 节点可以显式选择一个 Skill；动态 `subgraph` state 主要服务于桌宠主循环这类模板内能力选择，手动复用图仍通过 Subgraph 节点完成。
- LLM 节点手动选择的 Skill 存在 `config.skillKey` 单值字段中，不使用 `config.skills` 数组，避免把单节点能力误解成多技能挂载。
- Knowledge base 可以通过 input 节点进入 graph。
- Knowledge base 不再隐式挂载旧内置检索 skill；需要检索时，应通过 `skill/<skill_key>` 文件夹提供带 `skill.json` manifest 的显式 skill。
- 项目自带 `knowledge/GraphiteUI-official/` 作为 GraphiteUI 官方知识库源文档。
- 后端支持 knowledge base 导入、切分、FTS 检索和 catalog 查询。
- Git 管理的官方 Skill 定义来自 `skill/<skill_key>/` 文件夹；用户自定义 Skill 写入 `backend/data/skills/user/<skill_key>/`，属于本地用户数据，不进入 Git 管理。
- 当前官方 Skill 包包括 `web_search`、`graphiteui_capability_selector`、`graphiteUI_skill_builder`、`graphiteUI_script_tester` 和 `local_workspace_executor`。
- `web_search` 使用 `before_llm.py` 在技能入参规划前补充当前日期，使用 `after_llm.py` 执行联网搜索、引用整理、可选网页正文抓取、本地 source document artifact 输出，并把原文网址写入下载后的本地文档。
- `graphiteui_capability_selector` 使用 `before_llm.py` 列出当前启用的图模板和可选 Skill 清单，再用 `after_llm.py` 校验并规范化模型选择的单个 `capability` state。
- `graphiteUI_skill_builder` 使用 `before_llm.py` 注入当前 Skill 编写指南，生成 `skill.json`、`SKILL.md`、`before_llm.py`、`after_llm.py` 四类文件内容；它不负责写入、测试、修复或启用生成的 Skill。
- `graphiteUI_script_tester` 接收 Python 脚本源码和 LLM 生成的 pytest 用例，在临时目录运行测试并返回状态、摘要、stdout、stderr、退出码和结构化错误；它声明 `pytest` 依赖且需要执行确认。
- `local_workspace_executor` 在白名单内读取文件、写入 `backend/data`、执行 `backend/data/tmp` 或 `backend/data/skills/user` 下的脚本，并对 `.git`、`.env`、`backend/data/settings` 做硬拒绝；它涉及本地写入和进程执行，需要显式确认。
- Output 节点可以读取 `local_path` 指向的本地 artifact，按类型预览文档、图片和视频。

## 快速开始

### 环境要求

- Node.js 20.9+
- Python 3.11+
- 一个可选的 OpenAI-compatible 模型网关

### 安装依赖

```bash
git clone https://github.com/AbyssBadger0/GraphiteUI.git
cd GraphiteUI
npm --prefix frontend install
python -m pip install -r backend/requirements.txt
```

如果系统里的 Python 命令是 `python3`：

```bash
python3 -m pip install -r backend/requirements.txt
```

### 配置模型入口

如果需要运行 LLM 节点，先在启动 GraphiteUI 前配置模型入口：

```bash
export LOCAL_BASE_URL=http://127.0.0.1:8888/v1
export LOCAL_API_KEY=sk-local
export LOCAL_TEXT_MODEL=your-model-name
```

PowerShell 示例：

```powershell
$env:LOCAL_BASE_URL = "http://127.0.0.1:8888/v1"
$env:LOCAL_API_KEY = "sk-local"
$env:LOCAL_TEXT_MODEL = "your-model-name"
```

如果只查看 UI、编辑 graph 或浏览已有运行记录，可以先不配置模型入口。

### 启动 GraphiteUI

推荐从仓库根目录启动：

```bash
npm start
```

这条命令会执行：

```bash
node scripts/start.mjs
```

默认地址：

- GraphiteUI：http://127.0.0.1:3477
- 健康检查：http://127.0.0.1:3477/health

启动器会先构建 `frontend/dist`，释放占用的 GraphiteUI 端口，然后启动单个 FastAPI 服务。日志写入：

- `.graphiteui_server.log`

如果需要改端口：

```bash
PORT=3999 npm start
```

Windows PowerShell 如果拦截 `npm.ps1`，使用：

```powershell
npm.cmd start
```

如果 Python 没有加入 PATH，可以显式指定解释器：

```powershell
$env:PYTHON = "C:\ProgramData\miniconda3\python.exe"
npm.cmd start
```

类 Unix 环境也可以使用 Bash wrapper：

```bash
./scripts/start.sh
```

## 第一次运行一个 graph

1. 打开 http://127.0.0.1:3477。
2. 进入 Editor，新建 graph 或选择内置模板。
3. 创建 `input -> agent -> output` 的最小流程。
4. 在 `input` 节点填写输入，在 `agent` 节点选择模型并填写提示词。
5. 保存并校验 graph。
6. 点击 Run。
7. 在 Editor 查看节点运行态和输出预览，或进入 Runs / Run Detail 查看完整记录。

如果 graph 触发断点暂停，编辑器会进入锁定状态，并显示 Human Review 面板。填写需要人工补充的 state 后，可以继续运行到下一个断点或最终完成。

## 常用命令

```bash
# 构建前端并在单端口启动 GraphiteUI
npm start

# 仅安装前端依赖
make frontend-install

# 构建前端
make frontend-build

# 仅安装后端依赖
make backend-install

# 检查 GraphiteUI 健康状态
make health

# 导入项目自带知识库
python scripts/import_official_knowledge_bases.py
```

常用测试命令：

```bash
# 前端结构与纯逻辑测试
node --test $(find frontend/src -name '*.test.ts' -print)

# 后端测试
python -m pytest backend/tests
```

## 项目结构

```text
GraphiteUI/
├── frontend/
│   ├── src/api/              # 前端 API 封装
│   ├── src/editor/           # 画布、节点、状态面板、工作区
│   ├── src/i18n/             # 多语言文案和 Element Plus locale 适配
│   ├── src/layouts/          # 应用壳层、侧栏、语言切换
│   ├── src/pages/            # Home / Editor / Runs / Run Detail / Settings
│   ├── src/router/           # Vue Router
│   ├── src/stores/           # Pinia stores
│   ├── src/styles/           # 全局样式和主题覆盖
│   └── src/types/            # 图协议、运行态和 API 类型
├── backend/
│   ├── app/
│   │   ├── api/              # graphs / runs / templates / presets / settings / skills / knowledge / memories
│   │   ├── core/compiler/    # node_system 校验
│   │   ├── core/langgraph/   # LangGraph runtime、checkpoint、codegen
│   │   ├── core/runtime/     # 节点执行、state、输出边界工具
│   │   ├── core/schemas/     # Pydantic schemas
│   │   ├── core/storage/     # JSON 文件和 SQLite 存储
│   │   ├── knowledge/        # 知识库导入、切分、检索
│   │   ├── memory/           # memory API 支撑模块
│   │   ├── skills/           # 内置 skill registry 和 definitions
│   │   ├── templates/        # 官方 graph 模板加载器和 official 模板目录
│   │   └── tools/            # OpenAI-compatible 调用工具
│   └── tests/                # 后端 pytest 测试
├── knowledge/GraphiteUI-official/
│   └── *.md                  # 项目官方知识库源文档
├── docs/
│   ├── current_project_status.md
│   └── future/
├── scripts/
│   ├── start.mjs             # 跨平台单端口启动器
│   ├── start.sh              # Bash 启动 wrapper
│   ├── start.cmd             # Windows 启动 wrapper
│   └── import_official_knowledge_bases.py
├── skill/                    # 可挂载 skill 定义
├── Makefile
└── README.md
```

## 核心 API

| API | 作用 |
| --- | --- |
| `GET /health` | 后端健康检查 |
| `GET /api/graphs` | 列出已保存 graph |
| `GET /api/graphs/{graph_id}` | 读取指定 graph |
| `POST /api/graphs/save` | 保存 graph |
| `POST /api/graphs/validate` | 校验 graph |
| `POST /api/graphs/run` | 运行 graph |
| `POST /api/graphs/export/langgraph-python` | 导出 LangGraph Python 源码 |
| `POST /api/graphs/import/python` | 从 Python 源码导入 graph payload |
| `GET /api/runs` | 列出运行记录，支持 graph name 和 status 过滤 |
| `GET /api/runs/{run_id}` | 查看运行详情 |
| `GET /api/runs/{run_id}/nodes/{node_id}` | 查看单个节点执行详情 |
| `POST /api/runs/{run_id}/resume` | 从可恢复 checkpoint 或暂停快照继续运行 |
| `GET /api/templates` | 列出官方和用户自定义 graph 模板 |
| `POST /api/templates/save` | 将当前 graph 保存为用户自定义模板 |
| `GET /api/presets` | 列出 agent presets |
| `GET /api/knowledge/bases` | 列出知识库 |
| `GET /api/skills/definitions` | 列出可用 skills |
| `GET /api/settings` / `POST /api/settings` | 读取和更新设置 |

## 图模板

官方模板位于 `backend/app/templates/official/`，会进入 Git 管理。前端“保存为模板”创建的是用户自定义模板，写入 `backend/data/templates/user/`，属于本地用户数据，不进入 Git 管理。子图节点创建菜单从这两类模板中选择来源，不再直接从已保存 graph 列表创建子图。

当前官方模板：

- `advanced_web_research_loop.json`（界面名称：高级联网搜索）

`advanced_web_research_loop.json` 是当前联网搜索基线模板：它会规划搜索词、调用 `web_search`、判断证据是否足够、按需循环补查，并分别输出最终答案、证据链接和本地 source documents。

创建用户自定义 Skill 的旧官方模板已删除。新的 `graphiteUI_skill_builder` 只负责生成 Skill 包文件内容，后续写入、测试、修复和启用仍应通过明确的图节点或受控能力完成；脚本测试可调用 `graphiteUI_script_tester` 这类专门 Skill。

## 文档与知识库

- `README.md`：项目入口、启动方式、当前能力和未来方向。
- `docs/current_project_status.md`：当前状态快照。
- `skill/SKILL_AUTHORING_GUIDE.md`：官方 Skill 根目录下的 Skill 包结构、生命周期入口、权限边界和新建 Skill 注意事项。
- `docs/future/`：仍未完成的长期设想。
- `knowledge/GraphiteUI-official/`：可导入的项目官方知识库源文档。
- `AGENTS.md`：协作代理工作约定。

## 未来方向

- 继续强化运行事件可观测性，让 Editor、Run Activity、Output 和 Run Detail 更完整地复盘一次执行。
- 扩展 Provider 管理能力，在 Settings 中完成更多 OpenAI-compatible 网关、云端 Provider 和模型目录配置。
- 强化 Human Review 的审计信息、批量输入体验和多断点恢复路径。
- 完善知识库管理，包括更新、删除、重建索引、检索质量评估和引用展示。
- 扩展 memory 的写入、召回、展示和调试能力。
- 增加端到端 UI 测试，覆盖编辑器、运行记录、断点暂停和多语言切换。
- 梳理桌面端、Docker 或单机部署流程，降低非开发环境的启动成本。
- 完成项目 logo、应用图标和品牌资产。
- 推进可见、可撤销、可审计的自动编排能力，让 Agent 可以在授权下辅助创建和调整 graph。

### 桌宠 Agent 与自动编排图

GraphiteUI 的长期方向不只是提供一个可视化画布，而是提供一个可见、可控、可验证的 Agent 协作层。这里的 Agent 是由一整张 graph 表达出来的运行体，而不是某一个单独节点；单个 LLM 节点只承担一次模型判断、一次结构化输出或一次能力调用准备。

桌宠 Agent 可以作为轻量交互入口，停靠在画布或侧栏附近，用 HTML/CSS、SVG 或前端动画表达待机、观察、思考、建议、执行、等待确认、完成和失败等状态。它不应该模拟 DOM 点击，而应该通过明确的图编辑命令操作 GraphiteUI，例如创建节点、连接 state、连接流程线、打开面板、校验 graph、运行 graph 和保存 graph。

自动编排图可以分为两种模式：

1. 规划后等待人类确认：Agent 根据任务生成 graph 草案，用户检查和调整后手动运行。
2. 边走边画的自主编排：Agent 在授权后逐步创建节点、连接线、运行校验、根据反馈继续生长 graph，直到认为 graph 能完成任务，再保存和运行。

这条方向的边界是：所有修改必须可见、可撤销、可审计；删除、覆盖、运行和可能产生费用的操作必须确认；Agent 不能绕过 GraphiteUI 的校验器，也不能直接写不可见状态。

## License

MIT License

## Acknowledgments

- LangGraph
- Vue
- Element Plus
- ComfyUI

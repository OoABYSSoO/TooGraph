<p align="center">
  <img src="frontend/public/logo.svg" alt="TooGraph logo" width="128" />
</p>

<h1 align="center">TooGraph</h1>

<p align="center">
  面向 Agent 工作流的可视化编排、运行观察与伙伴协作工作台。
</p>

<p align="center">
  <a href="https://github.com/OoABYSSoO/TooGraph/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-c89136"></a>
  <img alt="Vue 3" src="https://img.shields.io/badge/Vue-3-42b883?logo=vue.js&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white">
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-runtime-222222">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20.9%2B-5fa04e?logo=node.js&logoColor=white">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11%2B-3776ab?logo=python&logoColor=white">
</p>

<p align="center">
  <a href="#快速开始">快速开始</a>
  · <a href="#核心能力">核心能力</a>
  · <a href="#模型-provider">模型 Provider</a>
  · <a href="#skills-与知识库">Skills</a>
  · <a href="#图模板">图模板</a>
  · <a href="#未来方向">Roadmap</a>
</p>

TooGraph 是一个面向 Agent 工作流的可视化编排与运行工作台。它把 graph、state、节点、数据流、顺序流、条件分支、运行记录和人工确认统一到一套可保存、可校验、可运行的 `node_system` 协议里。

项目当前由 Vue 前端、FastAPI 后端和 LangGraph 运行时组成，适合用来搭建、调试和观察基于状态流转的 Agent graph。

## 当前仓库状态

- 前端：Vue 3、Vite、TypeScript、Pinia、Vue Router、Element Plus、vue-i18n。
- 后端：FastAPI、Pydantic、LangGraph、SQLite FTS、JSON 文件存储。
- 图协议：`node_system` 描述节点、状态、边、运行配置和画布布局；`state_schema` 是节点读写状态的统一来源。
- 启动方式：仓库根目录使用 `npm start`，实际执行 `node scripts/start.mjs`，构建前端后由 FastAPI 在单个端口同时服务 UI 和 API。
- 本地数据：graph、preset、run、settings、skill state 和 checkpoint 写入 `backend/data/`；knowledge base 使用 SQLite + FTS。
- 主要页面：Home、Editor、Runs、Run Detail、Settings、Model Providers、Skills、Templates、Presets、Buddy。

## 核心能力

### 可视化编辑器

- 支持 `input`、`agent`、`condition`、`output`、`subgraph` 五类核心节点。
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

TooGraph 的推荐模型配置入口是 Model Providers 页面。你可以在界面里配置本地模型网关、私有 OpenAI-compatible 网关或云端 Provider，并选择默认文本模型；这些配置写入本机设置目录，不进入 Git。

本地或私有网关的常规流程：

1. 启动你要使用的 OpenAI-compatible gateway。
2. 打开 TooGraph 的 Model Providers 页面。
3. 配置 `local` / Custom OpenAI-compatible Provider 的 base URL、API key 和模型列表；当前本地默认 base URL 是 `http://127.0.0.1:8888/v1`。
4. 保存后，编辑器和运行时会从已保存的 Provider 配置读取模型入口。

模型运行只读取 Model Providers 页面保存的 Provider 配置和默认模型选择。启动环境变量不会配置模型入口。

### Skills 与知识库

- 图整体才是 Agent；单个 LLM 节点只做一次模型运行，并且最多使用一个显式能力来源。
- LLM 节点可以显式选择一个 Skill；动态 `subgraph` state 主要服务于伙伴主循环这类模板内能力选择，手动复用图仍通过 Subgraph 节点完成。
- LLM 节点手动选择的 Skill 存在 `config.skillKey` 单值字段中，不使用 `config.skills` 数组，避免把单节点能力误解成多技能挂载。
- Knowledge base 可以通过 input 节点进入 graph。
- Knowledge base 不再隐式挂载旧内置检索 skill；需要检索时，应通过 `skill/official/<skill_key>/` 或 `skill/user/<skill_key>/` 文件夹提供带 `skill.json` manifest 的显式 skill。
- 项目自带 `knowledge/TooGraph-official/` 作为 TooGraph 官方知识库源文档。
- 后端支持 knowledge base 导入、切分、FTS 检索和 catalog 查询。
- Git 管理的官方 Skill 定义来自 `skill/official/<skill_key>/` 文件夹；用户自定义 Skill 写入 `skill/user/<skill_key>/`。两类 Skill 包都可以进入 Git 管理；当前环境的启用状态只写入被忽略的 `skill/settings.json`，缺失时程序会按现有 Skill 自动生成和补齐。
- 当前官方 Skill 包包括 `web_search`、`toograph_capability_selector`、`toograph_page_operator`、`toograph_skill_builder`、`toograph_script_tester`、`local_workspace_executor` 和内部 `buddy_home_writer`。
- `web_search` 使用 `before_llm.py` 在技能入参规划前补充当前日期，使用 `after_llm.py` 执行联网搜索、引用整理、可选网页正文抓取、本地 source document artifact 输出，并把原文网址写入下载后的本地文档。
- `toograph_capability_selector` 使用 `before_llm.py` 列出当前启用的图模板和可选 Skill 清单，再用 `after_llm.py` 校验并规范化模型选择的单个 `capability` state。
- `toograph_page_operator` 读取当前页面操作书，支持普通页面 click 和编辑器 `graph_edit editor.graph.playback`，让 Buddy 通过应用内虚拟鼠标/键盘可见地执行页面操作。
- `toograph_skill_builder` 使用 `before_llm.py` 注入当前 Skill 编写指南，生成 `skill_key`、`skill.json`、`SKILL.md`、`before_llm.py`、`after_llm.py` 和可选 `requirements.txt` 内容；它不负责写入、测试、修复或启用生成的 Skill。
- `toograph_script_tester` 接收脚本内容和测试目标，由 LLM 生成临时测试工作区并运行允许的测试命令；它不再只限定 Python/pytest，执行前仍受当前图或 Buddy 权限模式约束。
- `local_workspace_executor` 会在技能入参规划前预读节点任务或 state 中提到的仓库文件；运行时只处理一个路径上的 `read` / `write` / `execute` 操作，输出收束为 `success` 和 `result`。写入只允许 `backend/data`、`skill/user`、`graph_template/user` 或 `node_preset/user`，执行只允许 `backend/data/tmp` 或 `skill/user`，并对 `.git`、`.env`、`backend/data/settings` 做硬拒绝；它涉及本地写入和进程执行，是否暂停确认由当前图或 Buddy 的 `需确认` / `完全访问` 模式决定。
- Output 节点可以读取 `local_path` 指向的本地 artifact，按类型预览文档、图片和视频。

## 快速开始

### 环境要求

当前是源码运行方式。正式一键安装包发布前，需要先安装这些基础工具：

| 工具 | 要求 | 下载地址 | 用途 |
| --- | --- | --- | --- |
| Git | 最新稳定版 | https://git-scm.com/downloads | 获取代码、更新代码、提交改动 |
| Node.js | 20.9+，推荐 LTS | https://nodejs.org/en/download | 安装前端依赖、构建前端、运行 `npm start` 启动器 |
| Python | 3.11+ | https://www.python.org/downloads/ | 运行 FastAPI 后端、安装后端依赖、执行 Python Skill |

Windows 用户安装 Python 时建议勾选 `Add python.exe to PATH`；安装 Git 时可以保留默认选项。安装完成后，打开一个新的终端，确认命令可用：

```bash
git --version
node -v
npm -v
python --version
```

如果系统里的 Python 命令是 `python3`，用 `python3 --version` 检查即可。TooGraph 也支持通过 `PYTHON` 环境变量指定 Python 可执行文件路径。

如果需要运行 LLM 节点，还需要准备一个可访问的模型服务：可以是本地 OpenAI-compatible 网关、私有网关，或云端 Provider。模型入口在 TooGraph 的 Model Providers 页面配置，不通过启动环境变量配置。

### 安装依赖

```bash
git clone https://github.com/OoABYSSoO/TooGraph.git
cd TooGraph
npm --prefix frontend install
python -m pip install -r backend/requirements.txt
```

如果系统里的 Python 命令是 `python3`：

```bash
python3 -m pip install -r backend/requirements.txt
```

如果在中国大陆访问 npm 或 PyPI 很慢，可以先配置自己信任的镜像源，再安装依赖。常见示例：

```bash
npm config set registry https://registry.npmmirror.com
python -m pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
```

镜像源只影响依赖下载；TooGraph 的启动方式仍然是 `npm start`。

### 配置模型入口

如果需要运行 LLM 节点，先启动本地模型网关或准备云端 Provider 凭据，然后在 TooGraph 的 Model Providers 页面完成配置。只查看 UI、编辑 graph 或浏览已有运行记录时，可以先不配置模型入口。

### 启动 TooGraph

推荐从仓库根目录启动：

```bash
npm start
```

这条命令会执行：

```bash
node scripts/start.mjs
```

默认地址：

- TooGraph：http://127.0.0.1:3477
- 健康检查：http://127.0.0.1:3477/health

启动器会先构建 `frontend/dist`，释放占用的 TooGraph 端口，然后启动单个 FastAPI 服务。日志写入：

- `.toograph_server.log`

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
# 构建前端并在单端口启动 TooGraph
npm start

# 仅安装前端依赖
make frontend-install

# 构建前端
make frontend-build

# 仅安装后端依赖
make backend-install

# 检查 TooGraph 健康状态
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
TooGraph/
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
│   │   ├── templates/        # graph 模板加载器
│   │   └── tools/            # OpenAI-compatible 调用工具
│   └── tests/                # 后端 pytest 测试
├── graph_template/           # 官方和用户自定义 graph 模板
├── node_preset/              # 官方和用户自定义节点预设
├── knowledge/TooGraph-official/
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

官方模板位于 `graph_template/official/<template_id>/template.json`，会进入 Git 管理。前端“保存为模板”创建的是用户自定义模板，写入 `graph_template/user/<template_id>/template.json`；模板本体可以进入 Git 管理，当前环境的启用状态只写入被忽略的 `graph_template/settings.json`，缺失时程序会按现有模板自动生成和补齐。子图节点创建菜单从这两类模板中选择来源，不再直接从已保存 graph 列表创建子图。

当前官方模板：

- `advanced_web_research_loop`（界面名称：高级联网搜索）
- `buddy_autonomous_loop`（界面名称：伙伴自主循环）
- `toograph_skill_creation_workflow`（界面名称：创建自定义 Skill）
- `buddy_autonomous_review`（界面名称：自主复盘，伙伴运行后的内部后台写回模板，不作为普通用户入口）

`advanced_web_research_loop` 是当前联网搜索基线模板：它会规划搜索词、调用 `web_search`、判断证据是否足够、按需循环补查，并输出最终答案；证据链接和本地 source documents 作为中间 state 供后续节点使用，不直接连接 output 节点。

`buddy_autonomous_loop` 是当前 Buddy 的可见运行路径：读取 Buddy Home 和用户请求，选择一个 Skill 或动态图模板能力，执行后回到 LLM 复盘，并在需要时继续循环、暂停补充信息或输出唯一用户可见的 `final_reply`。

`buddy_autonomous_review` 是当前 Buddy 的后台自主复盘路径：可见回复完成后由前端用 run snapshot 启动，模型自行判断是否需要低风险写回 Buddy Home，并通过 `buddy_home_writer` 走 command / revision 路径留下可回滚记录。

`toograph_skill_creation_workflow` 是创建用户自定义 Skill 的官方流程模板：它会检查已有能力、澄清需求、让用户确认示例输入输出，调用 `toograph_skill_builder` 生成 `skill_key` / `skill.json` / `SKILL.md` / `before_llm.py` / `after_llm.py` / `requirements.txt`，再用 `toograph_script_tester` 测试生命周期脚本或相关文件；测试失败会回到构建节点修复，最后只有在用户明确批准后才通过 `local_workspace_executor` 写入 `skill/user/<skill_key>/`。

## 文档与知识库

- `README.md`：项目入口、启动方式、当前能力和未来方向。
- `docs/current_project_status.md`：当前状态快照。
- `skill/SKILL_AUTHORING_GUIDE.md`：官方 Skill 根目录下的 Skill 包结构、生命周期入口、权限边界和新建 Skill 注意事项。
- `docs/future/`：仍未完成的长期设想。
- `knowledge/TooGraph-official/`：可导入的项目官方知识库源文档。
- `AGENTS.md`：协作代理工作约定。

## 未来方向

- 补齐 Buddy 原生虚拟 UI 操作的 operation journal、activity events、graph diff、revision、undo/redo、失败重试和运行结果归因。
- 扩展 Buddy 编辑已有图的能力：选择、移动、重命名、改配置、选 Skill、调整连接、删除、恢复、运行和基于错误继续修复。
- 扩展页面操作书覆盖范围，让 Buddy 能跨技能页、运行历史、编辑器、模型日志等页面先导航再操作目标内容。
- 继续完善上下文预算、`result_package` 摘要、大 artifact 按需展开和只读 fanout 并行。
- 将内部 `agent` kind 的用户心智迁移为 LLM 节点，同时保持 `node_system` 协议唯一。
- 完善知识库更新、删除、重建索引、检索质量评估和引用展示。
- 增加端到端 UI 测试，覆盖编辑器、运行记录、断点暂停、Buddy 虚拟操作和多语言切换。
- 梳理桌面端、Docker 或单机部署流程，降低非开发环境的启动成本。

### 伙伴 Agent 与自动编排图

<p align="center">
  <img src="frontend/public/mascot.svg" alt="TooGraph Buddy mascot" width="220" />
</p>

TooGraph 的长期方向不只是提供一个可视化画布，而是提供一个可见、可控、可验证的 Agent 协作层。这里的 Agent 是由一整张 graph 表达出来的运行体，而不是某一个单独节点；单个 LLM 节点只承担一次模型判断、一次结构化输出或一次能力调用准备。

伙伴 Agent 可以作为轻量交互入口，停靠在画布或侧栏附近，用 HTML/CSS、SVG 或前端动画表达待机、观察、思考、建议、执行、等待确认、完成和失败等状态。当前方向是应用内原生虚拟操作：伙伴读取结构化页面操作书和 affordance 清单，控制自己的虚拟鼠标/键盘可见地触发 TooGraph 编辑器已有交互路径；持久图变更仍要进入验证、审计、diff、revision 和 undo/redo 路径，不能绕过协议直接隐式改 graph JSON。

自动编排图可以分为两种模式：

1. 规划后等待人类确认：Agent 根据任务生成 graph 草案，用户检查和调整后手动运行。
2. 边走边画的自主编排：Agent 在授权后逐步创建节点、连接线、运行校验、根据反馈继续生长 graph，直到认为 graph 能完成任务，再保存和运行。

这条方向的边界是：所有修改必须可见、可撤销、可审计；删除、覆盖、运行和可能产生费用的操作必须确认；Agent 不能绕过 TooGraph 的校验器，也不能直接写不可见状态。

## License

MIT License

## Acknowledgments

- LangGraph
- Vue
- Element Plus
- ComfyUI

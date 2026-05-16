# TooGraph 当前架构

TooGraph 当前是一个单端口启动的 graph-first Agent 工作台。项目由 Vue 前端、FastAPI 后端、LangGraph 运行时、官方图模板、官方 Skill 包和本地数据目录组成。

## 前端

- Vue 3 + Vite + TypeScript。
- Vue Router 负责页面路由。
- Pinia 负责前端状态。
- Element Plus 和 `@element-plus/icons-vue` 提供通用 UI 控件。
- 画布、节点、端口、线条、minimap、子图缩略图、运行反馈和 Buddy 浮窗由 TooGraph 自定义编辑器实现。

主要页面包括：

- `/`：工作台首页。
- `/editor`、`/editor/new`、`/editor/:graphId`：图编辑器。
- `/library`：图模板与图资产入口。
- `/buddy`：伙伴页面。
- `/runs`、`/runs/:runId`：运行记录和详情。
- `/skills`：Skill 管理。
- `/models`：Model Providers。
- `/model-logs`：模型请求日志。
- `/presets`：节点预设。
- `/settings`：应用设置。

## 后端

- FastAPI 提供 API。
- Pydantic 定义 graph、run、preset、settings、skill、template 等 schema。
- LangGraph runtime 执行当前 `node_system` graph。
- validator 负责保存和运行前的结构校验。
- JSON 文件保存 graph、preset、run、settings 和本地启用状态。
- SQLite + FTS 保存 knowledge base 索引。
- `skill/official/<skill_key>/` 和 `skill/user/<skill_key>/` 保存 Skill manifest、生命周期脚本、说明和依赖文件。
- `graph_template/official/<template_id>/` 和 `graph_template/user/<template_id>/` 保存可复用图模板。

## 启动与数据

- 标准启动命令是仓库根目录的 `npm start`。
- `npm start` 实际执行 `node scripts/start.mjs`。
- 默认访问地址是 `http://127.0.0.1:3477`。
- 启动器会释放 TooGraph 端口，按前端输入 hash 复用或构建 `frontend/dist`，再启动 FastAPI 单端口服务。
- `backend/data/` 保存本地 graph、run、settings、knowledge index、skill artifacts、Buddy Home 相关数据库和运行时缓存。
- `backend/data/settings`、`.toograph_*`、`.dev_*`、`frontend/dist` 和 `buddy_home/` 属于本地运行产物，不应作为普通文档或源码能力的一部分提交。

## 图协议

当前主链收口到 `node_system`：

- `state_schema` 是唯一正式数据源。
- `nodes` 是以节点名为 key 的对象映射。
- 节点只声明读取哪些 state、写入哪些 state。
- `edges` 表达普通顺序流。
- `conditional_edges` 表达条件分支目标。
- 当前核心节点类型是 `input`、`agent`、`condition`、`output`、`subgraph`。
- 用户心智上应把 `agent` kind 理解为 LLM 节点；内部协议命名仍待迁移。

关键协议约束：

- 一个 LLM 节点最多使用一个显式能力来源：无能力、一个手动选择的 Skill，或一个输入 `capability` state。
- 手动选择 Skill 使用单值 `config.skillKey`，不使用 `config.skills` 数组。
- 静态 Skill 输出通过 `skillBindings.outputMapping` 写入 state。
- 动态能力执行只写一个 `result_package` state。
- `file` / `image` / `audio` / `video` state 传本地路径、路径列表或 `kind=local_folder` 选择包，不使用旧的 `file_list`、`array` 或 `object` state 类型。

## 当前官方 Skill

当前官方 Skill 包括：

- `web_search`：联网搜索、网页正文抓取、本地 source document artifact 输出。
- `toograph_capability_selector`：从启用的图模板和启用的 Skill 中选择并校验一个 `capability`。
- `toograph_page_operator`：读取结构化页面操作书，发起普通页面 click 或编辑器 `graph_edit editor.graph.playback` 可见回放。
- `toograph_skill_builder`：根据已确认需求生成一个 TooGraph Skill 包的文件内容。
- `toograph_script_tester`：在临时目录生成并运行允许命令的测试工作区。
- `local_workspace_executor`：在路径白名单内读取、写入一个文件或执行一个脚本。
- `buddy_home_writer`：内部 Skill，通过 Buddy command/store 路径执行低风险 Buddy Home 写回并生成 revision。

从调试角度看，TooGraph 不是单纯画图工具，而是一个带运行态、知识库、显式能力、artifact、断点恢复和可审计 Buddy 流程的 workflow workspace。

# GraphiteUI 当前架构

GraphiteUI 当前是一个前后端分离的 LangGraph 风格工作流工作台。

## 前端

- Vue 3 + Vite + TypeScript
- Vue Router 负责页面路由
- Pinia 负责前端状态
- Element Plus 和 `@element-plus/icons-vue` 提供通用 UI 控件
- 画布、节点、端口、线条、minimap 和运行反馈由 GraphiteUI 自定义编辑器实现

主要页面包括：

- `/`：工作台首页
- `/editor`、`/editor/new`、`/editor/:graphId`：图编辑器
- `/runs`、`/runs/:runId`：运行记录和详情
- `/settings`：模型和运行配置

## 后端

- FastAPI 提供 API
- Pydantic 定义 graph、run、preset、settings、skill 等 schema
- LangGraph runtime 执行当前 node_system graph
- validator 负责保存和运行前的结构校验
- JSON 文件保存 graph / preset / run / settings / skill state
- SQLite + FTS 保存 knowledge base 索引
- `skill/<skill_key>` 文件夹保存 skill manifest、脚本、说明和相关资源

## 图协议

当前主链已经收口到 `node_system`：

- `state_schema` 是唯一正式数据源
- `nodes` 是以节点名为 key 的对象映射
- 节点只声明读取哪些 state、写入哪些 state
- `edges` 表达普通顺序流
- `conditional_edges` 表达条件分支目标
- 四类核心节点是 `input`、`agent`、`condition`、`output`

从调试角度看，GraphiteUI 不是单纯画图工具，而是一个带运行态、知识库、技能和可观测能力的 workflow workspace。

当前内置 skill 包括 `web_search`、`web_media_downloader` 和 `game_ad_research_collector`。它们通过 manifest 驱动的脚本运行器执行，可以输出摘要、引用、结构化结果，以及指向本地 artifact 的文档或媒体路径。

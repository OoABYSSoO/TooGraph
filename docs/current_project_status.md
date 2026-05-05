# Current Project Status

本文是 GraphiteUI 当前项目状态的正式快照，也是项目知识库导入时会读取的一份源码文档。

## 结论

- Vue 前端迁移已经完成，旧前端迁移计划不再是当前工作主线。
- 首页、编辑器、运行记录、运行详情、设置页、Skills 管理页和 Companion 页面都在正式主链上。
- `node_system` 是唯一正式图协议，`state_schema` 是唯一正式节点输入输出数据源。
- 桌宠自主 Agent 方向以 `docs/future/companion-autonomous-agent-roadmap.md` 为唯一参考。
- Skill 系统已收束为统一能力库：不再按 Agent 节点和桌宠拆分两类 skill，也不再使用 skill `targets`。
- `state_schema` 支持 `skill` 类型；Agent 节点会把卡片手动添加的 skills 与 state 输入传入的 skill / skill[] 做并集合并。

## 当前正式能力

### 前端主链

- 首页：`/`
  - 最近运行
  - 模板入口
  - 最近 graphs
- 编辑器：`/editor`、`/editor/new`、`/editor/:graphId`
  - welcome / workspace 分流
  - 多 tab 工作区
  - graph 保存、校验、运行
  - State Panel
  - 节点标题、简介、端口和配置编辑
  - 节点创建菜单、手柄拖出创建、文件拖入创建 input
  - 数据流、顺序流和条件分支的建链、删链、重连
  - 智能线条显示模式
  - 右下角 minimap
  - 运行状态反馈和 active path 高亮
  - Run Activity 面板按运行事件顺序展示活跃 state、节点流式输出和运行过程
- 运行页：`/runs`、`/runs/:runId`
  - runs 列表、筛选、详情
  - run detail polling 与 SSE 运行事件更新
  - cycle iterations
  - output artifacts
- 设置页：`/settings`
  - 默认模型
  - agent runtime defaults
  - provider 摘要
- Skills 页：`/skills`
  - 统一 skill catalog 管理
  - 可发现、可自主选择、运行时就绪和需处理状态展示
  - skill 包文件浏览
  - skill 导入、启用、禁用和删除
- Companion 页面：`/companion`
  - 桌宠对话入口
  - 对话后自动刷新人设和记忆
  - 桌宠浮窗默认运行 `companion_agentic_tool_loop`，并向图注入真实 skill catalog snapshot

### 编辑器与运行

- `input / agent / condition / output` 四类核心节点都可编辑。
- `input` 节点有且只有一个 state 输出，不能通过数据线编辑误删。
- 新建的非 input 节点默认具备可接入的 any 输入语义。
- agent 节点支持模型选择、thinking 开关、skills、输入引用、输出引用、temperature 和保存 preset。
- condition 节点作为条件边的可视化代理，默认包含 true / false / exhausted 分支，并限制循环上限为 1-10，默认 5。
- output 节点支持预览、展示模式和持久化开关。
- output 节点支持读取 `local_path` 本地 skill artifact，并按 artifact 类型展示文档、图片和视频。
- 运行事件通过 SSE/EventSource 单向推送到前端；output 节点会根据流式 payload 的 state key 只更新自己读取的 state。

### 后端主链

- FastAPI 提供 graphs / runs / templates / presets / settings / skills / knowledge / memories API。
- validator 负责 `node_system` graph 结构校验。
- LangGraph runtime 是当前运行主链，并采用 agent-only 语义：只有 agent 注册为 LangGraph node，input / output / condition 作为边界状态、输出 artifact 和条件 route 参与反馈。
- 控制流分析允许互斥条件分支共同写入同一个汇合状态，例如 `final_reply`；普通并行无序写入仍会被拒绝。
- 后端支持 LangGraph Python 源码导出接口。
- 后端具备 interrupt / checkpoint / resume 能力，前端人类在环完整产品闭环仍在路线图中。

### 知识库与技能

- knowledge base 可以通过 input 节点进入图。
- agent 读取 knowledge base state，不再隐式挂载内置知识库 skill；检索能力需要以 `skill/<skill_key>` 文件夹加 `skill.json` manifest 的形式显式安装和绑定。
- skills catalog/definitions 与 knowledge base catalog 都有真实接口。
- 当前内置 skill 包括 `local_file`、`web_search`、`web_media_downloader`、`game_ad_research_collector` 和 `autonomous_decision`。
- skill manifest 使用 `runPolicies` 描述默认和运行来源策略；旧 `targets` 字段已废弃。
- `local_file` 是受白名单约束的基础本地文件读写技能，当前用于桌宠人设、策略、记忆和会话摘要的显式图模板读写闭环。
- `web_search` 支持 Tavily 优先、DuckDuckGo HTML fallback、日期上下文注入、搜索结果引用、网页正文抓取和 source document 本地 artifact 输出。
- `web_media_downloader` 支持下载公开或用户授权的网页媒体，并返回可由 Output 节点展示的本地 artifact 路径。
- `game_ad_research_collector` 支持采集游戏市场 RSS、生成广告库搜索记录、发现/下载公开视频广告素材，并把视频和来源文档作为本地 artifact 返回。
- `autonomous_decision` 是 control/context 技能，负责根据技能目录和 `runPolicies` 决定直接回复、执行已授权技能、请求审批或提出缺失技能草案，不直接执行工具或产生副作用。
- `skill` state 可以把 `autonomous_decision` 选出的技能作为显式图状态传给下游 Agent 节点；这些动态技能与 Agent 卡片 skills 一视同仁，执行前仍走 registry、运行时状态和审批校验。
- `companion_agentic_tool_loop` 模板已进入桌宠入口主链，串起人设/记忆读取、意图规划、`autonomous_decision`、审批暂停、`skill` state 动态执行、工具结果评估、互斥分支写入 `final_reply`、多轮退出和同模板内记忆整理写回。

## 当前技术栈

- 前端：Vue 3 + Vite + TypeScript
- 路由：Vue Router
- 前端状态：Pinia
- UI 组件库：Element Plus + `@element-plus/icons-vue`
- 画布与节点系统：GraphiteUI 自定义实现
- 后端：FastAPI + Pydantic + LangGraph
- 持久化：
  - graphs / runs / settings / skills / presets：JSON 文件
  - knowledge base：SQLite + FTS

## 仍在路线图中的事项

- Memory 正式写入、召回和展示。
- 人类在环的更完整审计闭环和多断点恢复体验。
- LangGraph Python 源码预览、下载和导入校验体验完善。
- cycles 更高级的终止策略和可视化。
- 更强的 knowledge base 管理能力。
- 桌宠审批恢复 UI：展示 `approval_prompt`，确认后写入 `approval_granted` 并 resume。
- `graphite_skill_builder`。
- 桌宠 Agent 与自动编排图协作层，具体路线见 `docs/future/companion-autonomous-agent-roadmap.md`。

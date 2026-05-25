# TooGraph 当前运行态与后续方向

## 当前运行态

TooGraph 当前已经具备这些正式能力：

- graph save / validate / run。
- 节点执行状态追踪。
- active path 高亮。
- state snapshot / state events。
- Action outputs。
- knowledge summary。
- cycle summary / cycle iterations。
- output preview 和 output artifacts。
- SSE/EventSource 运行事件流。
- Run Activity 面板和 Output 节点实时预览。
- `local_path` 或本地 artifact 路径的 Output 展示，包括文档、图片和视频。
- `state_schema` 作为唯一数据源参与整个执行链。
- `subgraph` 节点运行、编辑、公开 input/output 边界和内部断点传播。
- `awaiting_human`、resume API、编辑器 Human Review、运行详情和伙伴页面确认页签。
- Buddy 浮窗对话、历史会话、`buddy_autonomous_loop` 可见运行、每个公开 output 边界分段的运行过程胶囊、可选直接能力结果输出、最终回复和 `buddy_autonomous_review` 后台自主复盘。

后端运行主链已经迁到 LangGraph，并支持：

- interrupt / checkpoint / resume。
- 静态子图和动态子图执行。
- LangGraph Python 源码导出和导入接口。
- 运行记录持久化。

## 知识库与 Action

知识库链路已经做到：

- 通过 input 节点选择知识库。
- 本地导入正式知识库并建 SQLite FTS 索引。
- knowledge catalog 查询与 graph state 输入。
- 检索能力不再隐式内置，需要通过显式 Action 或图模板接入。

Action 链路已经做到：

- 后端解析统一 Action catalog。
- 前端展示可挂载 Action。
- LLM 节点可显式选择一个 Action。
- `action/official/<action_key>/` 和 `action/user/<action_key>/` 内的 `action.json` manifest、`ACTION.md`、生命周期脚本和依赖文件共同定义一个 Action。
- Action 启用状态写入本地 `action/settings.json`，不写进 Action 包定义。
- `web_search` 支持联网搜索、网页正文抓取和本地 source document 输出。
- `toograph_capability_selector` 支持先判断当前循环是否还需要调用能力；需要时从候选 Action、Subgraph、Tool 中选择并校验一个能力，不需要时返回 `none` 和 `needs_capability=false`。
- Buddy 主循环直接读取显式输入和能力候选；旧 fanout Action 已删除。
- `toograph_page_operator` 支持读取当前页面操作书，执行普通页面 click，并在编辑器页发起 `graph_edit editor.graph.playback` 可见回放。
- `toograph_action_builder` 支持生成用户 Action 包文件内容。
- `toograph_script_tester` 支持在临时目录生成并执行允许命令的测试工作区。
- `local_workspace_executor` 支持在路径白名单内读取、写入一个文件或执行一个脚本。
- 内部 `buddy_home_writer` 支持 Buddy Home 低风险写回的 command / revision 路径。

## 后续路线图

仍然明确属于后续工作的方向包括：

- Buddy 原生虚拟 UI 操作：补齐统一 operation journal、低层 activity events、graph diff、revision、undo/redo、失败重试和运行结果归因。
- 编辑已有图：支持选择、移动、重命名、改配置、选 Action、调整连接、删除、恢复、运行和基于错误继续修复。
- 页面操作书扩展：覆盖 Action 页、运行历史、模型日志、模板库等页面，让 Buddy 可以跨页面导航后再操作目标内容。
- 子图运行详情：继续增强动态子图断点定位、scope path 展示和从缩略图跳转到内部节点。
- 低层 `activity_events`：继续扩展伙伴虚拟 UI 操作、图变更、运行点击和结果归因的程序化摘要，并在 Buddy 浮窗和 Run Detail 中复用展示。
- 知识库更新、删除、重建索引和检索质量增强。
- LangGraph Python 源码预览、下载和导入校验体验完善。
- 内部 `agent` kind 命名逐步迁移为 LLM 节点语义。
- 增加端到端 UI 测试，覆盖编辑器、运行记录、标准暂停确认、Buddy 虚拟操作和多语言切换。

伙伴 Agent 的长期目标是成为 TooGraph 的协作入口：先能解释当前图和校验问题，再能在用户确认后生成图草案、创建节点、连接边、运行校验，最终演进到受控、可见、可撤销、可审计的自动编排。

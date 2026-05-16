# TooGraph 能做些什么

TooGraph 当前适合做这些事情：

- 新建、保存、加载、校验和运行一张节点图。
- 通过 `input / agent / condition / output / subgraph` 五类核心节点组织完整流程。
- 在画布上编辑数据流、普通顺序流和条件分支流。
- 把整张图模板作为 `subgraph` 节点嵌入父图，并通过公开 input/output 胶囊通信。
- 给 LLM 节点显式挂载一个 Skill，并在节点卡片里看到 Skill 说明胶囊和自动绑定输出 state。
- 通过 State Panel 管理 `state_schema`，并把 state 的读写关系同步回具体节点。
- 运行带条件分支和基础 cycles 的图，并查看 `cycle_summary / cycle_iterations`。
- 把知识库通过 input 节点接给 LLM 节点；检索能力不再隐式内置，需要通过显式 Skill 接入。
- 使用 `web_search` Skill 做联网搜索、网页正文抓取和本地 source document 输出。
- 使用 `toograph_capability_selector` 在 Buddy 或模板内选择一个启用的 Skill 或图模板能力。
- 使用 `toograph_page_operator` 通过结构化页面操作书发起普通页面 click，或在编辑器中用 `graph_edit editor.graph.playback` 可见回放目标图搭建。
- 使用 `toograph_skill_builder`、`toograph_script_tester` 和 `local_workspace_executor` 组成用户自定义 Skill 创建流程。
- 用 output 节点实时预览 state，并展示本地 artifact 路径指向的文档、图片和视频。
- 在 Run Detail 里查看节点执行结果、技能输出、状态快照、输出产物、warnings 和 errors。
- 通过节点创建菜单、手柄拖出创建、文件拖入创建和 preset 保存来扩展图。
- 使用 minimap、线条显示模式和运行态高亮管理较复杂的画布。
- 使用 Buddy 浮窗发起 `buddy_autonomous_loop` graph run，并在完成后由内部 `buddy_autonomous_review` 后台模板自主判断是否需要写回 Buddy Home；低风险写回通过 `buddy_home_writer` 生成 command 和 revision。

当前比较适合的使用场景是：

- workflow 原型验证。
- grounded answer 场景。
- 多节点 prompt / Skill / output 组合测试。
- LangGraph 风格流程的可视化编排。
- 需要可观察运行过程和 artifact 输出的本地 Agent 工作流。

当前仍在推进的能力主要是：

- Buddy 原生虚拟 UI 操作：补齐 operation journal、activity events、graph diff、revision、undo/redo、失败重试和运行结果归因。
- 编辑已有图：选择、移动、重命名、改配置、选 Skill、调整连接、删除、恢复、运行和基于错误继续修复。
- 页面操作书扩展：覆盖技能页、运行历史、模型日志、模板库等页面，让 Buddy 可以跨页面导航后再操作目标内容。
- 子图运行详情：继续增强从缩略图跳到内部节点、动态子图断点定位和 scope path 展示。
- 低层 `activity_events`：继续扩展伙伴虚拟 UI 操作、图变更、运行点击和结果归因的程序化摘要。
- 内部 `agent` kind 命名向 LLM 节点语义迁移。

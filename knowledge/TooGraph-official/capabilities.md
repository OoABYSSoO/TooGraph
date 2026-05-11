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
- 使用 `toograph_skill_builder`、`toograph_script_tester` 和 `local_workspace_executor` 组成用户自定义 Skill 创建流程。
- 用 output 节点实时预览 state，并展示本地 artifact 路径指向的文档、图片和视频。
- 在 Run Detail 里查看节点执行结果、技能输出、状态快照、输出产物、warnings 和 errors。
- 通过节点创建菜单、手柄拖出创建、文件拖入创建和 preset 保存来扩展图。
- 使用 minimap、线条显示模式和运行态高亮管理较复杂的画布。
- 使用 Buddy 浮窗发起 `buddy_autonomous_loop` graph run，并在完成后由内部 `buddy_self_review` 后台模板产出记忆和成长计划。

当前比较适合的使用场景是：

- workflow 原型验证。
- grounded answer 场景。
- 多节点 prompt / Skill / output 组合测试。
- LangGraph 风格流程的可视化编排。
- 需要可观察运行过程和 artifact 输出的本地 Agent 工作流。

当前仍在推进的能力主要是：

- 动态能力低层审批：声明 `file_write`、删除类权限或 `subprocess` 的 Skill 会按图或 Buddy 权限模式进入标准 `awaiting_human` 或自动放行。
- Buddy 暂停交互剩余项：拒绝、取消、刷新后找回、暂停期间队列策略和伙伴页面确认视图。
- Buddy Home 写回流程：把记忆、会话摘要、用户资料、人设调整、能力使用统计和自我复盘报告表达为显式模板、受控 Skill、command 和 revision。
- 子图运行详情：父子图事件聚合、动态子图断点定位、scope path 展示和从缩略图跳到内部节点。
- 低层 `activity_events`：文件读取、搜索、命令执行、脚本测试、写入、下载、图编辑和 Skill/subgraph 执行的程序化摘要。
- 图编辑命令流：图补丁预览、GraphCommandBus、graph revision、undo/redo 和完整审计闭环。
- 内部 `agent` kind 命名向 LLM 节点语义迁移。

# GraphiteUI 能做些什么

GraphiteUI 当前适合做这些事情：

- 新建、保存、加载、校验和运行一张节点图。
- 通过 `input / agent / condition / output` 四类核心节点组织完整流程。
- 在画布上编辑数据流、普通顺序流和条件分支流。
- 给 agent 显式挂载 skill，并在节点卡片里直接看到它挂了什么能力。
- 通过 State Panel 管理 `state_schema`，并把 state 的读写关系同步回具体节点。
- 运行带条件分支和基础 cycles 的图，并查看 `cycle_summary / cycle_iterations`。
- 把知识库通过 input 节点接给 agent；检索能力不再隐式内置，需要通过显式 skill 接入。
- 使用 `web_search` skill 做联网搜索、引用整理、网页正文抓取和本地 source document 输出。
- 使用 `web_media_downloader` 下载公开或用户授权的网页媒体，并返回本地 artifact 路径。
- 使用 `game_ad_research_collector` 采集游戏市场资料和公开视频广告素材，支撑广告创意分析 demo 流程。
- 用 output 节点实时预览 state，并展示 `local_path` 指向的本地文档、图片和视频。
- 在 run detail 里查看节点执行结果、技能输出、知识库摘要和输出产物。
- 通过节点创建菜单、手柄拖出创建、文件拖入创建和 preset 保存来扩展图。
- 使用 minimap 和线条显示模式管理较复杂的画布。

当前比较适合的使用场景是：

- workflow 原型验证
- grounded answer 场景
- 多节点 prompt / skill / output 组合测试
- LangGraph 风格流程的可视化编排

当前还没有完全做完的能力主要是：

- cycles 高级终止策略和可视化
- memory 正式写入与召回
- 人类在环审计、多断点恢复和批量输入体验
- LangGraph Python 源码预览、下载和导入校验体验完善
- 更强的知识库管理和检索增强
- 更完整的 Agent / 伙伴 Skill 权限、健康检查和配置体验
- 伙伴 Agent 与自动编排图协作层

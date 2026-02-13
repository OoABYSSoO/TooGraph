# GraphiteUI 能做些什么

GraphiteUI 当前适合做这些事情：

- 新建、保存、加载、校验和运行一张节点图。
- 通过 `input / agent / condition / output` 四类核心节点组织完整流程。
- 在画布上编辑数据流、普通顺序流和条件分支流。
- 给 agent 显式挂载 skill，并在节点卡片里直接看到它挂了什么能力。
- 通过 State Panel 管理 `state_schema`，并把 state 的读写关系同步回具体节点。
- 运行带条件分支和基础 cycles 的图，并查看 `cycle_summary / cycle_iterations`。
- 把知识库通过 input 节点接给 agent，再由 `search_knowledge_base` 做正式检索。
- 在 run detail 里查看节点执行结果、技能输出、知识库摘要和输出产物。
- 通过节点创建菜单、手柄拖出创建、文件拖入创建和 preset 保存来扩展图。
- 使用 minimap 和线条显示模式管理较复杂的画布。

当前比较适合的使用场景是：

- workflow 原型验证
- grounded answer 场景
- 多节点 prompt / skill / output 组合测试
- LangGraph 风格流程的可视化编排

当前还没有完全做完的能力主要是：

- WebSocket 实时推送
- cycles 高级终止策略和可视化
- memory 正式写入与召回
- 人类在环与断点前端闭环
- LangGraph Python 导出 UI
- 更强的知识库管理和检索增强
- 桌宠 Agent 与自动编排图协作层

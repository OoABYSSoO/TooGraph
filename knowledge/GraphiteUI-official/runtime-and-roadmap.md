# GraphiteUI 当前运行态与后续方向

## 当前运行态

GraphiteUI 当前已经具备这些正式能力：

- graph save / validate / run
- 节点执行状态追踪
- active path 高亮
- state snapshot / state events
- skill outputs
- knowledge summary
- cycle summary / cycle iterations
- output preview 和 output artifacts
- `state_schema` 作为唯一数据源参与整个执行链

后端运行主链已经迁到 LangGraph，并支持：

- interrupt / checkpoint / resume
- LangGraph Python 源码导出接口
- 运行记录持久化

## 知识库与 skill

知识库链路已经做到：

- 通过 input 节点选择知识库
- agent 自动显式挂载 `search_knowledge_base`
- 本地导入正式知识库并建 SQLite FTS 索引
- 检索结果带 `context / results / citations`

skill 链路已经做到：

- 后端解析 skill definitions
- 前端展示可挂载 skill
- agent 节点可显式添加、移除和保存 preset

## 后续路线图

仍然明确属于后续工作的方向包括：

- WebSocket 实时推送
- cycles 高级终止策略和更完整的可视化
- memory 正式写入、召回和详情展示
- 人类在环断点、暂停、恢复和审计轨迹
- LangGraph Python 导出入口、源码预览和下载 UI
- 知识库更新、删除、重建索引和检索质量增强
- 桌宠 Agent 与自动编排图协作层

桌宠 Agent 的长期目标是成为 GraphiteUI 的协作入口：先能解释当前图和校验问题，再能在用户确认后生成图草案、创建节点、连接边、运行校验，最终演进到受控的“边走边画”自动编排。

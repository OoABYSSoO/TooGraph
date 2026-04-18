# GraphiteUI 当前运行态与后续方向

当前运行态已经具备这些正式能力：

- Vue 前端已经完成对旧前端主逻辑的迁移收口
- graph save / validate / run
- 节点执行状态追踪
- state snapshot / state events
- skill outputs
- knowledge summary
- cycle summary / cycle iterations
- `state` 作为唯一数据源参与整个执行链

知识库这条链目前已经做到：

- 通过 input 节点选择知识库
- agent 自动显式挂载 `search_knowledge_base`
- 本地导入正式知识库并建索引
- 检索结果带 `context / results / citations`

目前仍然明确属于后续工作的方向主要有：

- WebSocket 实时推送
- cycles 高级终止策略和更完整的可视化
- memory 正式写入、召回和详情展示
- 人类在环断点、暂停、恢复和审计轨迹
- LangGraph Python 导出入口、源码预览和下载 UI
- 知识库管理能力：
  - 更新
  - 删除
  - 重建索引
  - 检索质量增强

如果要理解当前产品状态，一个简单心智是：

- 核心编辑和运行主链已经成型，Vue 迁移也已经完成
- `node_system` 已经是唯一正式协议，不再区分旧模板和新模板
- 围绕 cycles、memory、interrupt 和知识库增强的部分还在继续打磨

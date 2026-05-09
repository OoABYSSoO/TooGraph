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
- SSE/EventSource 运行事件流
- Run Activity 面板和 Output 节点实时预览
- `local_path` 本地 skill artifact 的 Output 展示，包括文档、图片和视频
- `state_schema` 作为唯一数据源参与整个执行链

后端运行主链已经迁到 LangGraph，并支持：

- interrupt / checkpoint / resume
- LangGraph Python 源码导出接口
- 运行记录持久化

## 知识库与 skill

知识库链路已经做到：

- 通过 input 节点选择知识库
- 本地导入正式知识库并建 SQLite FTS 索引
- knowledge catalog 查询与 graph state 输入
- 检索能力不再隐式内置，需要通过显式 skill 接入

skill 链路已经做到：

- 后端解析 skill definitions
- 前端展示可挂载 skill
- agent 节点可显式添加、移除和保存 preset
- `skill/<skill_key>` 文件夹内的 `skill.json` manifest、脚本和说明文档共同定义一个 skill
- `web_search` skill 支持联网搜索、引用整理、网页正文抓取和本地 source document 输出
- `web_media_downloader` skill 支持下载公开或用户授权的网页媒体并返回本地路径
- `game_ad_research_collector` skill 支持采集游戏市场资料、发现/下载公开视频广告素材，并返回本地 artifact

## 后续路线图

仍然明确属于后续工作的方向包括：

- cycles 高级终止策略和更完整的可视化
- memory 正式写入、召回和详情展示
- 人类在环断点、暂停、恢复和审计轨迹的增强体验
- LangGraph Python 源码预览、下载和导入校验体验完善
- 知识库更新、删除、重建索引和检索质量增强
- Agent / 伙伴 Skill 的权限、健康检查、测试和配置体验
- 伙伴 Agent 与自动编排图协作层

伙伴 Agent 的长期目标是成为 GraphiteUI 的协作入口：先能解释当前图和校验问题，再能在用户确认后生成图草案、创建节点、连接边、运行校验，最终演进到受控的“边走边画”自动编排。

# Current Project Status

这份文档是当前 GraphiteUI 项目状态的正式快照，也是项目知识库导入时会读取的一份源码文档。

## 结论

- Vue 前端替换旧 React 前端的迁移已经完成。
- 当前首页、编辑器、运行记录、运行详情和设置页都已经回到正式主链。
- 仍未完成的事项属于产品路线图，不属于这次迁移的遗留缺口。

## 当前正式能力

### 前端主链

- 首页：`/`
  - 最近运行
  - 模板入口
  - 最近 graphs
- 编辑器：`/editor`、`/editor/new`、`/editor/:graphId`
  - welcome/workspace 分流
  - tabs
  - graph 保存、校验、运行
  - `State Panel`
  - 节点内联编辑
  - 控制流 / route 建链、删链、重连与运行反馈
- 运行页：`/runs`、`/runs/:runId`
  - runs 列表、筛选、详情
  - run detail polling
  - cycle iterations
  - output artifacts
- 设置页：`/settings`
  - 默认模型
  - agent runtime defaults
  - provider 摘要

### 编辑器与运行态

- `node_system` 已经是唯一正式协议
- `state_schema` 是唯一正式数据源
- `input / agent / condition / output` 四类核心节点都可编辑
- `conditional_edges`、branch mapping、route target 已经联动收口
- run feedback 会同时反映在：
  - 工作区反馈条
  - 画布节点状态
  - active path 高亮
  - output latest run preview

### 知识库与技能

- knowledge base 可以通过 input 节点进入图
- agent 会按绑定关系自动显式挂载 `search_knowledge_base`
- skills definitions 与 knowledge base catalog 都有真实接口
- GraphiteUI / Python / LangGraph 三套正式知识库都已经能导入并检索

## 当前技术栈

- 前端：Vue 3 + Vite + TypeScript
- 路由：Vue Router
- 前端状态：Pinia
- 交互基元：Reka UI
- 画布与节点系统：自定义实现
- 后端：FastAPI + LangGraph
- 持久化：
  - graphs / runs / settings / skills / presets：JSON 文件
  - knowledge base：SQLite + FTS

## 仍在路线图中的事项

这些事项依然重要，但不再视为“Vue 迁移未完成”：

- WebSocket 实时推送
- Memory 正式写入、召回和展示
- 人类在环的前端断点 / 恢复 / 审计闭环
- LangGraph Python 导出入口、源码预览和下载 UI
- cycles 更高级的终止策略和可视化
- 更强的 knowledge base 管理能力

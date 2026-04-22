# Current Project Status

这份文档是当前 GraphiteUI 项目状态的正式快照，也是 GraphiteUI 项目知识库导入时会读取的一份源码文档。

## 结论

- Vue 前端迁移已经完成，旧前端迁移计划不再是当前工作主线。
- 当前首页、编辑器、运行记录、运行详情和设置页都在正式主链上。
- `node_system` 是唯一正式图协议，`state_schema` 是唯一正式数据源。
- 当前仍未完成的事项属于产品路线图，不属于迁移遗留缺口。

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

- `input / agent / condition / output` 四类核心节点都可编辑。
- `input` 节点有且只有一个 state 输出，不能通过数据线编辑误删。
- 新建的非 input 节点默认具备可接入的 any 输入语义。
- agent 节点支持模型选择、thinking 开关、skills、输入引用、输出引用、temperature 和保存 preset。
- condition 节点作为条件边的可视化代理，默认包含 true / false / exhausted 分支，并限制循环上限为 1-10，默认 5。
- output 节点支持预览、展示模式和持久化开关。
- run feedback 会同时反映在工作区反馈条、画布节点状态、active path 线条和 output latest run preview。
- 运行记录中的 `node_executions` 只记录真实执行的 agent；input / output / condition 只作为边界状态、输出 artifact 和条件 route 参与反馈。

### 后端主链

- FastAPI 提供 graphs / runs / templates / presets / settings / skills / knowledge / memories API。
- validator 负责 node_system graph 的结构校验。
- LangGraph runtime 是当前运行主链，并采用 agent-only 语义：只有 agent 注册为 LangGraph node，input / output / condition 不再写入 node execution。
- 后端支持 LangGraph Python 源码导出接口。
- 后端具备 interrupt / checkpoint / resume 能力，前端人类在环完整产品闭环仍在路线图中。

### 知识库与技能

- knowledge base 可以通过 input 节点进入图。
- agent 读取 knowledge base state 时会同步显式挂载 `search_knowledge_base`。
- skills definitions 与 knowledge base catalog 都有真实接口。
- GraphiteUI / Python / LangGraph 三套正式知识库都能导入并检索。

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

- WebSocket 实时推送
- Memory 正式写入、召回和展示
- 人类在环的前端断点 / 恢复 / 审计闭环
- LangGraph Python 导出入口、源码预览和下载 UI
- cycles 更高级的终止策略和可视化
- 更强的 knowledge base 管理能力
- 桌宠 Agent 和自动编排图协作层

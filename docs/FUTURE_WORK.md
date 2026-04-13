# Future Work

这份文件只记录当前仓库扫描后仍明确属于未来工作的事项。

判断原则：

- 代码里已经有稳定实现的，不再写进这里
- 文档仍然要推动、但代码还没完全落地的，集中写在这里

当前优先级：

1. `node_system` 单轨协议收口
2. State Panel 与 state 一等对象表达
3. Cycles 正式支持
4. Knowledge Base 正式能力建设
5. Memory 正式能力建设
6. 人类在环与断点

## 1. `node_system` 单轨协议收口

当前代码现状：

- 当前前后端主链已经只使用 `node_system`
- 但 graph payload、node config、runtime run detail、editor 可视化之间还没有完全收成一套明确契约
- 前后端 schema 仍然是手工镜像维护，还不是单一 source of truth

后续要做：

- 明确 graph payload 的正式边界，目标是“只靠保存下来的图文件就能完整还原编辑图”
- 收紧 payload 中真正应该持久化的内容，只保留恢复编辑与运行必需的信息
- 明确 node 保存与 graph 保存的边界：
  - graph 保存的是当前画布中的节点实例
  - node / preset 保存的是可复用模板
  - 未单独保存为节点或 preset 的 graph 内节点，不进入节点选择列表
- 建立前后端单一 source of truth，避免继续手写维护两份近似 schema
- 把 runtime 输出、state readers / writers、editor 可视化之间的正式契约写清楚，至少包括：
  - `state_schema` 只描述 state 本体，不持久化 readers / writers 聚合结果
  - node 上持久化 `stateReads / stateWrites`
  - runtime 必须返回结构化的 `state_snapshot / state_events / node_executions`
  - editor 的 `State Panel` 基于这些正式结构做聚合展示与反向编辑
  - 需要明确 state 读取时机、state 写回时机、端口输入与 state 读取的冲突规则

## 2. State Panel 与 state 一等对象表达

当前代码现状：

- editor 已有画布、建点、连线、运行、输出预览
- `state_schema` 已经存在于 graph payload 中，但 editor 里没有真正可编辑的 `State Panel`
- 当前 state 既不是 graph 内的一等编辑对象，也没有和 node 上的读写关系形成正式契约

后续要做：

- 在 editor 右侧增加默认折叠的 `State Panel`
- 明确 `State Panel` 不是只读展示，而是 graph 级 state 的主编辑入口
- 让 `state_schema` 成为 graph 内可编辑的正式对象，至少支持：
  - 新增 / 删除 state
  - 编辑 `key / type / title / description / defaultValue / ui`
  - 按 state 聚合查看 readers / writers
- 让 `State Panel` 的编辑同步修改 node 上的正式配置，而不是引入第三套持久化结构
- 把 node 的 state 关系收敛为结构化字段，而不是继续依赖隐式约定或自由文本：
  - `stateReads`
  - `stateWrites`
- 明确 node 才是 readers / writers 的持久化 source of truth：
  - graph 保存后可以完整还原编辑状态
  - node 被单独保存、复制、另存为 preset 时不丢失 state 行为
  - 只保存 graph、不保存节点模板时，该节点不会自动进入节点选择列表

## 3. Cycles 正式支持

当前代码现状：

- runtime 会检测 cycles，但检测到后直接失败退出
- condition 的 `cycle` 模式仍然只是注释中的计划项
- 当前系统实际只支持 DAG 单次执行

后续要做：

- 定义 cycles 的正式执行语义，而不是只做检测：
  - 多轮执行
  - 退出条件
  - 最大轮次
  - 无变化停止
- 明确 cycles 和 state 的关系：
  - 循环中哪些 state 可以被反复读写
  - 每轮执行后如何持久化快照
- 明确 cycles 和 interrupt 的关系：
  - 是否允许在循环中暂停
  - 恢复后从哪一轮、哪个节点继续
- 在 editor 和 run detail 中可视化循环轮次、回边和终止原因

## 4. Knowledge Base 正式能力建设

当前代码现状：

- knowledge 当前是本地目录扫描加简单字符串搜索
- `/api/knowledge/bases` 只返回目录名，editor 只是把 knowledge base 名称作为输入值传给节点
- runtime 当前没有正式的 retrieval、引用、分块、索引、版本和来源契约

后续要做：

- 把 knowledge base 明确定义成正式资源，而不是“目录名字符串”
- 明确 knowledge base / document / chunk / retrieval result 的正式数据结构
- 增加知识库导入、更新、删除、重建索引和状态查看能力
- 定义 editor 与 runtime 的知识库契约：
  - graph 中如何绑定 knowledge base
  - node 如何声明要读哪一个 knowledge base
  - runtime 如何返回检索命中、来源、摘要与引用
- 决定第一版是否先做全文检索正式化，还是直接进入分块检索 / 向量检索

## 5. Memory 正式能力建设

当前代码现状：

- `/memories` 页面和 `/api/memories` 只保留只读占位与示例数据
- 当前没有正式的 memory 写入链路、召回策略、生命周期管理和运行时集成
- run detail 虽然预留了 memory 展示位，但还没有真实的 runtime memory contract

后续要做：

- 定义 memory 的写入时机、读取时机和淘汰策略
- 明确 memory schema、来源、作用域和权限边界
- 决定 memory 是挂在 run、graph、workspace 还是 project 维度
- 明确 memory 和 runtime 的正式契约：
  - 哪些节点可以写 memory
  - 哪些节点可以读 memory
  - run detail 返回哪些 memory 相关结构化字段
- 决定是否保留独立 memory 页面；如果保留，至少要支持真实记录、检索、来源追踪和详情查看

## 6. 人类在环与断点

当前代码现状：

- runtime 目前只有 `queued / running / completed / failed`
- 没有 breakpoint、pause、resume、approval、edit-and-continue 这类正式运行时状态
- editor 和 run detail 也没有人为接管或恢复执行的入口

后续要做：

- 设计类似 LangGraph interrupt 的正式暂停点：
  - 手动 breakpoint
  - 节点前暂停
  - 节点后暂停
  - 条件命中后暂停
- 扩展 run status，至少支持：
  - `paused`
  - `awaiting_human`
  - `resuming`
- 定义人为接管的数据结构：
  - 暂停原因
  - 当前节点
  - 可编辑的输入 / state / 输出草稿
  - 用户决策记录
- 增加恢复执行能力：
  - approve / reject / edit-and-continue / skip
  - run detail 与 editor 内都可恢复
- 明确审计轨迹，保证每次人工介入都可回溯

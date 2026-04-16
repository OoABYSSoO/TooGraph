# Current Engineering Backlog

这份文件是当前仓库唯一的工程待办文档。

使用原则：

- 只记录仍未完成、且从当前代码出发仍然成立的事项
- 已完成的迁移、设计稿、阶段性方案不再单独保留
- 以代码现状为准，不重复记录已经进入主链的能力

## 当前优先级

1. 编辑器原生正式协议化
2. Cycles 交互与高级策略
3. Knowledge Base 收尾与增强
4. Memory 正式能力建设
5. 人类在环前端与审计闭环
6. LangGraph Python 导出前端入口

## 1. 编辑器原生正式协议化

当前代码现状：

- 后端模板、图、保存、校验、运行、LangGraph 导出都已经以正式 `node_system` schema 为边界
- `/api/templates`、`/api/graphs/*` 和 LangGraph runtime 直接消费正式协议
- 前端在接口边界上已经提交正式协议
- 但编辑器内部仍保留一层独立于正式协议的编辑视图模型：
  - `NodePresetDefinition`
  - `PortDefinition`
  - `StateField`
  - `SkillAttachment`
- 当前仍存在明确的兼容/回退逻辑：
  - `label` 回退
  - `defaultValue` 回退
  - `text -> string` 类型映射
  - 从旧 `stateReads/stateWrites` 与端口结构推导 canonical `reads/writes`

目标：

- 前端内部以 `CanonicalGraph / NodeSystemGraphPayload` 作为唯一业务数据源
- ReactFlow node/edge 只作为渲染投影，不再承载第二套业务协议
- 在不改变现有视觉风格和主要交互表象的前提下，删除编辑器内部兼容层

关键代码位置：

- [node-system-schema.ts](/home/abyss/GraphiteUI/frontend/lib/node-system-schema.ts)
- [node-system-canonical.ts](/home/abyss/GraphiteUI/frontend/lib/node-system-canonical.ts)
- [node-system-editor.tsx](/home/abyss/GraphiteUI/frontend/components/editor/node-system-editor.tsx)
- [node-presets-mock.ts](/home/abyss/GraphiteUI/frontend/lib/node-presets-mock.ts)
- [node_system.py](/home/abyss/GraphiteUI/backend/app/core/schemas/node_system.py)

执行顺序：

### Phase A：明确唯一业务数据源

范围：

- `canonicalGraphState` 成为节点、state、边、条件边的唯一业务真相
- ReactFlow 里的 `nodes / edges` 只保留渲染所需字段：
  - 位置
  - 折叠状态
  - 框体尺寸
  - 局部 UI 暂态
- 节点卡片、State Panel、运行前保存逻辑都直接围绕 canonical graph 读写

完成标准：

- 业务字段只有一份主存储
- 节点编辑不会再先改旧视图模型、再投影回 canonical
- 保存、校验、运行继续直接提交正式协议
- 视觉效果不变

### Phase B：节点与 State Panel 直接围绕 canonical 渲染

范围：

- `NodeCard` 直接读取 canonical node
- `StatePanel` 直接读取 canonical `state_schema`
- reader / writer 摘要直接从 canonical `reads / writes` 派生
- 节点标题、描述、state 展示都不再依赖旧壳类型做二次搬运

完成标准：

- state、端口、节点显示信息的源头唯一
- State Panel 改名、节点端口改名都直接改正式数据源
- 不引入新的视觉差异

### Phase C：端口语义去副本

范围：

- 删除或降级 `PortDefinition.label`
- state 绑定端口的显示名统一直接取 `state.name`
- 双击端口改名时，直接修改对应 state
- 只有 condition 的 branch 分支名保留独立语义；普通 state 绑定端口不再维护第二份名称

完成标准：

- 端口名没有第二份业务副本
- state 改名和端口改名完全共用同一源数据
- 不再需要为端口名做额外同步逻辑

### Phase D：技能与预设围绕 canonical 收口

范围：

- 去掉 `SkillAttachment` 作为主业务结构
- agent 的技能主存储直接收口为 `string[]`
- 技能显示元数据通过 `skillDefinitions` 查表补充
- preset 主链以 canonical preset 为基础
- 删除 `EditorPresetRecord` 中不必要的旧 definition 壳子

完成标准：

- 技能区显示不变
- 自动挂载知识库 skill 逻辑不变
- 创建节点、保存预设、加载预设不再要求旧编辑协议做中转

### Phase E：删除旧字段兼容与历史回退

范围：

- 删除前端的 `label` / `defaultValue` 回退
- 删除后端 schema 对 `defaultValue` 的兼容接收
- 删除 `text -> string` 的历史映射
- 删除旧 `extractLegacyStateReads / extractLegacyStateWrites` 路径
- 删除不再使用的 helper / 类型 / 映射函数

完成标准：

- 编辑器内部不再依赖旧字段兜底
- 正式协议字段集合在前后端保持一致
- 兼容层退场后，保存/运行/导出结果不变

### Phase F：零视觉回归验收

范围：

- 在正式协议原生化完成后，逐项回归现在的界面视觉与交互
- 特别检查节点卡片、标签栏、State Panel、节点编辑弹层、预设菜单

完成标准：

- 保持当前暖色、纸张感、工作台式视觉风格
- 不改变节点卡片布局与信息层级
- 不改变标签栏和画布的视觉设计
- 用户可感知到的是“数据一致性更强”，而不是“前端换了套设计”

每一步统一验收：

1. `/editor/new?template=hello_world` 正常打开
2. `hello_world` 可保存
3. `hello_world` 可校验
4. `hello_world` 可运行
5. 节点卡片视觉不变
6. State Panel 交互不变
7. 节点预设保存仍可用
8. `./scripts/start.sh` 重启后页面正常
9. 前端内部不再保留第二套业务协议作为主编辑源

## 2. Cycles 交互与高级策略

当前代码现状：

- LangGraph runtime 已支持条件边和 cycles 执行
- 运行结果会返回 `cycle_summary / cycle_iterations`
- 当前循环停止条件只覆盖显式退出分支和最大轮次保护

后续要做：

- 增加更完整的停止策略：
  - 无变化停止
  - 空轮次停止
  - 按 state 或输出变化量停止
- 给 editor 增加正式的循环配置入口：
  - `cycle_max_iterations`
  - 终止策略
  - 回边高亮
- 在 editor 和 run detail 中增强可视化：
  - 每轮执行路径
  - 回边
  - 终止原因
- 明确 cycles 和 interrupt 的衔接方式

## 3. Knowledge Base 收尾与增强

当前代码现状：

- knowledge base 已是正式资源层
- 已有离线导入、本地索引、SQLite FTS 检索主链
- `search_knowledge_base` 已进入正式执行主链

后续要做：

- 增加知识库导入、更新、删除、重建索引和状态查看能力
- 增强检索质量：
  - query 归一化
  - rerank
  - 向量检索或混合检索
- 扩展使用方式：
  - 多 knowledge base
  - 更细的 query mapping
  - 更清晰的 citation 展示
- 明确知识库管理边界：
  - 本地缓存
  - 版本刷新
  - 导入失败恢复

## 4. Memory 正式能力建设

当前代码现状：

- `/memories` 页面和 `/api/memories` 仍是只读占位
- 当前没有正式的 memory 写入链路、召回策略、生命周期管理和运行时集成

后续要做：

- 定义 memory 的写入时机、读取时机和淘汰策略
- 明确 memory schema、来源、作用域和权限边界
- 决定 memory 挂在哪个维度：
  - run
  - graph
  - workspace
  - project
- 明确 memory 和 runtime 的正式契约
- 决定是否保留独立 memory 页面

## 5. 人类在环前端与审计闭环

当前代码现状：

- 后端已经有：
  - `paused / awaiting_human / resuming`
  - checkpoint / resume
  - interrupt before / after
  - `POST /api/runs/{run_id}/resume`
- 前端还没有正式的人类在环入口和审计闭环

后续要做：

- 在 run detail 中展示等待人工输入的结构化信息
- 增加最小恢复面板：
  - approve
  - reject
  - edit-and-continue
  - skip
- 给 editor 增加断点配置入口
- 记录人工介入审计轨迹，保证每次恢复都可回溯

## 6. LangGraph Python 导出前端入口

当前代码现状：

- 后端已经支持导出可执行 Python：
  - `POST /api/graphs/export/langgraph-python`
- 前端还没有导出入口和下载交互

后续要做：

- 在 editor 中增加“导出 LangGraph Python”入口
- 提供源码预览和下载
- 明确导出时的图校验和错误提示

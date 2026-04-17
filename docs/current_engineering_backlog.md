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
- 前端已经完成这几项收口：
  - 节点与 state 的正式读写关系完全以 canonical `reads / writes` 为准
  - `stateReads / stateWrites` 已从前端正式节点类型和主转换链移除
  - 节点卡片、State Panel、输入节点值同步、运行前提交都已 canonical-first
  - ReactFlow 画布主链已不再直接读取 `data.config`
  - ReactFlow node data 已删除 `config` 业务镜像，只保留 canonical node 与显示投影
  - 新建节点、知识库自动挂 skill、预设保存、输出预览和连线判定都已改为 canonical-first
  - 后端已经拒绝 `defaultValue`，前后端正式字段边界一致
  - 后端已删除 `legacy runtime` 选择与 fallback 分支，只保留 LangGraph 支持性检查
  - 前端已删除 `applyEditorConfigToCanonicalGraph / applyEditorConfigsToCanonicalGraph` 历史桥接
  - 持久化 preset 已改成以 canonical preset 为前端主存储，不再通过 `EditorPresetRecord.definition` 中转
  - agent skill 已直接以 canonical `skills: string[]` 作为前端编辑主语义
  - 一批只服务旧编辑模型的 helper 已删除，State Panel 也已改成 canonical-first
- 当前剩余问题主要集中在编辑器内部还保留一层轻量视图壳：
  - `NodePresetDefinition`
  - `PortDefinition`
  - `StateField`

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

### Phase A：继续压薄 editor-side 视图壳

范围：

- 继续检查 `NodePresetDefinition / PortDefinition / StateField` 是否还承担业务语义，而不是仅作为展示/编辑临时结构
- 让 editor helper 更明确地区分：
  - canonical 正式数据
  - 视图层派生数据
  - 局部 UI 草稿状态
- 重点收口仍然保留旧视图壳的区域：
  - 预设选择与 mock preset
  - Advanced JSON 入口
  - 节点编辑弹层里的端口临时结构

完成标准：

- 视图壳不再作为主业务真相
- 节点编辑继续直接改 canonical graph
- 不引入新的视觉差异

### Phase B：清理剩余类型映射与无用 helper

范围：

- 清理只为历史编辑模型服务的 helper、类型和中转函数
- 检查并删除已经失去调用方的旧逻辑

完成标准：

- 编辑器内部不再依赖旧字段兜底
- 不再保留无主的兼容函数和僵尸类型
- 保存/运行/导出结果保持不变

### Phase C：零视觉回归验收

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

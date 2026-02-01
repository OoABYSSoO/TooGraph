# Current Engineering Backlog

这份文件是当前仓库唯一的工程待办文档。

使用原则：

- 只记录仍未完成、且从当前代码出发仍然成立的事项
- 已完成的迁移、设计稿、阶段性方案不再单独保留
- 以代码现状为准，不重复记录已经进入主链的能力

## 当前优先级

1. 编辑器旧视图模型收口
2. Cycles 交互与高级策略
3. Knowledge Base 收尾与增强
4. Memory 正式能力建设
5. 人类在环前端与审计闭环
6. LangGraph Python 导出前端入口

## 1. 编辑器旧视图模型收口

当前代码现状：

- 后端协议、模板、图、预设、保存、校验和运行都已经切到正式 `node_system`
- LangGraph 已经是后端执行主链
- 前端接口兼容层已删除
- 但编辑器内部仍保留一层旧视图模型壳子：
  - `NodePresetDefinition`
  - `PortDefinition`
  - `StateField`
  - `SkillAttachment`

关键代码位置：

- [node-system-schema.ts](/home/abyss/GraphiteUI/frontend/lib/node-system-schema.ts)
- [node-system-canonical.ts](/home/abyss/GraphiteUI/frontend/lib/node-system-canonical.ts)
- [node-system-editor.tsx](/home/abyss/GraphiteUI/frontend/components/editor/node-system-editor.tsx)
- [node-presets-mock.ts](/home/abyss/GraphiteUI/frontend/lib/node-presets-mock.ts)

执行顺序：

### Phase B：技能面板直接改为 `string[]`

范围：

- 去掉 `SkillAttachment`
- agent 配置中的 `skills` 直接变成 `string[]`
- 技能定义元数据通过 `skillDefinitions` 查表获取显示名和 schema

完成标准：

- 节点技能区显示不变
- 自动挂载知识库 skill 逻辑不变
- 保存、校验、运行不需要再组装 skill attachment 对象

### Phase C：端口名去副本

范围：

- 删除 `PortDefinition.label`
- 端口显示名统一直接取绑定的 `state.name`
- 双击端口改名时直接修改对应 state

完成标准：

- 端口名没有第二份存储
- state 改名和端口改名完全共用同一源数据

### Phase D：State Panel 直接读 canonical state

范围：

- `StatePanel` 直接消费 `canonicalGraph.state_schema`
- `StateField[]` 降为局部辅助结构，或直接删除
- State Panel 中的 reader / writer 摘要全部从 canonical `reads / writes` 派生

完成标准：

- State Panel 不再依赖 `StateField[]` 主状态
- state 的增删改查直接落到 canonical graph

### Phase E：节点卡片直接围绕 canonical node 渲染

范围：

- `NodeCard` 直接读 canonical node
- `listInputPorts` / `listOutputPorts` 等旧 config 辅助函数逐步退场
- `NodePresetDefinition` 不再作为节点卡片主输入类型

完成标准：

- 节点卡片不再依赖旧 `config.inputs / outputs`
- `NodePresetDefinition` 降为历史类型或被彻底删除

### Phase F：预设视图层收口

范围：

- 创建节点时直接基于 canonical preset
- 删除 `EditorPresetRecord` 里的旧 definition 壳子
- 预设菜单只保留当前 UI 所需的最薄投影

完成标准：

- preset 主链完全围绕 canonical
- 不再需要把 preset definition 转成旧节点配置对象

每一步统一验收：

1. `/editor/new?template=hello_world` 正常打开
2. `hello_world` 可保存
3. `hello_world` 可校验
4. `hello_world` 可运行
5. 节点卡片视觉不变
6. State Panel 交互不变
7. 节点预设保存仍可用
8. `./scripts/start.sh` 重启后页面正常

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

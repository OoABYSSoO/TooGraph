# Current Engineering Backlog

这份文件只保留当前仍未完成、并且从主分支代码现状出发依然成立的事项。

使用原则：

- 已完成的迁移、阶段计划、讨论稿不再保留
- 以主分支代码和当前测试结果为准
- 只记录还需要继续做的工作

## 当前优先级

1. Cycles 高级策略与终止语义
2. Knowledge Base 收尾与增强
3. Memory 正式能力建设
4. 人类在环前端与审计闭环
5. LangGraph Python 导出前端入口

## 1. Cycles 高级策略与终止语义

当前代码现状：

- LangGraph runtime 已支持 cycles 执行
- 运行结果会返回 `cycle_summary / cycle_iterations`
- 回边高亮、active edge 强调、逐轮 iteration 详情已经具备
- 当前循环上限已收口到 `condition.config.loopLimit`
- 当前已支持一类安全停止策略：
  - 无状态变化停止（`no_state_change`）
  - 空轮次停止（`empty_iteration`）
- run detail 已能展示更明确的终止原因说明

后续要做：

- 增加更完整的停止策略：
  - 按 state 或输出变化量停止
- 明确 cycles 与 interrupt 的衔接方式

## 2. Knowledge Base 收尾与增强

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

## 3. Memory 正式能力建设

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

## 4. 人类在环前端与审计闭环

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

## 5. LangGraph Python 导出前端入口

当前代码现状：

- 后端已经支持导出可执行 Python：
  - `POST /api/graphs/export/langgraph-python`
- 前端还没有导出入口和下载交互

后续要做：

- 在 editor 中增加“导出 LangGraph Python”入口
- 提供源码预览和下载
- 明确导出时的图校验和错误提示

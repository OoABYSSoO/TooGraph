# Future Work

这份文件只记录当前仓库扫描后仍明确属于未来工作的事项。

判断原则：

- 代码里已经有稳定实现的，不再写进这里
- 文档仍然要推动、但代码还没完全落地的，集中写在这里

## 1. State Panel 与 state 一等对象表达

当前代码现状：

- editor 已有画布、建点、连线、运行、输出预览
- 但没有真正独立的 `State Panel`

后续要做：

- 左侧拆成清晰的 `State Panel + Node Palette`
- 让 state 成为可见、可编辑、可追踪 readers / writers 的对象
- 为 state color 等可视字段确定正式持久化位置

## 2. 参数级 socket 覆盖本地值

当前代码现状：

- 现在稳定工作的仍是节点级 `input / output` ports
- 通用的 widget-level socket 覆盖还没形成正式能力

后续要做：

- 让参数字段支持“本地 widget + 上游连接覆盖”的统一规则
- 保存并重开 graph 后仍能恢复绑定关系

## 3. editor 内节点级执行详情

当前代码现状：

- 后端已经提供 `/api/runs/{run_id}/nodes/{node_id}`
- editor 目前主要做的是输出预览回填和 run detail 跳转

后续要做：

- 直接在 editor 内查看节点级执行结果、错误、摘要和 changed outputs

## 4. `hello_world` 最新人工闭环验收

当前代码现状：

- `hello_world` 模板已经由后端 `default_node_system_graph` 提供
- 保存、校验、运行链路已经存在

后续要做：

- 用当前版本的 `question + knowledge_base -> onboarding helper -> answer` 实际再跑一轮人工验收

## 5. 技能概念继续弱化与收口

当前代码现状：

- editor 里的 agent 仍可挂载 skills
- 仓库仍然保留独立 `/skills` 页面和技能管理流

后续要做：

- 继续收口 skill 在产品中的暴露方式
- 减少“用户先理解 skill，再理解节点”的心智负担

## 6. Memory 正式能力建设

当前代码现状：

- `/memories` 页面和 `/api/memories` 只保留只读占位与示例数据
- 当前没有正式的 memory 写入链路、召回策略、生命周期管理和运行时集成

后续要做：

- 定义 memory 的写入时机、读取时机和淘汰策略
- 明确 memory schema、来源、作用域和权限边界
- 决定 memory 是挂在 run、graph、workspace 还是 project 维度
- 再决定是否恢复独立 memory 管理流

## 7. 新节点系统与旧 graph schema 双轨收口

当前代码现状：

- 后端同时保留了旧 `graph.py` 协议和新的 `node_system.py` 协议
- 当前 editor 走的是 node-system 主链

后续要做：

- 进一步明确两套协议各自边界
- 决定哪些旧路径继续兼容，哪些应该逐步退出主叙事

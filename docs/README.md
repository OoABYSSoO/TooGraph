# GraphiteUI Docs

`docs/` 只保留当前仍然有效的正式文档和长期设想，不再保存迁移计划、临时进度记录、一次性分析报告或已经落地的设计稿。

## 当前保留

- [current_project_status.md](current_project_status.md)
  - 当前正式能力
  - 当前技术栈
  - 当前仍在路线图中的事项
  - 也是 GraphiteUI 项目知识库导入源之一

- [future/2026-04-21-agent-companion-graph-orchestration.md](future/2026-04-21-agent-companion-graph-orchestration.md)
  - 桌宠 Agent
  - 自动编排图
  - 规划后确认与边走边画两种未来模式

- [future/2026-04-22-agent-only-langgraph-runtime.md](future/2026-04-22-agent-only-langgraph-runtime.md)
  - 只让 agent 成为 LangGraph 真实节点
  - input / output / condition 作为 GraphiteUI 视觉边界和编排辅助
  - 对人类在环断点、output preview 和 runtime 编译层的影响

## 已清理

- 迁移闭环记录：`task_plan.md`、`findings.md`、`progress.md`
- 已完成的节点创建方式对齐报告
- 已完成的 node top actions / state popover 计划和规格
- 过期或偏离当前 Vue + Element Plus + node_system 主线的文档

## 维护原则

- README 是项目主入口。
- 当前状态写在 `docs/current_project_status.md`。
- 长期设想保留在 `docs/future/`，并在 README 中保留摘要。
- 如果某份文档只是某个阶段的临时计划，阶段结束后应删除或折叠进当前状态文档。

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

- [future/2026-04-27-skill-product-taxonomy.md](future/2026-04-27-skill-product-taxonomy.md)
  - Agent Skill 与 Companion Skill 的产品边界
  - Atomic / Workflow / Tool / Context / Profile / Adapter / Control 等能力形态
  - 桌宠 Agent 与编排器 Agent Node 的 skill 使用边界

## 已清理

- 迁移闭环记录：`task_plan.md`、`findings.md`、`progress.md`
- 已完成的 agent-only LangGraph runtime 规划文档
- 已完成或偏离当前 `skill/<skill_key>` 目录主线的旧 skill 重构文档
- `docs/superpowers/` 下阶段性实施计划、设计稿和 TDD 执行记录
- 已完成的架构拆分路线文档
- 阶段性的外部 Agent 框架对标和 LangGraph 高级能力基线分析
- 过期或偏离当前 Vue + Element Plus + node_system + 原生 skill 主线的文档

## 维护原则

- README 是项目主入口。
- 当前状态写在 `docs/current_project_status.md`。
- 长期设想保留在 `docs/future/`，并在 README 中保留摘要。
- 如果某份文档只是某个阶段的临时计划，阶段结束后应删除或折叠进当前状态文档。

# GraphiteUI Docs

`docs/` 只保留当前仍然有效的正式文档和长期设想，不再保存迁移计划、临时进度记录、一次性分析报告或已经落地的设计稿。

## 当前保留

- [current_project_status.md](current_project_status.md)
  - 当前正式能力
  - 当前技术栈
  - 当前仍在路线图中的事项
  - 也是 GraphiteUI 项目知识库导入源之一

- [future/companion-autonomous-agent-roadmap.md](future/companion-autonomous-agent-roadmap.md)
  - 桌宠、自主工具循环、技能生成和长期协作能力的唯一参考文档
  - 包含桌宠权限分层、记忆边界、Skill 系统边界、function call 取舍、缺工具处理和 `graphite_skill_builder` 路线
  - 后续桌宠 Agent、Companion Skill、图操作审批和自主工具循环设计都应先合并进这份文档

## 已清理

- 迁移闭环记录：`task_plan.md`、`findings.md`、`progress.md`
- 已完成的 agent-only LangGraph runtime 规划文档
- 已完成或偏离当前 `skill/<skill_key>` 目录主线的旧 skill 重构文档
- `docs/superpowers/` 下阶段性实施计划、设计稿和 TDD 执行记录
- 已完成的架构拆分路线文档
- 阶段性的外部 Agent 框架对标和 LangGraph 高级能力基线分析
- 过期或偏离当前 Vue + Element Plus + node_system + 原生 skill 主线的文档
- 已被 `companion-autonomous-agent-roadmap.md` 合并和替代的桌宠权限、桌宠记忆、Skill 分类旧文档

## 维护原则

- README 是项目主入口。
- 当前状态写在 `docs/current_project_status.md`。
- 桌宠自主 Agent 方向只维护 `docs/future/companion-autonomous-agent-roadmap.md` 这一个长期参考。
- 如果某份文档只是某个阶段的临时计划，阶段结束后应删除或折叠进当前状态文档。
- 如果旧文档和 `AGENTS.md` 中的图优先、Skill 自包含、显式权限、artifact 输出、审计和记忆卫生准则冲突，以 `AGENTS.md` 为准，并尽快修正文档。
- 文档不能把已经拒绝的实现路线写成当前方案；仍有参考价值的旧内容应标为补充、约束或历史背景。
- 新增长期文档时，应明确它服务于当前正式能力、长期设想还是被更高优先级文档约束的补充方案。

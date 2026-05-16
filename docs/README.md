# TooGraph Docs

`docs/` 只保留当前仍然有效的正式文档和长期设想，不保存迁移计划、临时进度记录、一次性分析报告或已经落地的设计草稿。

## 当前保留

- [current_project_status.md](current_project_status.md)
  - 当前正式能力
  - 当前技术栈
  - 当前技能和模板状态
  - 当前仍在路线图中的事项

- [structured-output-and-function-calling.md](structured-output-and-function-calling.md)
  - `demo/` 中 Claude Code、Hermes Agent 和 OpenClaw 的结构化输出实现对比
  - function calling 的作用原理、边界和对 TooGraph 的引入建议

- [../skill/SKILL_AUTHORING_GUIDE.md](../skill/SKILL_AUTHORING_GUIDE.md)
  - Skill 包结构、生命周期入口和权限边界
  - 手工创建 Skill 与后续技能生成能力都应读取的协议说明
  - 记录 Skill 包定义与 `skill/settings.json` 本地使用设定分离的目标结构

- [future/buddy-autonomous-agent-roadmap.md](future/buddy-autonomous-agent-roadmap.md)
  - 伙伴、自主工具循环、技能生成和长期协作能力的唯一长期参考
  - 已合并 Hermes Agent、Claude Code 和伙伴循环模板调研中的有效结论，保留目标主模板、子图边界、节点契约、`capability` / `result_package` 协议、暂停恢复、悬浮窗体验、并行策略、Buddy Home 写回、活动事件、原生虚拟 UI 操作和未来优先级

## 已清理

- 迁移闭环记录：`task_plan.md`、`findings.md`、`progress.md`
- Hermes Agent、Claude Code 和伙伴循环模板的一次性调研/设计文档，已折叠进 `docs/future/buddy-autonomous-agent-roadmap.md`
- agent-only LangGraph runtime 规划文档，当前实现事实已进入状态快照
- 偏离当前 `skill/official` / `skill/user` 资产目录主线的旧 skill 重构文档
- 阶段性的外部 Agent 框架对标和 LangGraph 高级能力基线分析
- 被新版伙伴自主 Agent 路线图合并和替代的旧权限、记忆和技能分类文档
- 旧内置模板和旧技能包的说明
- `docs/superpowers/` 下 2026-05-11 至 2026-05-15 的阶段性实现计划和设计稿，已按当前代码事实折叠进 `current_project_status.md` 与唯一方针文档；伙伴运行过程胶囊、HTML state 输出和页面操作系统的一次性草稿已随实现落地并删除

## 维护原则

- README 是项目文档主入口。
- 当前状态写在 `docs/current_project_status.md`。
- 伙伴自主 Agent 方向只维护 `docs/future/buddy-autonomous-agent-roadmap.md` 这一份长期参考；其中的阶段清单只保留未来工作，不记录完成项流水账。
- 阶段结束后，临时计划应删除或折叠进当前状态文档，完成记录不继续作为独立文档保留。
- 文档不能把已经拒绝或删除的实现路线写成当前方案。
- 如果旧文档和 `AGENTS.md` 中的图优先、skill 自包含、显式权限、artifact 输出、审计和记忆卫生准则冲突，以 `AGENTS.md` 为准，并尽快修正文档。

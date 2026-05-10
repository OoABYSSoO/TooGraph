# GraphiteUI Docs

`docs/` 只保留当前仍然有效的正式文档和长期设想，不保存迁移计划、临时进度记录、一次性分析报告或已经落地的设计草稿。

## 当前保留

- [current_project_status.md](current_project_status.md)
  - 当前正式能力
  - 当前技术栈
  - 当前技能和模板状态
  - 已完成能力、部分完成的技术债和近期仍在路线图中的事项

- [structured-output-and-function-calling.md](structured-output-and-function-calling.md)
  - `demo/` 中 Claude Code、Hermes Agent 和 OpenClaw 的结构化输出实现对比
  - function calling 的作用原理、边界和对 GraphiteUI 的引入建议

- [../skill/SKILL_AUTHORING_GUIDE.md](../skill/SKILL_AUTHORING_GUIDE.md)
  - Skill 包结构、生命周期入口和权限边界
  - 手工创建 Skill 与后续技能生成能力都应读取的协议说明
  - 记录 Skill 包定义与 `skill/settings.json` 本地使用设定分离的目标结构

- [future/buddy-autonomous-agent-roadmap.md](future/buddy-autonomous-agent-roadmap.md)
  - 伙伴、自主工具循环、技能生成和长期协作能力的唯一长期参考
  - 包含 graph-first 运行模型、可追踪资产与本地设置分离、Buddy Home、伙伴循环子图化、子图组件、skill manifest 契约、`capability` state、`result_package` 动态结果包、技能说明胶囊、技能绑定 state、能力选择、Skill 生成能力、伙伴断点交互、已落地基线、剩余优先级、活动事件和 function call 取舍

## 已清理

- 迁移闭环记录：`task_plan.md`、`findings.md`、`progress.md`
- 已完成的 agent-only LangGraph runtime 规划文档
- 已完成或偏离当前 `skill/official` / `skill/user` 资产目录主线的旧 skill 重构文档
- 阶段性的外部 Agent 框架对标和 LangGraph 高级能力基线分析
- 被新版伙伴自主 Agent 路线图合并和替代的旧权限、记忆和技能分类文档
- 旧内置模板和旧技能包的说明

## 维护原则

- README 是项目文档主入口。
- 当前状态写在 `docs/current_project_status.md`。
- 伙伴自主 Agent 方向只维护 `docs/future/buddy-autonomous-agent-roadmap.md` 这一份长期参考。
- 阶段结束后，临时计划应删除或折叠进当前状态文档。
- 文档不能把已经拒绝或删除的实现路线写成当前方案。
- 如果旧文档和 `AGENTS.md` 中的图优先、skill 自包含、显式权限、artifact 输出、审计和记忆卫生准则冲突，以 `AGENTS.md` 为准，并尽快修正文档。

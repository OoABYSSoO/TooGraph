# Docs Index

## 1. Documentation Zones

`docs/` 现在只保留三类仍有价值的文档：

## `docs/active/`

当前仍要继续推进的 editor 目标文档。

注意：

- 这里描述的是目标态和后续开发方向
- 不等同于“当前代码已经全部实现”
- 当前明确属于未来工作的事项统一列在 [FUTURE_WORK.md](/home/abyss/GraphiteUI/docs/FUTURE_WORK.md)

当前主文档：

- `editor_rebuild_requirements.md`
- `editor_interaction_spec.md`
- `development_plan.md`
- `acceptance_runbook.md`
- `node_system_design.md`
- `skill_management_and_agent_direction.md`

## `docs/architecture/`

仍然贴近当前代码方向的长期定位文档。

适合：

- 理解 GraphiteUI 为什么不是单个 demo 外壳
- 理解 framework / template / runtime 的长期边界

当前保留：

- `framework_positioning.md`

## `docs/design/`

对具体机制仍有参考价值的设计文档。

当前保留：

- `agent-auto-prompt.md`

## `docs/superpowers/`

已完成工作的实现笔记。

注意：

- 这些文档不是当前产品 source of truth
- 只作为窄范围实现记录保留

## 2. Recommended Reading Order

如果现在继续开发 editor，建议按这个顺序阅读：

1. `docs/FUTURE_WORK.md`
2. `docs/active/editor_rebuild_requirements.md`
3. `docs/active/editor_interaction_spec.md`
4. `docs/active/development_plan.md`
5. `docs/active/acceptance_runbook.md`
6. `docs/active/node_system_design.md`
7. `docs/active/skill_management_and_agent_direction.md`
8. `docs/architecture/framework_positioning.md`

## 3. Current Source of Truth

当前应以这几类信息共同作为依据：

- 代码实现本身
- [development_plan.md](/home/abyss/GraphiteUI/docs/active/development_plan.md)
- [acceptance_runbook.md](/home/abyss/GraphiteUI/docs/active/acceptance_runbook.md)
- [node_system_design.md](/home/abyss/GraphiteUI/docs/active/node_system_design.md)
- [skill_management_and_agent_direction.md](/home/abyss/GraphiteUI/docs/active/skill_management_and_agent_direction.md)
- [FUTURE_WORK.md](/home/abyss/GraphiteUI/docs/FUTURE_WORK.md)

其中：

- `requirements` 和 `interaction_spec` 负责描述目标态
- `development_plan` 负责描述当前基线与后续顺序
- `acceptance_runbook` 负责描述当前可执行验收路径
- `FUTURE_WORK` 负责明确哪些事情还没做完

## 4. This Cleanup

本轮扫描已删除两类容易误导的文档：

- 旧 `legacy/` 历史方案与旧阶段 spec / task 文档
- 已与当前仓库状态脱节的过渡重构计划文档

保留原则只有一个：

- 和当前代码方向仍一致，或者能明确表达未来目标的，保留
- 已经明显建立在旧协议、旧页面结构、旧 `hello_model` 叙述上的，删除

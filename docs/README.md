# Docs Index

## 1. Documentation Zones

`docs/` 当前分为三类：

## `docs/active/`

当前开发的直接依据。

适合：

- 继续开发新 editor
- 看当前需求、交互规则、开发顺序、验收标准

当前主文档：

- `editor_rebuild_requirements.md`
- `editor_interaction_spec.md`
- `development_plan.md`
- `acceptance_runbook.md`

## `docs/architecture/`

项目长期架构和框架定位文档。

适合：

- 理解 GraphiteUI 长期方向
- 理解 runtime / template / framework 层级

## `docs/legacy/`

历史方案、过期执行文档和旧阶段设计稿。

适合：

- 回看历史决策
- 对比旧 editor 和新 state-aware editor 的差异

当前已归档的旧文档包括：

- `editor_final_form_development_plan.md`
- `editor_final_form_task_breakdown.md`
- `framework_rebuild_execution_backlog_pre_state_aware_editor.md`
- 其他早期 spec / tasks / architecture 文档

## 2. Recommended Reading Order

如果现在继续开发 editor，建议按这个顺序阅读：

1. `docs/active/editor_rebuild_requirements.md`
2. `docs/active/editor_interaction_spec.md`
3. `docs/active/development_plan.md`
4. `docs/active/acceptance_runbook.md`
5. `docs/architecture/framework_positioning.md`

## 3. Current Source of Truth

当前 editor 的主依据是：

- [editor_rebuild_requirements.md](/home/abyss/GraphiteUI/docs/active/editor_rebuild_requirements.md)
- [editor_interaction_spec.md](/home/abyss/GraphiteUI/docs/active/editor_interaction_spec.md)
- [development_plan.md](/home/abyss/GraphiteUI/docs/active/development_plan.md)
- [acceptance_runbook.md](/home/abyss/GraphiteUI/docs/active/acceptance_runbook.md)

这些文档共同定义：

- 新 editor 是什么
- 为什么它和 LangGraph 兼容但不完全等同
- 现在应该先做什么
- 怎么验收第一阶段

---
name: 伙伴可见子图结果适配器
description: Internal Buddy adapter that re-labels a visible page-operation template run as the originally selected subgraph capability result.
---

# 伙伴可见子图结果适配器

This internal Skill is used by `buddy_autonomous_loop` after Buddy routes a selected `capability.kind=subgraph` through the visible `toograph_page_operation_workflow`.

It does not run templates, click UI, summarize results, or choose follow-up capabilities. It only wraps the page-operation workflow result package so downstream Buddy nodes can read a normal `capability_result` whose `sourceKey` is the originally selected target template.

LLM output:

- `selected_capability`: the original selected target capability, copied from `capability_selection_audit.selected`; must be `kind=subgraph`.
- `visible_operation_result`: the full result package produced by `toograph_page_operation_workflow`.
- `user_goal`: the original user goal, preferably `request_understanding.user_goal`.
- `reason`: short audit reason.

State output:

- `ok`: whether wrapping succeeded.
- `result_package`: result package for the original target subgraph, with `final_reply`, `operation_report`, and `visible_operation_result` outputs.
- `error`: structured failure detail.

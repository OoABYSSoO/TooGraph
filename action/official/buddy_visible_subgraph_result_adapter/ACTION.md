---
name: 伙伴可见子图结果适配器
description: Internal Buddy adapter that re-labels a visible page-operation template run as the originally selected subgraph capability result.
---

# 伙伴可见子图结果适配器

This internal Skill is used by `buddy_autonomous_loop` after Buddy routes a selected `capability.kind=subgraph` through the multi-step `toograph_page_operation_workflow`.

It does not run templates, click UI, summarize results, read full page snapshots, or choose follow-up capabilities. It only wraps compact visible-operation results so downstream Buddy nodes can read a normal `capability_result` whose `sourceKey` is the originally selected target template.

LLM output:

- `selected_capability`: optional fixed target capability; when omitted, the Skill uses `toograph_page_operation_workflow`.
- `operation_report`: compact fixed-template operation report produced by the frontend resume payload.
- `page_operation_final_reply` and `page_operation_workflow_report`: workflow outputs produced by `toograph_page_operation_workflow`.
- `visible_operation_result`: compatibility path for a full result package produced by `toograph_page_operation_workflow`.
- `user_goal`: the original user goal, preferably `request_understanding.user_goal`.
- `reason`: short audit reason.

State output:

- `ok`: whether wrapping succeeded.
- `result_package`: result package for the original target subgraph, with `final_reply`, `operation_report`, `validation_report`, and `visible_operation_result` outputs. `validation_report` is the budgeted target-run evidence and finite repair-option contract for downstream Buddy review nodes.
- `error`: structured failure detail.

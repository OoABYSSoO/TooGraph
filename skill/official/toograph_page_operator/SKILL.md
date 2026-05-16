---
name: TooGraph 页面操作器
description: Execute one semantic app-page operation through Buddy's virtual cursor without exposing DOM selectors or screen coordinates to the LLM.
---

# TooGraph 页面操作器

This official Skill validates one page-operation command sequence and asks TooGraph's app-native virtual operator layer to play the operation through Buddy's virtual cursor.

Current phase:

- Supports one operation per invocation.
- Supports safe `click`, `focus`, `clear`, `type`, `press`, and `wait` commands from the current page operation book.
- Supports `graph_edit editor.graph.playback` on editor pages. For graph editing, the LLM outputs product-semantic `graph_edit_intents`; the frontend compiles them into graph commands and visible playback steps.
- Validates commands against the current runtime page operation book. Off-book, stale-page, hidden, disabled, destructive, or confirmation-gated targets are rejected before a virtual operation event is accepted.
- Emits a deterministic `operation_request_id` plus `expected_continuation` metadata so the frontend can resume the paused graph with `page_operation_context`, `page_context`, and `operation_result` after real UI execution.
- Rejects Buddy self surfaces such as the Buddy page, Buddy floating window, Buddy avatar, and debug controls.
- Does not expose DOM selectors, screen coordinates, double-click recipes, or low-level mouse trajectories to the LLM.
- The official `toograph_page_operation_workflow` graph template is the preferred multi-step wrapper around this Skill. The Skill accepts or rejects one semantic operation; the template loops, waits for frontend confirmation, verifies refreshed page facts, and writes the final user explanation.

Graph state inputs:

- `user_goal`: user goal for the desired page operation.

Runtime context:

- `page_path`: current application route.
- `page_operation_book`: structured page operation book produced by the app runtime. Partner-related content is filtered before the LLM sees the operation book.

LLM output:

- `commands`: array containing one command from the current page operation book, such as `["click app.nav.library"]`, `["focus library.search.query"]`, `["type library.search.query 页面操作"]`, `["press library.search.query Enter"]`, or `["graph_edit editor.graph.playback"]`. Replace `<text>` and `<key>` placeholders with the actual text or key.
- `graph_edit_intents`: required only when `commands` is `["graph_edit editor.graph.playback"]`. Use semantic operations such as `create_node`, `create_state`, `bind_state`, `connect_nodes`, and `update_node`. `create_node.nodeType` supports `input`, `agent`, `output`, `condition`, and `subgraph`.
- `cursor_lifecycle`: virtual cursor lifecycle, such as `return_after_step`.
- `reason`: short audit reason for choosing the command.

State outputs:

- `ok`: whether the semantic operation was accepted.
- `cursor_session_id`: reserved virtual cursor session ID.
- `operation_request_id`: deterministic request ID used to correlate the activity event, frontend operation result, and run resume.
- `journal`: operation journal summary.
- `error`: structured failure detail.

Common workflow failure reasons:

- `target_graph_not_found`: the current page facts do not show the requested graph.
- `run_record_not_found`: no visible or triggered run record matches the user target.
- `stale_page_snapshot`: the operation was planned against an outdated page snapshot.
- `destructive_operation_blocked`: the requested target is destructive or confirmation-gated.
- `triggered_run_failed`: a run was triggered but reached a failed terminal status.
- `operation_interrupted`: the frontend, user, or runtime interrupted the requested operation.

`before_llm.py` injects the current page operation book from runtime context, not graph state. `after_llm.py` validates the LLM command list and emits a `virtual_ui_operation` activity event for the frontend runtime to execute. Successful events include `expected_continuation.mode = "auto_resume_after_ui_operation"` and `resume_state_keys = ["page_operation_context", "page_context", "operation_result"]`. Page routing and graph mutations are observed from the real UI after the operation, not guessed by the Skill.

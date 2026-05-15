---
name: TooGraph 页面操作器
description: Execute one semantic app-page operation through Buddy's virtual cursor without exposing DOM selectors or screen coordinates to the LLM.
---

# TooGraph 页面操作器

This official Skill validates one page-operation command sequence and asks TooGraph's app-native virtual operator layer to play the operation through Buddy's virtual cursor.

Current phase:

- Supports one operation per invocation.
- Supports application navigation clicks only.
- Supports safe application navigation click commands from the current page operation book.
- Rejects Buddy self surfaces such as the Buddy page, Buddy floating window, Buddy avatar, and debug controls.
- Does not expose DOM selectors, screen coordinates, or low-level mouse trajectories to the LLM.

Graph state inputs:

- `user_goal`: user goal for the desired page operation.

Runtime context:

- `page_path`: current application route.
- `page_operation_book`: structured page operation book produced by the app runtime. Partner-related content is filtered before the LLM sees the operation book.

LLM output:

- `commands`: array of command strings copied from the page operation book, such as `["click app.nav.library"]`.
- `cursor_lifecycle`: virtual cursor lifecycle, such as `return_after_step`.
- `reason`: short audit reason for choosing the command.

State outputs:

- `ok`: whether the semantic operation was accepted.
- `cursor_session_id`: reserved virtual cursor session ID.
- `journal`: operation journal summary.
- `error`: structured failure detail.

`before_llm.py` injects the current page operation book from runtime context, not graph state. `after_llm.py` validates the LLM command list and emits a `virtual_ui_operation` activity event for the frontend runtime to execute. Page routing is observed from the real UI after the operation, not returned as Skill state.

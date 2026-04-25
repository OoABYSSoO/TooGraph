---
name: TooGraph 页面操作器
description: Execute one semantic app-page operation through Buddy's virtual cursor without exposing DOM selectors or screen coordinates to the LLM.
---

# TooGraph 页面操作器

This official Skill validates one semantic page operation and asks TooGraph's app-native virtual operator layer to play the operation through Buddy's virtual cursor.

Current phase:

- Supports one operation per invocation.
- Supports application navigation clicks only.
- Supports `click_nav` target `runs`.
- Rejects Buddy self surfaces such as the Buddy page, Buddy floating window, Buddy avatar, and debug controls.
- Does not expose DOM selectors, screen coordinates, or low-level mouse trajectories to the LLM.

State inputs:

- `page_path`: current application route.
- `user_goal`: optional user goal for the desired page operation.
- `page_context`: optional page content summary. Partner-related content is filtered before the LLM sees the operation book.

LLM parameters:

- `action`: semantic action. Current phase supports `click_nav`.
- `target`: semantic target. Current phase supports `runs` and its aliases.
- `cursor_lifecycle`: optional virtual cursor lifecycle, such as `return_after_step`.

State outputs:

- `ok`: whether the semantic operation was accepted.
- `next_page_path`: expected route after the operation.
- `cursor_session_id`: reserved virtual cursor session ID.
- `journal`: operation journal summary.
- `error`: structured failure detail.

`before_llm.py` injects the current page operation book. `after_llm.py` validates the LLM command, returns the expected next page path, and emits a `virtual_ui_operation` activity event for the frontend runtime to execute.

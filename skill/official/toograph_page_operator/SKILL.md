# TooGraph Page Operator

This official Skill validates one semantic page operation and asks TooGraph's app-native virtual operator layer to play the operation through Buddy's virtual cursor.

Current phase:

- Supports one operation per invocation.
- Supports application navigation clicks only.
- Supports `click_nav` target `runs`.
- Rejects Buddy self surfaces such as the Buddy page, Buddy floating window, Buddy avatar, and debug controls.
- Does not expose DOM selectors, screen coordinates, or low-level mouse trajectories to the LLM.

`before_llm.py` injects the current page operation book. `after_llm.py` validates the LLM command, returns the expected next page path, and emits a `virtual_ui_operation` activity event for the frontend runtime to execute.

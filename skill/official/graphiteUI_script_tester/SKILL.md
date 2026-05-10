---
name: graphiteUI_script_tester
description: Use when a graph needs to generate deterministic tests for a provided local script and run them with an allowed system command.
---

# GraphiteUI Script Tester

Use this skill when the graph has a script or generated script source and needs tests written and executed in a temporary workspace.

`before_llm.py` injects current system context, including OS, Python executable/version, and available allowed commands. If a graph state value is a readable local file path string, `before_llm.py` also appends that file's text content to the context. The LLM uses that context to produce a complete test workspace and one command to run.

Inputs:

- `files`: JSON array of `{ "path": "...", "content": "..." }`. Include the target script, generated tests, and any minimal helper/config files.
- `command`: JSON command argument array, such as `["python", "-m", "pytest", "-q", "test_target.py"]` or `["node", "--test", "test.mjs"]`.

Outputs:

- `success`: Boolean indicating whether the test command exited with code 0.
- `result`: Markdown result containing command, exit code, duration, stdout, stderr, or validation errors.

The runtime writes only inside a temporary directory, validates file paths, and runs only allowlisted commands. The provided code still executes in the local system environment. In `需确认` mode, this capability should be approved before running generated or untrusted scripts; in `完全访问` mode, the graph may run it without an extra prompt.

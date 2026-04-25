---
name: TooGraph 脚本测试器
description: Use when a graph needs to generate deterministic tests for a provided local script and run them with an allowed system command.
---

# TooGraph 脚本测试器

Use this skill when the graph has a script or generated script source and needs tests written and executed in a temporary workspace.

`before_llm.py` injects current system context, including OS, Python executable/version, and available allowed commands. If a graph state value is a readable local file path string, `before_llm.py` also appends that file's text content to the context. The LLM uses that context to produce a complete test workspace and one command to run.

State inputs:

- `script_requirement`: expected behavior, edge cases, and success criteria.
- `script_path`: optional readable local script path.
- `script_source`: optional script source text when no path is available.

LLM parameters:

- `files`: JSON array of `{ "path": "...", "content": "..." }`. Include the target script, generated tests, and any minimal helper/config files.
- `command`: JSON command argument array, such as `["python", "-m", "pytest", "-q", "test_target.py"]` or `["node", "--test", "test.mjs"]`.

State outputs:

- `success`: Boolean indicating whether the test command exited with code 0.
- `result`: Markdown result containing command, exit code, duration, stdout, stderr, or validation errors.

The runtime writes only inside a temporary directory, validates file paths, and runs only allowlisted commands. The provided code still executes in the local system environment. This Skill declares file-write and subprocess capability; `需确认` mode pauses before executing generated or untrusted scripts and `完全访问` mode can run them without an extra prompt.

---
name: graphiteUI_script_tester
description: Generate pytest tests for a provided Python script, run them in a temporary workspace, and return structured results and errors.
---

# GraphiteUI Script Tester

Use this skill when the graph has a Python script and the user wants tests written and executed for it.

The LLM prepares the script and pytest test file. The runtime then writes both files into a temporary directory, runs `python -m pytest -q <test_filename>`, and returns the raw result.

Inputs:

- `script_filename`: Python script filename. Defaults to `target.py`.
- `script_source`: Complete Python source under test.
- `test_filename`: Pytest filename. Defaults to `test_target.py`.
- `test_source`: Complete pytest source to run.

Outputs:

- `status`: `succeeded` or `failed`.
- `summary`: Markdown summary of the run.
- `test_source`: The test code that was actually executed.
- `stdout`: Pytest stdout.
- `stderr`: Pytest stderr.
- `exit_code`: Test process exit code.
- `errors`: Structured error list.

The skill is intentionally explicit about execution. It writes only to a temporary directory, but the provided Python code still runs in the local Python process environment without an OS sandbox. Use approval for untrusted scripts.

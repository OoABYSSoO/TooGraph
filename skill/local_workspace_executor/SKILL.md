---
name: local_workspace_executor
description: Execute policy-limited local workspace file operations and scripts for GraphiteUI graph runs.
---

Use this skill when a graph needs to read workspace files, write user-owned local artifacts, generate user custom skills, or run local tests/scripts.

Default behavior:
- Read access is broad inside the GraphiteUI workspace, except protected paths.
- Write access is limited to `backend/data` and excludes protected settings/security paths.
- Command/script execution is limited to `backend/data/skills/user` and `backend/data/tmp`.
- If an operation is blocked, return the blocked path and suggested policy update for user review.
- Subprocess execution is not an OS-level sandbox. The skill preflights command, working directory, and script paths, and blocks inline execution such as `python -c` or `bash -c`.

Inputs:
- `action`: `read_file`, `write_file`, `list_dir`, `delete_path`, `run_command`, or `run_script`.
- `path`: relative target path for file, directory, or script actions.
- `content`: text payload for `write_file`.
- `cwd`: relative working directory for command/script execution.
- `command`: command array for `run_command`.
- `timeout_seconds`: optional timeout.

Outputs include `status`, stdout/stderr for commands, changed/read paths, policy decisions, and blocked-path details.

Do not use this skill to bypass policy. When blocked, ask the user whether to add the suggested root to the local executor whitelist.

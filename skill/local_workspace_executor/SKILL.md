---
name: local_workspace_executor
description: Read, write, and execute files inside GraphiteUI's local workspace permission boundaries.
---

# Local Workspace Executor

Use this skill when a graph needs an explicit local workspace operation: read a file, list a directory, write text under `backend/data`, append text under `backend/data`, or execute a script under the execution whitelist.

Supported actions:

- `read`: read a UTF-8 text file.
- `list`: list one directory.
- `write`: overwrite a text file under `backend/data`.
- `append`: append text to a file under `backend/data`.
- `execute`: run a script file under `backend/data/tmp` or `backend/data/skills/user`.

Default policy:

- Read roots: `backend/data`, `skill`, `docs`, `README.md`, `AGENTS.md`.
- Write roots: `backend/data`.
- Execute roots: `backend/data/tmp`, `backend/data/skills/user`.
- Denied roots: `.git`, `.env`, `backend/data/settings`.
- Execute extensions: `.py`, `.js`, `.mjs`, `.sh`, `.bat`, `.ps1`.

The skill does not grant itself more permissions. If an operation is outside policy, it returns `status=failed` with a `permission_denied` error.

Execution is not an OS sandbox. It is constrained by path policy before launch, but the launched script still runs as a local process, so this skill requires approval.

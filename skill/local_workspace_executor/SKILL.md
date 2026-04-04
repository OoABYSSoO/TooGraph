---
name: local_workspace_executor
description: Read context, write one file, or execute one script inside GraphiteUI's local workspace permission boundaries.
---

# Local Workspace Executor

Use this skill when a graph needs one explicit local workspace operation on one file path.

The LLM node generates only these skill input fields:

- `path`: repository-relative file path.
- `operation`: `read`, `write`, or `execute`.
- `content`: required only when `operation` is `write`; it must be the complete final file content.

The skill returns only:

- `success`: whether the operation succeeded.
- `result`: the successful output or failure detail.

## Pre-LLM Read Context

`before_llm.py` reads existing repository files referenced by the graph state or node task instruction before the LLM plans the skill input. This works for ordinary repository paths, not only skill artifacts.

Read context is intentionally broad enough for editing workflows, but it still refuses denied roots:

- `.git`
- `.env`
- `backend/data/settings`

If a referenced path does not exist, the pre-read context says that only `write` can create it. `read` and `execute` will fail for missing files.

## Runtime Operations

Supported operations:

- `read`: reads one UTF-8 text file and returns its content in `result`.
- `write`: creates or overwrites one UTF-8 text file under `backend/data`.
- `execute`: runs one script under `backend/data/tmp` or `backend/data/skills/user`.

Default policy:

- Read roots: any path inside the GraphiteUI repository except denied roots.
- Write roots: `backend/data`.
- Execute roots: `backend/data/tmp`, `backend/data/skills/user`.
- Execute extensions: `.py`, `.js`, `.mjs`, `.sh`, `.bat`, `.ps1`.

Execution is not an OS sandbox. It is constrained by path policy before launch, but the launched script still runs as a local process, so this skill requires approval.

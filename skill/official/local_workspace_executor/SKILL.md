---
name: 本地工作区执行器
description: Read, list, search, write one file, or execute one script inside TooGraph's local workspace permission boundaries.
---

# 本地工作区执行器

Use this skill when a graph needs one explicit local workspace operation on one repository path.

State inputs:

- `workspace_request`: the user's or upstream graph node's local workspace goal.
- `target_path`: optional repository-relative path for the requested operation.
- `workspace_context`: optional extra constraints, snippets, or desired result notes.

The LLM node generates only this structured LLM output:

- `path`: repository-relative file path.
- `operation`: `read`, `list`, `search`, `write`, or `execute`.
- `content`: required only when `operation` is `write`; it must be the complete final file content.
- `query`: required only when `operation` is `search`; it must be the text to search for.

The skill exposes these state outputs:

- `success`: whether the operation succeeded.
- `result`: the successful output or failure detail.

## Pre-LLM Read Context

`before_llm.py` may read existing repository files only when the TooGraph runtime passes explicit path hints in `runtime_context`. It does not inspect graph state to discover paths.

Read context is intentionally broad enough for editing workflows, but it still refuses denied roots:

- `.git`
- `.env`
- `backend/data/settings`

If a referenced path does not exist, the pre-read context says that only `write` can create it. `read` and `execute` will fail for missing files.

## Runtime Operations

Supported operations:

- `read`: reads one UTF-8 text file and returns its content in `result`.
- `list`: lists readable text files below one path and returns skipped-entry counts.
- `search`: searches readable text files below one path for `query` and returns matching lines plus skipped-entry counts.
- `write`: creates or overwrites one UTF-8 text file under `backend/data`, `skill/user`, `graph_template/user`, or `node_preset/user`.
- `execute`: runs one script under `backend/data/tmp` or `skill/user`.

Default policy:

- Read roots: any path inside the TooGraph repository except denied roots.
- Write roots: `backend/data`, `skill/user`, `graph_template/user`, `node_preset/user`.
- Execute roots: `backend/data/tmp`, `skill/user`.
- Execute extensions: `.py`, `.js`, `.mjs`, `.sh`, `.bat`, `.ps1`.

Execution is not an OS sandbox. It is constrained by path policy before launch, but the launched script still runs as a local process. This Skill declares file-write and subprocess capability; the current runtime approval gate is skill-level, so `需确认` mode can pause before invoking this Skill even when the generated operation is read-only. `完全访问` mode can run it without an extra prompt.

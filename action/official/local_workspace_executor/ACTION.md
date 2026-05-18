---
name: 本地工作区执行器
description: Read, list, search, edit, write one file, or execute one script inside TooGraph's local workspace permission boundaries.
---

# 本地工作区执行器

Use this action when a graph needs one explicit local workspace operation on one repository path.

State inputs:

- `workspace_request`: the user's or upstream graph node's local workspace goal.

The LLM node generates only this structured LLM output:

- `path`: repository-relative file path.
- `operation`: `read`, `list`, `search`, `edit`, `write`, or `execute`.
- `content`: complete final file content for `write`; return an empty string for other operations.
- `query`: search text for `search`; return an empty string for other operations.
- `old_string`: exact existing text for `edit`; return an empty string for other operations.
- `new_string`: replacement text for `edit`; may be empty when deleting text.
- `replace_all`: boolean for `edit`; use `true` only when every match should be replaced.
- `expected_sha256`: SHA-256 from the pre-read snapshot when editing or overwriting an existing file.
- `expected_mtime_ns`: mtime in nanoseconds from the pre-read snapshot when editing or overwriting an existing file.
- `args`: JSON array of arguments for `execute`; return an empty array when no arguments are needed.

The action exposes these state outputs:

- `success`: whether the operation succeeded.
- `result`: the successful output or failure detail.

## Pre-LLM Read Context

`before_llm.py` may read existing repository files only when the TooGraph runtime passes explicit path hints in `runtime_context`. It does not inspect graph state to discover paths.

Read context is intentionally broad enough for editing workflows, but it still refuses denied roots:

- `.git`
- `.env`
- `backend/data/settings`

For each pre-read file, the context includes `sha256` and `mtime_ns`. `edit` and overwriting `write` must echo those values back as `expected_sha256` and `expected_mtime_ns`; if the file changed after pre-read, the runtime refuses the mutation with `stale_file`.

If a referenced path does not exist, the pre-read context says that only `write` can create it. `read`, `edit`, and `execute` will fail for missing files.

## Runtime Operations

Supported operations:

- `read`: reads one UTF-8 text file and returns its content in `result`.
- `list`: lists readable text files below one path and returns skipped-entry counts.
- `search`: searches readable text files below one path for `query` and returns matching lines plus skipped-entry counts.
- `edit`: replaces `old_string` with `new_string` in one existing UTF-8 text file under `backend/data`, `action/user`, `graph_template/user`, or `node_preset/user`.
- `write`: creates one UTF-8 text file or overwrites one existing UTF-8 text file under `backend/data`, `action/user`, `graph_template/user`, or `node_preset/user`.
- `execute`: runs one script under `backend/data/tmp` or `action/user`, with optional `args`.

Mutation rules:

- `edit` refuses missing files, binary files, missing snapshots, stale snapshots, missing `old_string`, and non-unique matches when `replace_all` is false.
- `write` may create a new file without a snapshot.
- `write` must include `expected_sha256` and `expected_mtime_ns` when overwriting an existing file.
- Successful `edit` and overwriting `write` include old/new hashes, old/new mtime values, line counts, and a unified patch in activity event detail.

Default policy:

- Read roots: any path inside the TooGraph repository except denied roots.
- Write roots: `backend/data`, `action/user`, `graph_template/user`, `node_preset/user`.
- Execute roots: `backend/data/tmp`, `action/user`.
- Execute extensions: `.py`, `.js`, `.mjs`, `.sh`, `.bat`, `.ps1`.

Execution is not an OS sandbox. It is constrained by path policy before launch, but the launched script still runs as a local process. This Action declares file-write and subprocess capability; the current runtime approval gate is action-level, so `需确认` mode can pause before invoking this Action even when the generated operation is read-only. `完全访问` mode can run it without an extra prompt.

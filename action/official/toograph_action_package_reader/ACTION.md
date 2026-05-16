---
name: Action Package Reader
description: Read an existing TooGraph Action package for improvement workflows.
---

# Action Package Reader

This action is a read-only package loader for TooGraph Action improvement workflows.

Inputs:

- `target_action_key`: existing Action key from graph state.
- `action_key`: Action key prepared by the LLM.
- `source_scope`: optional `user` or `official`; empty means user first, then official.

Outputs:

- `success`: true when a package was found and read.
- `action_package`: package metadata and UTF-8 file contents.
- `result`: short summary or validation error.

The action never writes files, executes scripts, reads runtime artifacts, or returns virtual environments, cache files, or bytecode.

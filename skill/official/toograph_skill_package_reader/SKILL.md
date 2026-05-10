---
name: Skill Package Reader
description: Read an existing TooGraph Skill package for improvement workflows.
---

# Skill Package Reader

This skill is a read-only package loader for TooGraph Skill improvement workflows.

Inputs:

- `target_skill_key`: existing Skill key from graph state.
- `skill_key`: Skill key prepared by the LLM.
- `source_scope`: optional `user` or `official`; empty means user first, then official.

Outputs:

- `success`: true when a package was found and read.
- `skill_package`: package metadata and UTF-8 file contents.
- `result`: short summary or validation error.

The skill never writes files, executes scripts, reads runtime artifacts, or returns virtual environments, cache files, or bytecode.

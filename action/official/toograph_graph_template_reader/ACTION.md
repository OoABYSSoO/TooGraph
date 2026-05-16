---
name: 图模板读取器
description: Read one official or user TooGraph graph template package for review or improvement workflows.
---

# 图模板读取器

Use this Action when a graph workflow needs read-only access to one existing TooGraph graph template.

Inputs:

- `template_id`: the graph template id to read.
- `source_scope`: optional `user` or `official`. Empty means user first, then official.

Outputs:

- `success`: whether a template was found and read.
- `template_package`: `{ template_id, source_scope, template_path, template_json, size_chars }`.
- `result`: concise read summary or failure reason.

This Action never writes files, edits settings, executes scripts, or reads runtime artifacts.

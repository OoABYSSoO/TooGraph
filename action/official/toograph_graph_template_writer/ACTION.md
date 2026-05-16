---
name: 图模板写入器
description: Validate and write one TooGraph user graph template with a recoverable revision artifact.
---

# 图模板写入器

Use this Skill only after a graph workflow has generated, previewed, and validated a full graph template JSON payload.

Input:

- `template_json`: complete `template.json`.
- `reason`: short audit reason.

Outputs:

- `success`
- `result`
- `template_id`
- `template_path`
- `revision_id`

Safety behavior:

- Writes only `graph_template/user/<template_id>/template.json`.
- Rejects path traversal and template IDs outside `[a-z][a-z0-9_]{2,80}`.
- Rejects writes that would collide with an official template ID.
- Runs node-system, graph validator, and LangGraph runtime compatibility checks before writing.
- Records a recoverable revision artifact under `backend/data/template_revisions/<template_id>/<revision_id>.json`.

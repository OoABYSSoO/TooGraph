---
name: 图模板校验器
description: Validate one generated TooGraph graph template JSON payload against node_system and runtime compatibility.
---

# 图模板校验器

Use this Action before any workflow writes or test-runs a generated graph template.

Input:

- `template_json`: a full `template.json` object.

Outputs:

- `success`: true only when the template passes Pydantic protocol validation, graph validation, and LangGraph runtime support checks.
- `validation_report`: includes `valid`, `template_id`, counts, graph validation issues, runtime unsupported reasons, and parse errors when present.

This Action is read-only and does not repair or write templates.

---
name: TooGraph 能力选择器
description: Use when a TooGraph workflow needs the fixed page-operation subgraph capability.
---

# TooGraph 能力选择器

This Action is intentionally constrained. It does not build a catalog, ask the LLM to rank candidates, validate a selected key, or return audit metadata.

State outputs:

- `capability`: always `{ "kind": "subgraph", "key": "toograph_page_operation_workflow" }`.
- `found`: always `true`.

---
name: graphiteui_capability_selector
description: Use when a GraphiteUI workflow needs to choose one enabled graph template or Skill from a user requirement.
---

# GraphiteUI Capability Selector

This Skill reads the local GraphiteUI capability catalog and returns exactly one capability object.

Selection rules:

- Only enabled capabilities are considered.
- Graph templates are preferred over Skills when both match the requirement.
- Skill candidates must be selectable for the requested origin through `capabilityPolicy`.
- The selector does not call an LLM and does not invent capabilities.
- Saved ordinary graphs are not candidates; reusable graph capabilities come from templates.

The `capability` output is suitable for a `capability` state:

```json
{ "kind": "subgraph", "key": "advanced_web_research_loop", "name": "高级联网搜索" }
```

or:

```json
{ "kind": "skill", "key": "web_search", "name": "联网搜索" }
```

When no candidate is good enough, the Skill returns `{ "kind": "none" }`.

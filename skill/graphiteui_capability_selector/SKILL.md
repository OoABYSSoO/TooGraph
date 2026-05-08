---
name: graphiteui_capability_selector
description: Use when a GraphiteUI workflow needs to choose one enabled graph template or Skill from a user requirement.
---

# GraphiteUI Capability Selector

`before_llm.py` lists the local enabled graph templates and selectable Skills in the LLM-node skill-input planning prompt. The model chooses one item from that catalog and passes it as the `capability` input. `after_llm.py` validates that choice against the current local catalog and returns exactly one normalized capability object.

Selection rules:

- Only enabled capabilities are listed for the model.
- Graph templates are preferred over Skills when both can satisfy the requirement.
- Skill candidates must be selectable for the requested origin through `capabilityPolicy`.
- The selector does not call an LLM, run text matching, or invent capabilities.
- Saved ordinary graphs are not candidates; reusable graph capabilities come from templates.
- `capability_catalog.py` is shared by the lifecycle scripts and only reads local manifests and template records.

The `capability` output is suitable for a `capability` state:

```json
{ "kind": "subgraph", "key": "advanced_web_research_loop", "name": "高级联网搜索" }
```

or:

```json
{ "kind": "skill", "key": "web_search", "name": "联网搜索" }
```

When the model chooses none or the selected key is not currently available, the Skill returns `{ "kind": "none" }`.

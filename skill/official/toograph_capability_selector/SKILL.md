---
name: TooGraph 能力选择器
description: Use when a TooGraph workflow needs to choose one enabled graph template or Skill from a user requirement.
---

# TooGraph 能力选择器

`before_llm.py` lists the local enabled graph templates and enabled Skills in the LLM-node Skill LLM output planning prompt. The model chooses one item from that catalog and passes it as the `capability` input. `after_llm.py` validates that choice against the current local catalog and returns exactly one normalized capability object.

State inputs:

- `requirement`: original user or workflow requirement.

Runtime context:

- `origin`: optional capability-selection origin, such as `buddy`.

LLM output:

- `requirement`: the requirement used for audit continuity.
- `origin`: optional origin defaulted by the model from runtime context, or omitted to use `buddy`.
- `capability`: the single selected capability object.
- `selection_reason`: concise reason for the selected item or for selecting none.
- `rejected_candidates`: optional short list of rejected candidates and reasons.

State outputs:

- `capability`: normalized single capability object.
- `found`: boolean branch flag.
- `audit`: candidate and selection audit summary.

Selection rules:

- Only enabled capabilities are listed for the model.
- Graph templates are preferred over Skills when both can satisfy the requirement.
- Skill candidates are available when they are enabled in `skill/settings.json`.
- The selector does not call an LLM, run text matching, or invent capabilities.
- Saved ordinary graphs are not candidates; reusable graph capabilities come from templates.
- `capability_catalog.py` is shared by the lifecycle scripts and only reads local manifests and template records.

The `found` output is a boolean for downstream branch decisions. It is `true` only when the selected item is still enabled and available, and `false` when the model chooses none or the choice is invalid.

The `capability` output is suitable for a `capability` state:

```json
{ "kind": "subgraph", "key": "advanced_web_research_loop", "name": "高级联网搜索" }
```

or:

```json
{ "kind": "skill", "key": "web_search", "name": "联网搜索" }
```

When the model chooses none or the selected key is not currently available, the Skill returns `found=false` and `{ "kind": "none" }`.

---
name: TooGraph 能力选择器
description: Use when a TooGraph workflow needs to select one explicit Action, Subgraph, Tool, or none capability from discovered candidates.
---

# TooGraph 能力选择器

This Action selects one mutually exclusive capability from the `capability_candidates`
package produced by context fanout or another catalog reader. It is a deterministic
selector over the candidate metadata; it does not execute the selected capability.

State outputs:

- `capability`: one object with `kind` equal to `action`, `subgraph`, `tool`, or `none`.
- `found`: `true` only when an executable candidate is selected.

Selection rules:

- Explicit page, UI, button, navigation, current-graph, or graph-edit requests prefer
  `toograph_page_operation_workflow` when that subgraph is available.
- Research, latest-news, web, search, and investigation requests prefer matching
  research/news candidates such as `advanced_web_research_loop`.
- If no candidate scores above zero, the output is `{ "kind": "none", "reason": "..." }`.

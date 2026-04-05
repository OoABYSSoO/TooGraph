---
name: buddy_home_context_reader
description: Read the GraphiteUI Buddy Home into one compact context pack for buddy graph loops.
---

# Buddy Home Context Reader

Use this skill when a buddy graph needs the current Buddy Home context.

The skill reads:

- `backend/data/buddy/profile.json`
- `backend/data/buddy/policy.json`
- `backend/data/buddy/memories.json`
- `backend/data/buddy/session_summary.json`

The skill returns only:

- `context_pack`: a JSON object containing `profile`, `policy`, enabled `memories`, `session_summary`, and `meta`.

This is a read-only support skill. It does not write profile, policy, memories, summaries, revisions, command logs, usage notes, or evolution reports.

The skill is intentionally not dynamically selectable by `graphiteui_capability_selector`. Buddy templates should bind it explicitly in a context-packing node.

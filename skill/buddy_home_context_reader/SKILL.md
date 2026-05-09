---
name: buddy_home_context_reader
description: Read the GraphiteUI Buddy Home into one compact context pack for buddy graph loops.
---

# Buddy Home Context Reader

Use this skill when a buddy graph needs the current Buddy Home context.

The skill reads:

- `buddy_home/profile.json`
- `buddy_home/policy.json`
- `buddy_home/memories.json`
- `buddy_home/session_summary.json`

If Buddy Home or any default file is missing, the runtime creates it from the current program defaults before reading.

The skill returns only:

- `context_pack`: a JSON object containing `profile`, `policy`, enabled `memories`, `session_summary`, and `meta`.

This is a read-only support skill. It reads long-term Buddy Home data, but it does not modify profile, policy, memories, summaries, revisions, command logs, usage notes, or evolution reports.

The skill is intentionally not dynamically selectable by `graphiteui_capability_selector`. Buddy templates should bind it explicitly in a context-packing node.

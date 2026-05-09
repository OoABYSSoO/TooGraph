---
name: buddy_home_context_reader
description: Read the GraphiteUI Buddy Home into one compact context pack for buddy graph loops.
---

# Buddy Home Context Reader

Use this skill when a buddy graph needs the current Buddy Home context.

The skill reads:

- `buddy_home/AGENTS.md`
- `buddy_home/SOUL.md`
- `buddy_home/USER.md`
- `buddy_home/MEMORY.md`
- `buddy_home/policy.json`
- `buddy_home/buddy.db`

If Buddy Home or any default file is missing, the runtime creates it from the current program defaults before reading.

The skill returns only:

- `context_pack`: a JSON object containing `profile`, `policy`, `home_instructions`, `user_profile`, `memory_markdown`, enabled structured `memories`, `session_summary`, and `meta`.

This is a read-only support skill. It reads long-term Buddy Home data, but it does not modify SOUL, USER, MEMORY, policy, database rows, command records, revisions, or reports.

The skill is intentionally not dynamically selectable by `graphiteui_capability_selector`. Buddy templates should bind it explicitly in a context-packing node.

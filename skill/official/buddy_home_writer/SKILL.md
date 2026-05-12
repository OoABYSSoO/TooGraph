---
name: Buddy Home Writer
description: Internal controlled Buddy Home writer that applies safe command-based memory, session summary, profile, and policy updates with revision records.
---

# Buddy Home Writer

This is an internal TooGraph Skill used by Buddy autonomous review templates.

It does not write files directly. It validates a small command list and calls the existing Buddy command/store path so every applied change creates a command record and revision.

Allowed actions:

- `memory.create`
- `memory.update`
- `memory.delete`
- `session_summary.update`
- `profile.update`
- `policy.update`

Safety boundary:

- Do not use this Skill for arbitrary file writes, script execution, graph patches, revision restore, or permission escalation.
- `policy.update` cannot modify `graph_permission_mode` or `behavior_boundaries`.
- Unsupported or unsafe commands are skipped and returned in `skipped_commands`.

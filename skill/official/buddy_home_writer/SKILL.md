---
name: Buddy Home Writer
description: Internal controlled Buddy Home writer that applies safe command-based memory, session summary, profile, policy, and report updates with revision records.
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
- `report.create`
- `capability_usage_stats.update`

Safety boundary:

- Do not use this Skill for arbitrary file writes, script execution, graph patches, revision restore, or permission escalation.
- `policy.update` is limited to `communication_preferences`.
- `policy.update` cannot modify `graph_permission_mode`, `behavior_boundaries`, or undeclared policy fields.
- Unsupported or unsafe commands are skipped and returned in `skipped_commands`.
- `report.create` writes a concise Markdown report under `buddy_home/reports/` through the command/revision path. It must not store full logs, secrets, or large transient output.
- `capability_usage_stats.update` updates aggregate usage counters for capabilities that actually ran in the source run. Payloads can provide one entry or an `entries` array with `capability.kind`, `capability.key`, optional `capability.name`, `success`, `run_id`, `summary`, and optional `duration_ms`.

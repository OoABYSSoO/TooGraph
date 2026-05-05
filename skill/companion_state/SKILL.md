# Companion State Skill

This skill owns the graph-executed companion state loop:

- `load_context` reads local companion profile, policy, memories, and session summary, then returns prompt-ready sections for the chat agent.
- `curate_turn` evaluates a completed companion turn and updates local companion files when the message contains durable profile, policy, or memory information.

The package is self-contained. It does not require backend route changes for automatic memory updates. The user-facing Companion settings page may still edit the same local files directly.

All media or downloaded resources referenced by a companion conversation should stay as local paths or compact metadata. Do not store raw media payloads in companion memory.

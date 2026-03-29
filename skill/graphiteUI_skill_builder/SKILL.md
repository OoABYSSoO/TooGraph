---
name: graphiteUI_skill_builder
description: Use when a GraphiteUI graph needs to build, validate, test, revise, or roll back user-created Skill packages.
---

Use this skill from graph templates that create or repair user custom Skills.

Boundaries:
- Writes only user Skill packages under `backend/data/skills/user/<skill_key>`.
- Treats official packages under `skill/<skill_key>` as read-only and rejects key collisions.
- Creates package revisions under `backend/data/skills/revisions/<skill_key>/` before overwrites, patches, and rollbacks.
- Runs smoke tests as local subprocesses. This is not an OS-level sandbox.

Actions:
- `inspect_existing_skills`: summarize official and user Skills.
- `validate_skill_package`: check a package's manifest, docs, runtime entrypoint, and basic Python syntax.
- `write_skill_package`: replace or create a user Skill package, then run a smoke test.
- `apply_skill_patch`: patch an existing user Skill package, then run a smoke test.
- `run_skill_smoke_test`: run the package entrypoint with `smoke_input` and validate required outputs.
- `rollback_skill_revision`: restore a previous package revision.
- `get_skill_revision`: list or read saved revisions.

When a result fails, downstream LLM nodes should inspect `validation_errors`, `smoke_test`, `stdout`, `stderr`, `errors`, and `builder_result`, then generate corrected full package files before retrying.

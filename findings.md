# Findings & Decisions

## Requirements
- Continue the native Skill refactor implementation.
- Preserve the product direction already discussed: native GraphiteUI Skill packages, manual upload/import, explicit Agent node usage, future Companion loadouts, and no default external auto-discovery.
- Commit and push completed work when the slice is verified.

## Research Findings
- `docs/future/2026-04-27-native-skill-system.md` defines Skill as a native, installable, diagnosable, permissioned ability package with `skill.json` as the machine-readable truth source and `SKILL.md` as model-facing guidance/compatibility material.
- The same doc recommends workflow-first Skill design, Agent node explicit references, manual import, visible installed/enabled/configured/runtimeReady/healthy states, and later Run Detail Skill call records.
- `docs/future/2026-04-27-skill-product-taxonomy.md` keeps `Skill / 技能` as the unified product term and uses `targets`, `kind`, `mode`, and `scope` to distinguish Agent node Skills, Companion Skills, Shared Skills, atomic/workflow/profile/context abilities, and runtime behavior.
- The previous implementation plan `docs/superpowers/plans/2026-04-27-native-skill-foundation.md` says the merged foundation already added native `skill.json` upload/import, stopped default external discovery, extended catalog metadata, and updated Skill management filters/status display.
- Repository status was clean before starting this continuation task.
- Backend catalog/import code already supports native `skill/graphite/<key>/skill.json`, legacy managed `skill/claude_code/<key>/SKILL.md`, upload by zip/folder, and intentionally returns no external auto-discovered records.
- Runtime registration is still driven by hard-coded Python functions in `backend/app/skills/registry.py`; only managed Skill keys that match these runtime keys are runnable.
- Agent node config is still `skills: list[str]` in both backend and frontend schemas. Validator/runtime/compiler all iterate raw strings.
- Agent Skill picker currently receives `/api/skills/definitions`, which is active/runtime-registered by default, but the frontend picker itself only removes already-attached keys. It does not enforce `targets.includes("agent_node")`, `configured`, `healthy`, or explain why a Skill is unavailable.
- Backend validation only checks whether an attached Skill key is runtime-registered. It does not yet validate target suitability, manifest health/configuration, or structured mode/trigger/config references.
- Implemented slice: the five built-in runtime Skills now have native GraphiteUI manifests, `/api/skills/definitions` returns only active/configured/healthy/runtime-registered Agent-node Skills, graph validation reports non-attachable Agent Skill references, and the Agent picker mirrors the same eligibility rule.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Inspect implementation before selecting the next slice | The foundation branch was merged externally, so local code is authoritative for what remains. |
| Prefer tests around the missing end-to-end contract | Skill behavior touches persistence, UI filtering, and Agent node configuration, so regressions are likely without tests. |
| Implement Agent attachability before structured Skill references | The current graph schema still stores `skills: list[str]`; filtering and validation can improve safety immediately without forcing a broad graph migration. |
| Add native manifests for existing runtime Skills without deleting legacy `SKILL.md` packages | Native `skill.json` becomes the catalog truth while legacy files remain useful as model-facing documentation and compatibility material. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Candidate Next Slices
- Agent node Skill binding polish: add structured Skill references with mode/trigger/config while preserving legacy `skills: string[]` graph compatibility.
- Skill manifest validation/diagnostics: add validate/install split, conflict preview, and richer import errors.
- Skill usage visibility: show which graphs/nodes reference a Skill from the management page.
- Companion loadout foundation: add data model and settings UI for future desktop pet Skill usage without granting broad permissions by default.
- Skill execution observability: show actual Skill invocations, inputs, outputs, timing, errors, and artifacts in Run Detail.

## Visual/Browser Findings
- Dev server restarted on `http://127.0.0.1:3477`; frontend and `/api/skills/catalog` returned HTTP 200.
- `/api/skills/definitions` returned 5 Agent-attachable built-in Skills, all from `graphite_definition`.
- Playwright is not installed in this repository, so no browser screenshot was captured for this small picker-copy/metadata change.

# Native Skill Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production slice of GraphiteUI's native Skill system: native `skill.json` packages, manual upload/import, no default external auto-discovery, and management-page metadata that distinguishes agent-node and companion Skill usage.

**Architecture:** Keep the current Skill API surface stable while extending the catalog model. Managed Skills can come from legacy `skill/claude_code/<key>/SKILL.md` or native `skill/graphite/<key>/skill.json`. External runtime directories are not auto-discovered in the catalog. Upload import accepts either native `skill.json` packages or legacy `SKILL.md` packages and stores them under the matching managed root.

**Tech Stack:** FastAPI, Pydantic, YAML frontmatter parsing, JSON manifests, Vue 3, Element Plus, Node built-in test runner, pytest.

---

## Task 1: Add Failing Backend Coverage

- [x] Extend `backend/tests/test_skill_upload_import_routes.py` with a native `skill.json` upload case.
- [x] Assert the native upload lands in `skill/graphite/<skillKey>/skill.json`.
- [x] Assert catalog payload includes `targets`, `kind`, `mode`, `scope`, `permissions`, `runtimeReady`, `configured`, and `healthy`.
- [x] Add a catalog test showing `skill/openclaw/*/SKILL.md` is not listed by default.
- [x] Run `PYTHONPATH=backend python -m pytest backend/tests/test_skill_upload_import_routes.py` and confirm the new tests fail for the expected missing behavior.

## Task 2: Implement Native Manifest Catalog Semantics

- [x] Extend `backend/app/core/schemas/skills.py` with native product taxonomy fields while preserving existing response fields.
- [x] Update `backend/app/core/storage/skill_store.py` so managed keys include both native Graphite packages and legacy Claude-Code packages.
- [x] Update upload import detection to prefer `skill.json`, derive the key from `skillKey`, and copy native packages into `skill/graphite/<key>`.
- [x] Keep legacy `SKILL.md` upload import compatible under `skill/claude_code/<key>`.
- [x] Update `backend/app/skills/definitions.py` to parse native `skill.json` and legacy `SKILL.md`.
- [x] Stop default external auto-discovery by returning an empty external registry unless a future explicit import source is introduced.
- [x] Set runtime readiness separately from current `runtimeRegistered`: `runtimeReady` means GraphiteUI has a runtime handler for the key; `runtimeRegistered` still means handler plus managed active status.

## Task 3: Add Failing Frontend Coverage

- [x] Extend `frontend/src/types/skills.ts` to describe the new catalog fields.
- [x] Update `frontend/src/pages/skillsPageModel.test.ts` to cover agent, companion, runtime-ready, and attention filters.
- [x] Update API fixtures in `frontend/src/api/skills.test.ts` with the new fields.
- [x] Update `frontend/src/pages/SkillsPage.structure.test.ts` to assert the management page renders native taxonomy metadata.
- [x] Run `node --test frontend/src/api/skills.test.ts frontend/src/pages/skillsPageModel.test.ts frontend/src/pages/SkillsPage.structure.test.ts` and confirm the new tests fail for the expected missing UI/model behavior.

## Task 4: Update Skill Management UI

- [x] Replace the old importable/manageable overview slot with product-facing counts: agent node Skills, companion Skills, runtime-ready Skills, and attention-needed Skills.
- [x] Add filter tabs for `agent`, `companion`, `runtime`, and `attention`.
- [x] Display each Skill's targets, kind, mode, scope, permissions, runtime readiness, configuration, health, and source.
- [x] Keep existing actions for upload/import, enable/disable, and delete.
- [x] Update Chinese and English i18n strings in `frontend/src/i18n/messages.ts`.

## Task 5: Verify and Finish

- [x] Run backend targeted tests:
  `PYTHONPATH=backend python -m pytest backend/tests/test_skill_upload_import_routes.py`
- [x] Run frontend targeted tests:
  `node --test frontend/src/api/skills.test.ts frontend/src/pages/skillsPageModel.test.ts frontend/src/pages/SkillsPage.structure.test.ts`
- [x] Run `git status -sb` and inspect changed files.
- [x] Restart the dev environment with `npm run dev` from the worktree after code changes.
- [x] Commit with a Chinese commit message.
- [x] Push `codex/native-skill-system`.

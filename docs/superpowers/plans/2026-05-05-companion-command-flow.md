# Companion Command Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Companion page write operations behind an auditable command flow so manual profile, policy, memory, summary, and restore actions are no longer naked storage-route calls.

**Architecture:** Keep `/api/companion/*` read and storage endpoints as low-level primitives. Add `/api/companion/commands` as the manual write command path; it dispatches to existing store functions, records command metadata, and returns command/revision status for the UI. This is an incremental Phase 2 step before approval-mode graph patches and full GraphCommandBus integration.

**Tech Stack:** FastAPI, Python companion store, JSON file persistence, Vue 3, Element Plus, TypeScript API wrappers, Node test runner, Python unittest.

---

## Task 1: Backend Command Flow

**Files:**
- Add: `backend/app/companion/commands.py`
- Modify: `backend/app/api/routes_companion.py`
- Add: `backend/tests/test_companion_commands.py`

- [x] **Step 1: Write failing route tests**

Add tests that post `profile.update` and `memory.delete` to `/api/companion/commands`, then assert the response includes a `command_id`, `status`, `revision_id`, `result`, and matching revision.

- [x] **Step 2: Verify red**

Run:

```powershell
python -m unittest backend.tests.test_companion_commands
```

Expected: FAIL because `/api/companion/commands` does not exist.

- [x] **Step 3: Implement command dispatcher**

Create a command module that supports these actions:

- `profile.update`
- `policy.update`
- `memory.create`
- `memory.update`
- `memory.delete`
- `session_summary.update`
- `revision.restore`

Each successful command records `command_id`, `action`, `status`, `target_type`, `target_id`, `revision_id`, `run_id: null`, timestamps, and a compact payload snapshot in `backend/data/companion/commands.json`.

- [x] **Step 4: Verify green**

Run:

```powershell
python -m unittest backend.tests.test_companion_commands backend.tests.test_companion_routes backend.tests.test_companion_store
```

Expected: PASS.

## Task 2: Frontend API Command Wrappers

**Files:**
- Modify: `frontend/src/types/companion.ts`
- Modify: `frontend/src/api/companion.ts`
- Modify: `frontend/src/api/companion.test.ts`

- [x] **Step 1: Write failing API tests**

Change write API tests to expect `POST /api/companion/commands` with an `action`, `payload`, optional `target_id`, and `change_reason`.

- [x] **Step 2: Verify red**

Run:

```powershell
node --test --experimental-strip-types src/api/companion.test.ts
```

Expected: FAIL because write wrappers still call direct companion storage routes.

- [x] **Step 3: Add command response types and wrappers**

Add `CompanionCommandRecord` and `CompanionCommandResponse<T>`. Update write helpers to return command responses while read helpers remain unchanged.

- [x] **Step 4: Verify green**

Run:

```powershell
node --test --experimental-strip-types src/api/companion.test.ts
```

Expected: PASS.

## Task 3: Companion Page Status Surface

**Files:**
- Modify: `frontend/src/pages/CompanionPage.vue`

- [x] **Step 1: Update save handlers**

Each save/delete/restore handler should unwrap `response.result`, refresh mutable lists where needed, and store `response.command` in `lastCommand`.

- [x] **Step 2: Display latest command status**

Show a compact status strip with command id, status, optional revision id, and optional run id. The run id is currently null but the field reserves the later graph-run integration.

- [x] **Step 3: Type-check touched frontend files**

Run a narrow TypeScript check over `src/types/companion.ts` and `src/api/companion.ts`. Full frontend build is currently blocked by existing test type issues.

## Task 4: Documentation, Verification, Commit

**Files:**
- Modify: `docs/future/2026-05-05-companion-self-config-memory-design.md`
- Modify: `docs/superpowers/plans/2026-05-05-companion-advisory-loop-hardening.md`

- [x] **Step 1: Document Phase 2 command-flow slice**

Record that manual Companion page writes now go through command records, while full approval graph patches remain a later phase.

- [x] **Step 2: Run final verification**

Run:

```powershell
python -m unittest backend.tests.test_companion_commands backend.tests.test_companion_routes backend.tests.test_companion_store backend.tests.test_local_file_skill backend.tests.test_template_layouts
node --test --experimental-strip-types src/api/companion.test.ts
git diff --check
```

- [x] **Step 3: Restart dev**

Run the repository dev restart flow and verify backend `/health` plus frontend root.

- [x] **Step 4: Commit and push**

Commit with a Chinese message and push the current branch.

# Companion Graph Patch Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first Phase 3 approval-mode primitive: Companion can create an auditable graph patch draft, but cannot apply it.

**Architecture:** Reuse the existing `/api/companion/commands` command shell. `graph_patch.draft` records a pending approval command with a JSON Patch-like payload and returns a draft artifact; it deliberately creates no graph revision, graph run, or graph mutation.

**Tech Stack:** FastAPI, Python companion command store, Vue 3 TypeScript API wrappers, Python unittest, Node test runner.

---

## Task 1: Backend Draft Command

**Files:**
- Modify: `backend/tests/test_companion_commands.py`
- Modify: `backend/app/companion/commands.py`

- [x] **Step 1: Write the failing draft command test**

Add `test_graph_patch_draft_records_approval_command_without_revision` that posts:

```json
{
  "action": "graph_patch.draft",
  "payload": {
    "graph_id": "graph_pet_loop",
    "graph_name": "桌宠对话循环",
    "summary": "增加记忆写入前的确认节点。",
    "rationale": "让桌宠先提出图修改建议，再由用户审批。",
    "patch": [
      {
        "op": "add",
        "path": "/nodes/confirm_memory_write",
        "value": {"type": "approval", "label": "确认记忆写入"}
      }
    ]
  },
  "change_reason": "Companion suggested a graph patch."
}
```

Assert the response command has `kind: "companion.graph_patch_draft"`, `status: "awaiting_approval"`, `target_type: "graph"`, `revision_id: null`, `run_id: null`, `completed_at: null`, and `revision: null`.

- [x] **Step 2: Write the failing validation test**

Add `test_graph_patch_draft_rejects_empty_patch`, posting an empty `patch: []`, and assert HTTP 422.

- [x] **Step 3: Verify red**

Run:

```powershell
python -m unittest backend.tests.test_companion_commands
```

Expected before implementation: FAIL because `graph_patch.draft` is unsupported and returns 422.

- [x] **Step 4: Implement the draft command**

In `backend/app/companion/commands.py`, branch `graph_patch.draft` before the revision-writing command dispatcher. Validate a non-empty patch list, supported operations, `path`, and `from` for `move` or `copy`. Append a command record with `status: "awaiting_approval"` and return a draft result.

- [x] **Step 5: Verify green**

Run:

```powershell
python -m unittest backend.tests.test_companion_commands
```

Expected after implementation: PASS.

## Task 2: Frontend API Wrapper

**Files:**
- Modify: `frontend/src/types/companion.ts`
- Modify: `frontend/src/api/companion.ts`
- Modify: `frontend/src/api/companion.test.ts`

- [x] **Step 1: Write the failing API test**

Add a test that imports `createCompanionGraphPatchDraft`, calls it with a graph id, summary, rationale, and patch operation, then asserts it posts to `/api/companion/commands` with `action: "graph_patch.draft"`.

- [x] **Step 2: Verify red**

Run:

```powershell
node --test --experimental-strip-types src/api/companion.test.ts
```

Expected before implementation: FAIL because `createCompanionGraphPatchDraft` is not exported.

- [x] **Step 3: Add types and wrapper**

Add `CompanionGraphPatchOperation`, `CompanionGraphPatchDraftPayload`, and `CompanionGraphPatchDraft`. Update `CompanionCommandRecord.completed_at` to `string | null`. Export `createCompanionGraphPatchDraft(payload, changeReason)` from `frontend/src/api/companion.ts`.

- [x] **Step 4: Verify green**

Run:

```powershell
node --test --experimental-strip-types src/api/companion.test.ts
```

Expected after implementation: PASS.

## Task 3: Documentation And Verification

**Files:**
- Add: `docs/superpowers/plans/2026-05-05-companion-graph-patch-draft.md`
- Modify: `docs/future/2026-05-05-companion-self-config-memory-design.md`
- Modify: `docs/superpowers/plans/2026-05-05-companion-advisory-loop-hardening.md`

- [x] **Step 1: Document the Phase 3 boundary**

Record that Phase 3 currently creates pending graph patch drafts only. Applying, validating against the live graph protocol, producing graph revisions, and integrating GraphCommandBus remain later work.

- [x] **Step 2: Run final verification**

Run:

```powershell
python -m unittest backend.tests.test_companion_commands backend.tests.test_companion_routes backend.tests.test_companion_store backend.tests.test_local_file_skill backend.tests.test_template_layouts
node --test --experimental-strip-types src/api/companion.test.ts
node_modules\.bin\tsc.cmd --noEmit --strict --target ES2022 --module ESNext --moduleResolution Node --lib ES2022,DOM,DOM.Iterable --allowImportingTsExtensions src/vite-env.d.ts src/types/companion.ts src/api/http.ts src/api/companion.ts
node_modules\.bin\vite.cmd build
git diff --check
```

- [ ] **Step 3: Restart dev, commit, and push**

Run the repository dev restart flow, verify backend `/health` and the frontend URL, then commit with a Chinese message and push.

# Dynamic Capability Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pause risky Skill execution in ask-first graph runs before file writes, delete-like operations, or subprocess execution.

**Architecture:** Add a small backend approval-policy helper, call it from the existing agent node Skill invocation loop, preserve approval metadata across run resume, and surface the pending approval in existing Human Review UI models. Reuse the current `awaiting_human` and `/api/runs/{run_id}/resume` flow.

**Tech Stack:** Python runtime, LangGraph checkpoint runner, FastAPI run routes, Vue 3 frontend model helpers, existing backend/frontend tests.

---

### Task 1: Backend Approval Helper

**Files:**
- Create: `backend/app/core/runtime/permission_approval.py`
- Test: `backend/tests/test_permission_approval.py`

- [ ] Add helper functions to resolve risky permissions, ask-first mode, pending approval packages, and one-time resume consumption.
- [ ] Verify with `python -m pytest backend/tests/test_permission_approval.py -q`.

### Task 2: Agent Node Runtime

**Files:**
- Modify: `backend/app/core/runtime/node_handlers.py`
- Test: `backend/tests/test_node_handlers_runtime.py`

- [ ] Add failing tests for ask-first pause before Skill invocation and resume with stored inputs.
- [ ] Wire the helper before `invoke_skill_func`.
- [ ] Verify with `python -m pytest backend/tests/test_node_handlers_runtime.py -q`.

### Task 3: LangGraph Pause/Resume Metadata

**Files:**
- Modify: `backend/app/core/langgraph/runtime.py`
- Modify: `backend/app/core/langgraph/runtime_setup.py`
- Modify: `backend/app/api/routes_runs.py`
- Test: `backend/tests/test_langgraph_permission_approval.py`

- [ ] Add a permission approval pause path parallel to subgraph breakpoint waiting.
- [ ] Preserve pending approval metadata through resume.
- [ ] Verify with `python -m pytest backend/tests/test_langgraph_permission_approval.py -q`.

### Task 4: Frontend Review Surface

**Files:**
- Modify: `frontend/src/editor/workspace/humanReviewPanelModel.ts`
- Modify: `frontend/src/editor/workspace/EditorHumanReviewPanel.vue`
- Modify: `frontend/src/buddy/BuddyWidget.vue`
- Modify: `frontend/src/i18n/messages.ts`
- Test: `frontend/src/editor/workspace/humanReviewPanelModel.test.ts`

- [ ] Add model extraction for `pending_permission_approval`.
- [ ] Render approval details in editor and Buddy pause cards.
- [ ] Verify with frontend tests.

### Task 5: Final Verification

- [ ] Run targeted backend tests.
- [ ] Run targeted frontend tests.
- [ ] Run `npm start` and confirm TooGraph starts.
- [ ] Commit and push with a Chinese commit message.

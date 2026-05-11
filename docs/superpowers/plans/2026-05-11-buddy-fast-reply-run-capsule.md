# Buddy Fast Reply And Run Capsule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Buddy reply quickly, keep run activity paired with each assistant response, and let long Buddy runs continue without frontend whole-run timeout.

**Architecture:** Add an early `visible_reply` state to the official Buddy graph template and teach the Buddy frontend to treat it as a displayable reply state. Move run trace storage from one global list to per-message run capsules while keeping a single active run pointer for streaming and polling. Remove the fixed Buddy poll timeout and rely on run terminal status, human pause, or explicit abort.

**Tech Stack:** Vue 3, Element Plus, TypeScript, TooGraph graph templates, Python backend tests for template compatibility.

---

### Task 1: Document Hermes Borrowings And Buddy Fast-Reply Design

**Files:**
- Create: `docs/superpowers/specs/2026-05-11-buddy-fast-reply-run-capsule-design.md`
- Create: `docs/superpowers/plans/2026-05-11-buddy-fast-reply-run-capsule.md`

- [x] **Step 1: Inspect Hermes and current Buddy graph**

Run:

```bash
rg --files demo/hermes-agent
rg -n "stream_delta_callback|on_segment_break|tool_calls|send_message" demo/hermes-agent/run_agent.py demo/hermes-agent/gateway -S
rg -n "visible_reply|final_reply|buddy_autonomous_loop" frontend/src/buddy graph_template/official docs -S
```

Expected: source locations for Hermes streaming segments and current Buddy final reply path.

- [x] **Step 2: Write the spec and plan**

Save the design and this implementation plan under `docs/superpowers/`.

### Task 2: Add Fast Reply State To Buddy Graph

**Files:**
- Modify: `graph_template/official/buddy_autonomous_loop/template.json`
- Modify: `frontend/src/buddy/buddyChatGraph.ts`
- Test: `frontend/src/buddy/buddyChatGraph.test.ts`
- Test: `backend/tests/test_template_layouts.py`

- [ ] **Step 1: Write failing tests**

Add frontend tests that verify `resolveBuddyReplyFromRunEvent` returns `visible_reply`, and `buildBuddyChatGraph` clears both `visible_reply` and `final_reply` before a new run. Add backend template assertions that `buddy_autonomous_loop` contains a top-level `visible_reply` state and the intake subgraph writes it.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd frontend && npx tsx --test src/buddy/buddyChatGraph.test.ts
python -m pytest backend/tests/test_template_layouts.py -q
```

Expected: failures because `visible_reply` is not yet recognized or present.

- [ ] **Step 3: Implement graph and frontend recognition**

Add `visible_reply` as markdown state, make the intake `understand_request` node write it, map it through the intake subgraph output, and include `"visible_reply"` in Buddy reply state recognition and run setup clearing.

- [ ] **Step 4: Run tests and confirm pass**

Run the same commands from Step 2.

### Task 3: Store Run Trace Per Buddy Message

**Files:**
- Modify: `frontend/src/buddy/BuddyWidget.vue`
- Test: `frontend/src/buddy/BuddyWidget.structure.test.ts`

- [ ] **Step 1: Write failing structure tests**

Add tests that require Buddy messages to include per-message run trace state, require the template to call `visibleRunTraceEntries(message)`, and reject use of a global `runTraceEntries` ref.

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
cd frontend && npx tsx --test src/buddy/BuddyWidget.structure.test.ts
```

Expected: failure because trace is still global.

- [ ] **Step 3: Implement per-message run capsules**

Add a `runTrace` object to `BuddyMessage`, update `resetRunTraceForMessage`, `appendRunTraceEntry`, `markRunTraceFinished`, and template helpers to read/write trace data on the owning assistant message.

- [ ] **Step 4: Run test and confirm pass**

Run the same structure test command.

### Task 4: Remove Buddy Whole-Run Timeout

**Files:**
- Modify: `frontend/src/buddy/BuddyWidget.vue`
- Test: `frontend/src/buddy/BuddyWidget.structure.test.ts`

- [ ] **Step 1: Write failing structure test**

Assert that `RUN_POLL_TIMEOUT_MS` is absent and `pollRunUntilFinished` loops until terminal status or abort.

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
cd frontend && npx tsx --test src/buddy/BuddyWidget.structure.test.ts
```

Expected: failure because `RUN_POLL_TIMEOUT_MS` still exists.

- [ ] **Step 3: Remove timeout**

Change `pollRunUntilFinished` to `while (true)` with the existing abort-aware delay. Remove the timeout translation from Buddy if no longer used.

- [ ] **Step 4: Run test and confirm pass**

Run the same structure test command.

### Task 5: Verify Build, Runtime, And Docs

**Files:**
- Modify as needed: `docs/current_project_status.md`
- Modify as needed: `knowledge/TooGraph-official/runtime-and-roadmap.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
git diff --check
python -m pytest backend/tests/test_template_layouts.py -q
cd frontend && npx tsx --test src/buddy/buddyChatGraph.test.ts src/buddy/BuddyWidget.structure.test.ts
npm --prefix frontend run build
```

- [ ] **Step 2: Restart TooGraph**

Run:

```bash
npm start
```

Expected: service available at `http://127.0.0.1:3477`.

- [ ] **Step 3: Commit and push**

Use a Chinese commit message.

# HTML State Output Buddy Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add graph `html` state support and sandboxed HTML rendering for Output nodes and Buddy replies.

**Architecture:** Keep `html` in the existing `node_system` protocol and state editor models. Reuse one frontend sandbox iframe component for Output and Buddy, while preserving the existing Markdown renderer for non-HTML replies.

**Tech Stack:** Python Pydantic schemas and runtime helpers, Vue 3, TypeScript `node --test`, pytest, Element Plus.

---

### Task 1: Protocol And Runtime Display Types

**Files:**
- Modify: `backend/app/core/schemas/node_system.py`
- Modify: `backend/app/core/runtime/output_boundaries.py`
- Modify: `backend/app/core/runtime/agent_prompt.py`
- Modify: `backend/app/core/runtime/structured_output.py`
- Test: `backend/tests/test_node_system_schema_rejects_legacy_fields.py`
- Test: `backend/tests/test_runtime_output_boundaries.py`

- [ ] Add failing tests that validate `NodeSystemStateDefinition(type="html")`, `NodeSystemOutputConfig(displayMode="html")`, and result-package `type: "html"` resolving to output preview display mode `html`.
- [ ] Add `HTML = "html"` to `NodeSystemStateType` and `DisplayMode`.
- [ ] Treat `html` as a string output in structured output and prompt contracts.
- [ ] Resolve result-package output type `html` to display mode `html`.
- [ ] Run the targeted backend tests.

### Task 2: Frontend State And Output Rendering

**Files:**
- Create: `frontend/src/components/SandboxedHtmlFrame.vue`
- Modify: `frontend/src/types/node-system.ts`
- Modify: `frontend/src/editor/workspace/statePanelFields.ts`
- Modify: `frontend/src/lib/graph-document.ts`
- Modify: `frontend/src/editor/nodes/outputConfigModel.ts`
- Modify: `frontend/src/editor/nodes/outputPreviewContentModel.ts`
- Modify: `frontend/src/editor/nodes/OutputNodeBody.vue`
- Modify: `frontend/src/editor/nodes/nodeCardViewModel.ts`
- Modify: `frontend/src/lib/run-event-stream.ts`
- Test: related frontend `*.test.ts` and structure tests

- [ ] Add failing tests for `html` state type options, output display option labels, HTML preview content, HTML result-package pages, Output node iframe structure, and auto display mode for `html` state.
- [ ] Implement the shared sandbox iframe component with `sandbox=""` and `referrerpolicy="no-referrer"`.
- [ ] Add `html` to frontend state and output display models.
- [ ] Render Output HTML previews through the sandbox component.
- [ ] Run the targeted frontend tests.

### Task 3: Buddy Rendering And Visual Fit

**Files:**
- Modify: `frontend/src/buddy/BuddyWidget.vue`
- Modify: `frontend/src/buddy/buddyPublicOutput.ts`
- Test: `frontend/src/buddy/BuddyWidget.structure.test.ts`
- Test: `frontend/src/buddy/buddyPublicOutput.test.ts`

- [ ] Add failing tests for Buddy treating `html` public outputs as text-rendered replies and for the widget using the shared sandbox component.
- [ ] Render assistant Markdown with the existing safe renderer and HTML with the sandbox iframe.
- [ ] Widen the closed Buddy bubble and constrain rendered content with scrolling.
- [ ] Run targeted Buddy tests.

### Task 4: Verification And Delivery

**Files:**
- All touched files

- [ ] Run focused frontend tests.
- [ ] Run focused backend tests.
- [ ] Run `npm --prefix frontend run build`.
- [ ] Run a browser visual check for Output HTML preview and Buddy HTML/Markdown reply surfaces.
- [ ] Restart TooGraph with `npm start`.
- [ ] Commit with a Chinese commit message and push.

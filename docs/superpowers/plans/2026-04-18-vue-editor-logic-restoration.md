# Vue Editor Logic Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the old frontend's editor product logic inside the new Vue frontend without changing the backend contract.

**Architecture:** Keep the new Vue 3 + Vite + Pinia stack, but treat the old React frontend at commit `87d3d6e` as the source of truth for product behavior. Rebuild the editor as the same workspace model: welcome page at `/editor`, real edit state on dedicated routes, persistent tabs, close-confirm flow, and the same top-level chrome before continuing with deeper canvas work.

**Tech Stack:** Vue 3, Vite, Pinia, Vue Router, backend-native graph payloads

---

### Task 1: Restore route semantics and welcome/workspace split

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/pages/EditorPage.vue`
- Modify: `frontend/src/stores/editorWorkspace.ts`
- Modify: `frontend/src/stores/graphDocument.ts`
- Create: `frontend/src/editor/workspace/EditorWelcomeState.vue`
- Create: `frontend/src/lib/document-selection.ts`
- Test: `frontend/src/lib/document-selection.test.ts`

- [ ] Re-establish the old route meanings:
  - `/editor` = welcome/workspace page
  - `/editor/new` = new graph editor state
  - `/editor/:graphId` = existing graph editor state

- [ ] Make the welcome page the default `/editor` experience again:
  - template list
  - saved graph list
  - search in both lists
  - new graph CTA

- [ ] Ensure blank new graphs and template-derived drafts are separate:
  - blank draft for `/editor/new`
  - template draft for `/editor/new?template=...`

- [ ] Verify:
  - `cd frontend && node --test --experimental-strip-types src/lib/document-selection.test.ts src/lib/graph-document.test.ts`
  - `cd frontend && npm run build`

- [ ] Commit:
  - `git commit -m "恢复 Vue 编辑器欢迎页与路由语义"`

### Task 2: Rebuild the editor workspace shell and tab model

**Files:**
- Create: `frontend/src/editor/workspace/EditorWorkspaceShell.vue`
- Create: `frontend/src/editor/workspace/EditorTabBar.vue`
- Create: `frontend/src/editor/workspace/EditorCloseConfirmDialog.vue`
- Create: `frontend/src/lib/editor-workspace.ts`
- Create: `frontend/src/lib/editor-action-bridge.ts`
- Modify: `frontend/src/pages/EditorPage.vue`
- Modify: `frontend/src/stores/editorWorkspace.ts`

- [ ] Port the old workspace model from React:
  - persisted tabs
  - active tab id
  - open template into tab
  - open saved graph into tab
  - restore tabs on reload

- [ ] Restore close-confirm behavior:
  - clean tab closes immediately
  - dirty tab opens confirm dialog
  - closing the last tab returns to welcome state

- [ ] Restore top tab bar responsibilities:
  - tab switching
  - template open
  - saved graph open
  - graph title surface
  - save / validate / run entry points

- [ ] Verify:
  - `cd frontend && npm run build`
  - `./scripts/start.sh`
  - `curl -I -s http://127.0.0.1:3477/editor`

- [ ] Commit:
  - `git commit -m "恢复 Vue 编辑器工作区与标签页逻辑"`

### Task 3: Restore editor-state layout parity before deeper canvas work

**Files:**
- Modify: `frontend/src/pages/EditorPage.vue`
- Modify: `frontend/src/editor/canvas/EditorCanvas.vue`
- Modify: `frontend/src/editor/nodes/NodeCard.vue`
- Create: `frontend/src/editor/workspace/EditorChromeLayout.vue`

- [ ] Replace the temporary preview-card editing layout with the old editor-state structure:
  - full editor workspace area
  - proper canvas-first composition
  - side panels / top chrome placement aligned with the old frontend's logic

- [ ] Keep the current Vue canvas foundation, but stop showing it as a preview card inside a summary panel.

- [ ] Verify:
  - `cd frontend && npm run build`
  - `./scripts/start.sh`
  - manual check in `/editor/new` and `/editor/<graphId>`

- [ ] Commit:
  - `git commit -m "恢复 Vue 编辑器编辑态主布局"`

### Task 4: Restore action wiring and document lifecycle behavior

**Files:**
- Modify: `frontend/src/stores/graphDocument.ts`
- Modify: `frontend/src/editor/workspace/EditorWorkspaceShell.vue`
- Modify: `frontend/src/editor/canvas/EditorCanvas.vue`
- Modify: `frontend/src/pages/EditorPage.vue`
- Create: `frontend/src/api/runs.ts`

- [ ] Reconnect live editor actions to the workspace shell:
  - rename graph
  - save
  - validate
  - run
  - later panel toggles

- [ ] Preserve the old document lifecycle:
  - new tabs start dirty only when changed
  - saved graphs stay addressable by graph id
  - save upgrades draft tabs into saved graph tabs
  - run acts on the active document

- [ ] Verify:
  - `cd frontend && npm run build`
  - `./scripts/start.sh`
  - `curl -sf http://127.0.0.1:8765/health`

- [ ] Commit:
  - `git commit -m "接回 Vue 编辑器动作与文档生命周期"`

### Task 5: Rebuild secondary pages against the restored workspace model

**Files:**
- Modify: `frontend/src/pages/HomePage.vue`
- Modify: `frontend/src/pages/RunsPage.vue`
- Modify: `frontend/src/pages/SettingsPage.vue`
- Create: any supporting `frontend/src/api/*` and `frontend/src/stores/*` files needed

- [ ] Align home/workspace entry behavior with the restored editor shell.
- [ ] Reconnect runs/settings pages to the unchanged backend.
- [ ] Keep route names and high-level page intent aligned with the old frontend.

- [ ] Verify:
  - `cd frontend && npm run build`
  - `./scripts/start.sh`
  - manual smoke check of `/`, `/editor`, `/runs`, `/settings`

- [ ] Commit:
  - `git commit -m "恢复 Vue 前端辅助页面逻辑"`

### Task 6: Final verification and migration checkpoint

**Files:**
- Modify: `docs/current_engineering_backlog.md`
- Modify: `docs/README.md`

- [ ] Re-check restored editor logic against the old frontend behavior at `87d3d6e`:
  - welcome page present
  - tabs restored
  - last tab close returns to welcome page
  - separate new/template/existing routes
  - editor state no longer shown as a preview card

- [ ] Run full verification:
  - `cd frontend && npm run build`
  - `git diff --check`
  - `./scripts/start.sh`
  - `curl -sf http://127.0.0.1:8765/health`
  - `curl -I -s http://127.0.0.1:3477/editor`
  - `curl -I -s http://127.0.0.1:3477/editor/new`

- [ ] Update docs to reflect the restored migration baseline.

- [ ] Commit:
  - `git commit -m "完成 Vue 前端核心逻辑迁移基线"`

# Editor Tab Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/editor` into a persistent tabbed workspace that restores previously opened graphs, keeps the active saved graph in the URL, shows a welcome state when no tabs exist, and confirms save/discard when closing dirty tabs.

**Architecture:** Introduce a client-side editor workspace layer above `NodeSystemEditor` that owns the tab model, persistence, URL synchronization, and close-confirm flows. Refactor `NodeSystemEditor` just enough to expose document lifecycle hooks such as dirty-state changes, current title changes, and save results, while keeping the existing canvas/editor implementation intact.

**Tech Stack:** Next.js App Router, React 19, TypeScript, current GraphiteUI editor components, `localStorage`, existing `/api/graphs` and `/api/templates`

---

### Task 1: Record the new scope and verification limits

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Reference: `docs/superpowers/specs/2026-04-15-editor-tab-workspace-design.md`

- [ ] **Step 1: Update planning files to the tab-workspace scope**

Record that the current task is no longer just homepage and entry-page polish. It is now:

- `/editor` becomes a tab workspace
- welcome state only appears when no tabs exist
- tabs restore from local state
- active saved graph syncs into the URL

- [ ] **Step 2: Re-state the testing constraint**

Document that the frontend still has no dedicated test runner, so this implementation will be verified with:

```bash
cd frontend && npx tsc --noEmit
git diff --check
./scripts/start.sh
curl -I http://127.0.0.1:3477/editor
curl -I http://127.0.0.1:3477/editor/<saved-graph-id>
curl -I http://127.0.0.1:3477
curl http://127.0.0.1:8765/health
```

Also record that browser-only interactions such as local tab restoration and close-confirm flows cannot be fully automated in the current repo state.

### Task 2: Define the editor workspace model

**Files:**
- Create: `frontend/lib/editor-workspace.ts`
- Modify: `frontend/lib/types.ts`

- [ ] **Step 1: Add explicit tab workspace types**

Create a focused module for editor workspace state. It should define:

```ts
export type EditorTabKind = "existing" | "new" | "template";

export type EditorWorkspaceTab = {
  tabId: string;
  kind: EditorTabKind;
  graphId: string | null;
  title: string;
  dirty: boolean;
  templateId: string | null;
  defaultTemplateId: string | null;
};

export type PersistedEditorWorkspace = {
  activeTabId: string | null;
  tabs: EditorWorkspaceTab[];
};
```

- [ ] **Step 2: Add persistence helpers**

In the same file, add helpers for:

```ts
export const EDITOR_WORKSPACE_STORAGE_KEY = "graphiteui:editor-workspace";
export function readPersistedEditorWorkspace(): PersistedEditorWorkspace
export function writePersistedEditorWorkspace(workspace: PersistedEditorWorkspace): void
export function createNewTabId(): string
```

Use defensive parsing and return an empty workspace on malformed data.

- [ ] **Step 3: Add route helper utilities**

Still in `frontend/lib/editor-workspace.ts`, define helpers like:

```ts
export function resolveEditorUrl(graphId: string | null): string
export function isSameSavedGraph(tab: EditorWorkspaceTab, graphId: string): boolean
```

Rules:

- saved graph -> `/editor/<graphId>`
- unsaved tab -> `/editor`

### Task 3: Refactor `NodeSystemEditor` so the workspace can manage it

**Files:**
- Modify: `frontend/components/editor/node-system-editor.tsx`
- Modify: `frontend/components/editor/editor-client.tsx`

- [ ] **Step 1: Extend editor props with document lifecycle hooks**

Add props for the editor surface:

```ts
type EditorClientProps = {
  ...
  documentKey?: string;
  onDocumentMetaChange?: (meta: { title: string; dirty: boolean; graphId: string | null }) => void;
  onGraphSaved?: (payload: { graphId: string; title: string }) => void;
}
```

These hooks must be optional so existing usage can continue while the workspace layer is introduced.

- [ ] **Step 2: Surface current title, graph id, and dirty state**

Inside `NodeSystemCanvas`, derive a stable dirty flag by comparing the current editable payload with the last saved baseline. Whenever title, graph id, or dirty changes, call:

```ts
data.onDocumentMetaChange?.({
  title: graphName,
  dirty: isDirty,
  graphId,
});
```

- [ ] **Step 3: Report successful saves upward**

After a successful save in the existing `handleSave`, call:

```ts
data.onGraphSaved?.({
  graphId: response.graph_id,
  title: graphName,
});
```

Also refresh the saved baseline so the tab’s dirty state returns to `false`.

- [ ] **Step 4: Make the editor remountable per tab**

Use a `documentKey` prop and ensure `NodeSystemEditor` passes a stable `key` into the canvas layer so changing tabs gives each tab an isolated editor instance:

```tsx
<NodeSystemCanvas key={documentKey ?? graph.graph_id ?? "editor-document"} ... />
```

This avoids state leaking between tabs while keeping the existing internal editor logic.

### Task 4: Build the tabbed workspace shell for `/editor`

**Files:**
- Create: `frontend/components/editor/editor-workspace-shell.tsx`
- Modify: `frontend/components/editor/editor-client.tsx`

- [ ] **Step 1: Create a dedicated workspace shell component**

Build a client component that owns:

- current tabs
- active tab id
- welcome state when no tabs exist
- close-confirm dialog state

The shell should render either:

```tsx
<EditorWelcomeState ... />
```

or:

```tsx
<EditorTabBar ... />
<NodeSystemEditor ... />
```

- [ ] **Step 2: Restore tabs from local storage on mount**

On mount:

- read persisted workspace
- if no tabs -> show welcome state
- if tabs exist -> restore them and select the persisted active tab

Do not hit the network in this step; restoration should be instant from local state first.

- [ ] **Step 3: Keep persistence in sync**

Whenever tabs or active tab change, write them back with:

```ts
writePersistedEditorWorkspace({ tabs, activeTabId });
```

- [ ] **Step 4: Wire editor lifecycle hooks into the active tab**

When `NodeSystemEditor` reports title/dirty changes, update the active tab metadata.

When `onGraphSaved` fires:

- update the active tab’s `graphId`
- switch its `kind` to `existing`
- clear `templateId` if needed
- push the URL to `/editor/<graphId>`

### Task 5: Implement welcome state and entry actions

**Files:**
- Create: `frontend/components/editor/editor-welcome-state.tsx`
- Modify: `frontend/components/editor/editor-workspace-shell.tsx`
- Modify: `frontend/components/providers/language-provider.tsx`

- [ ] **Step 1: Create the welcome state component**

The component should render a compact empty-state surface with three actions:

- `新建图`
- `从模板创建`
- `打开已有图`

Keep the current warm paper-like design language.

- [ ] **Step 2: Implement “新建图”**

Create a new unsaved tab:

```ts
{
  tabId: createNewTabId(),
  kind: "new",
  graphId: null,
  title: "Untitled Graph",
  dirty: false,
  templateId: null,
  defaultTemplateId: null,
}
```

Then activate it and route to `/editor`.

- [ ] **Step 3: Implement “从模板创建”**

Show a lightweight template chooser inside the welcome state, backed by the existing `templates` prop already loaded for the editor pages.

Selecting a template should open a new unsaved tab:

```ts
{
  kind: "template",
  graphId: null,
  templateId: selectedTemplate.template_id,
  defaultTemplateId: selectedTemplate.template_id,
  title: selectedTemplate.label,
  ...
}
```

URL remains `/editor` until saved.

- [ ] **Step 4: Implement “打开已有图”**

Show a lightweight recent-graphs list or graph picker using the same graph summary data source already used by `/editor`.

If the chosen graph is already open, activate the existing tab.
If not, open a new `existing` tab and route to `/editor/<graphId>`.

### Task 6: Implement tab bar behavior and duplicate-graph prevention

**Files:**
- Create: `frontend/components/editor/editor-tab-bar.tsx`
- Modify: `frontend/components/editor/editor-workspace-shell.tsx`

- [ ] **Step 1: Build the tab bar**

Render tabs with:

- title
- active visual state
- dirty marker
- close button

Also include a compact “new tab” button that opens the welcome-state actions or creates a new blank tab based on the agreed UX.

- [ ] **Step 2: Implement activation behavior**

When switching tabs:

- update `activeTabId`
- if the tab has `graphId`, route to `/editor/<graphId>`
- otherwise route to `/editor`

- [ ] **Step 3: Prevent duplicate saved-graph tabs**

When opening a saved graph from any entry:

```ts
const existing = tabs.find((tab) => tab.graphId === graphId);
```

If found:

- set it active
- route to its URL

Do not create a duplicate tab.

### Task 7: Add dirty-close confirmation flow

**Files:**
- Create: `frontend/components/editor/editor-close-confirm-dialog.tsx`
- Modify: `frontend/components/editor/editor-workspace-shell.tsx`

- [ ] **Step 1: Add close interception**

When the user tries to close a tab:

- if `dirty === false`, close immediately
- if `dirty === true`, open the confirm dialog instead

- [ ] **Step 2: Implement the 3-action confirm dialog**

The dialog must offer:

- `保存并关闭`
- `不保存，直接关闭`
- `取消`

Keep the styling aligned with the existing dialog/card language already used in the editor.

- [ ] **Step 3: Implement “保存并关闭”**

This requires the workspace shell to trigger save on the active editor instance before closing.

Add an imperative handle or callback bridge from `NodeSystemEditor` to expose:

```ts
saveCurrentDocument(): Promise<{ ok: boolean; graphId?: string; error?: string }>
```

If save succeeds:

- close the tab
- activate the next remaining tab or welcome state

If save fails:

- keep the tab open
- keep it active
- show the error

- [ ] **Step 4: Implement “不保存，直接关闭” and “取消”**

Rules:

- discard -> close immediately
- cancel -> do nothing

Closing the last remaining tab returns the workspace to the welcome state and routes to `/editor`.

### Task 8: Connect route pages to the new workspace shell

**Files:**
- Modify: `frontend/app/editor/page.tsx`
- Modify: `frontend/app/editor/[graphId]/page.tsx`
- Modify: `frontend/app/editor/new/page.tsx`
- Modify: `frontend/components/editor/editor-client.tsx`

- [ ] **Step 1: Stop treating each route as a standalone editor instance**

Refactor the route pages so they all pass enough data into a shared `EditorClient` / workspace shell, instead of directly assuming one page = one document.

- [ ] **Step 2: `/editor` should open the workspace shell with no forced graph**

This route becomes the base workspace URL:

- welcome state if no tabs
- restored workspace if tabs exist

- [ ] **Step 3: `/editor/<graphId>` should seed or activate a saved tab**

If the graph is already in restored tabs:

- activate it

If not:

- fetch it
- add it as an `existing` tab
- activate it

- [ ] **Step 4: `/editor/new?template=...` should seed an unsaved template tab**

This route should no longer behave like a separate standalone single-document editor page. Instead it should open the workspace and seed a new unsaved tab based on the requested template.

### Task 9: Verify and record results

**Files:**
- Modify: `progress.md`
- Modify: `findings.md`

- [ ] **Step 1: Run static verification**

Run:

```bash
cd frontend && npx tsc --noEmit
git diff --check
```

Expected:

- TypeScript exits with code 0
- no diff formatting issues

- [ ] **Step 2: Restart and probe routes**

Run:

```bash
./scripts/start.sh
curl -I http://127.0.0.1:3477/editor
curl -I http://127.0.0.1:3477/editor/new
curl -I http://127.0.0.1:3477/editor/<known-graph-id>
curl http://127.0.0.1:8765/health
```

Expected:

- `/editor` returns 200
- `/editor/new` returns 200
- `/editor/<known-graph-id>` returns 200
- backend health returns `{"status":"ok"}`

- [ ] **Step 3: Record verification limits and completed behavior**

Write back:

- tab workspace implemented
- URL sync rules implemented
- duplicate saved-graph tabs prevented
- dirty close confirm implemented
- browser-only restore/confirm flows still lack automated verification because the repo has no frontend test harness

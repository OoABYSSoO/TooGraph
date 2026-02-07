# Vue Frontend Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the React frontend with a Vue 3 frontend that keeps the existing backend unchanged and rebuilds the editor on a custom canvas architecture.

**Architecture:** Remove the current `frontend/` app on this branch, scaffold a Vue 3 + Vite + Pinia frontend in the same `frontend/` path, then rebuild the application shell, API layer, and editor using backend-native graph state as the core model.

**Tech Stack:** Vue 3, Vite, TypeScript, Pinia, Vue Router

---

### Task 1: Remove the React frontend and scaffold the Vue app

**Files:**
- Delete: `frontend/**`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.ts`
- Create: `frontend/src/App.vue`

- [ ] **Step 1: Remove the old frontend directory contents**

Run:

```bash
find frontend -mindepth 1 -maxdepth 1 ! -name package-lock.json -exec rm -rf {} +
```

Expected: old React app files removed from `frontend/`

- [ ] **Step 2: Create the Vue package manifest**

Create `frontend/package.json`:

```json
{
  "name": "graphiteui-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 3477",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview --host 127.0.0.1 --port 3477"
  },
  "dependencies": {
    "pinia": "^3.0.3",
    "vue": "^3.5.13",
    "vue-router": "^4.5.1"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.4",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vue-tsc": "^2.2.10"
  }
}
```

- [ ] **Step 3: Create the initial Vite config**

Create `frontend/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Create the TypeScript config**

Create `frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"]
}
```

- [ ] **Step 5: Create the initial entry files**

Create `frontend/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GraphiteUI</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `frontend/src/main.ts`:

```ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
```

Create `frontend/src/App.vue`:

```vue
<template>
  <main>GraphiteUI Vue frontend bootstrap</main>
</template>
```

- [ ] **Step 6: Install dependencies**

Run:

```bash
cd frontend && npm install
```

Expected: install completes successfully

- [ ] **Step 7: Verify the scaffold**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds

- [ ] **Step 8: Commit**

```bash
git add frontend
git commit -m "重建前端为 Vue 基础骨架"
```

### Task 2: Build the application shell, router, and API client

**Files:**
- Create: `frontend/src/router/index.ts`
- Create: `frontend/src/api/http.ts`
- Create: `frontend/src/layouts/AppShell.vue`
- Create: `frontend/src/pages/HomePage.vue`
- Create: `frontend/src/pages/EditorPage.vue`
- Create: `frontend/src/pages/RunsPage.vue`
- Create: `frontend/src/pages/SettingsPage.vue`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: Create router and pages**

Create `frontend/src/router/index.ts`:

```ts
import { createRouter, createWebHistory } from "vue-router";

import HomePage from "@/pages/HomePage.vue";
import EditorPage from "@/pages/EditorPage.vue";
import RunsPage from "@/pages/RunsPage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomePage },
    { path: "/editor", component: EditorPage },
    { path: "/editor/new", component: EditorPage },
    { path: "/runs", component: RunsPage },
    { path: "/settings", component: SettingsPage },
  ],
});
```

- [ ] **Step 2: Create a minimal API client**

Create `frontend/src/api/http.ts`:

```ts
const API_BASE = "http://127.0.0.1:8765";

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}
```

- [ ] **Step 3: Create the app shell**

Create `frontend/src/layouts/AppShell.vue`:

```vue
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink to="/">首页</RouterLink>
      <RouterLink to="/editor">编辑器</RouterLink>
      <RouterLink to="/runs">运行记录</RouterLink>
      <RouterLink to="/settings">设置</RouterLink>
    </aside>
    <section class="content">
      <slot />
    </section>
  </div>
</template>
```

- [ ] **Step 4: Create minimal page components**

Create:

- `frontend/src/pages/HomePage.vue`
- `frontend/src/pages/EditorPage.vue`
- `frontend/src/pages/RunsPage.vue`
- `frontend/src/pages/SettingsPage.vue`

Each can start with:

```vue
<template>
  <AppShell>
    <div>Page placeholder</div>
  </AppShell>
</template>

<script setup lang="ts">
import AppShell from "@/layouts/AppShell.vue";
</script>
```

- [ ] **Step 5: Wire router into the app**

Update `frontend/src/main.ts`:

```ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "@/router";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
```

Update `frontend/src/App.vue`:

```vue
<template>
  <RouterView />
</template>
```

- [ ] **Step 6: Verify build**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "搭建 Vue 前端路由与应用外壳"
```

### Task 3: Establish shared graph types, stores, and backend-native graph loading

**Files:**
- Create: `frontend/src/types/node-system.ts`
- Create: `frontend/src/stores/editorWorkspace.ts`
- Create: `frontend/src/stores/graphDocument.ts`
- Create: `frontend/src/api/graphs.ts`
- Modify: `frontend/src/pages/EditorPage.vue`

- [ ] **Step 1: Create backend-native graph types**

Define TypeScript types for:

- state schema
- nodes
- edges
- conditional edges
- graph payload

in `frontend/src/types/node-system.ts`

- [ ] **Step 2: Create graph API helpers**

Create `frontend/src/api/graphs.ts` with:

- `fetchTemplates()`
- `fetchGraph(graphId)`
- `validateGraph(payload)`
- `runGraph(payload)`

- [ ] **Step 3: Create editor stores**

Create:

- `editorWorkspace.ts` for active tab/workspace state
- `graphDocument.ts` for the active graph document and transient editor view state

- [ ] **Step 4: Load initial editor data**

Update `EditorPage.vue` to:

- load templates for `/editor/new`
- hold active graph state in Pinia
- render a clear loading/error state

- [ ] **Step 5: Verify build**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types frontend/src/stores frontend/src/api frontend/src/pages/EditorPage.vue
git commit -m "建立 Vue 编辑器图文档模型与状态管理"
```

### Task 4: Build the custom editor canvas foundation

**Files:**
- Create: `frontend/src/editor/canvas/EditorCanvas.vue`
- Create: `frontend/src/editor/canvas/useViewport.ts`
- Create: `frontend/src/editor/canvas/useSelection.ts`
- Create: `frontend/src/editor/anchors/anchorModel.ts`
- Create: `frontend/src/editor/anchors/anchorPlacement.ts`
- Create: `frontend/src/editor/nodes/NodeCard.vue`
- Modify: `frontend/src/pages/EditorPage.vue`

- [ ] **Step 1: Create the anchor model**

Add pure helpers that produce:

- flow anchors
- state anchors
- route anchors

from backend-native graph nodes

- [ ] **Step 2: Create the canvas viewport primitives**

Implement:

- pan
- zoom
- node dragging
- selection state

without adopting a third-party flow library

- [ ] **Step 3: Render nodes on the custom canvas**

Create `NodeCard.vue` and render graph nodes positioned on the canvas from the graph store.

- [ ] **Step 4: Verify build**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editor frontend/src/pages/EditorPage.vue
git commit -m "建立 Vue 自定义编辑器画布基础"
```

### Task 5: Implement connectors, edges, and node interactions

**Files:**
- Create: `frontend/src/editor/edges/FlowEdgeLayer.vue`
- Create: `frontend/src/editor/edges/DataEdgeLayer.vue`
- Create: `frontend/src/editor/interactions/useConnectorDrag.ts`
- Modify: `frontend/src/editor/nodes/NodeCard.vue`
- Modify: `frontend/src/editor/canvas/EditorCanvas.vue`

- [ ] **Step 1: Render control-flow edges**

Implement a dedicated control-flow edge layer that reads anchor coordinates from the shared anchor model.

- [ ] **Step 2: Render projected data edges**

Implement a dedicated projected data-flow edge layer derived from:

- reads
- writes
- control-flow topology

- [ ] **Step 3: Implement connector drag interactions**

Support:

- flow connections
- route connections
- state binding interactions

according to the backend-native graph model

- [ ] **Step 4: Verify build**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editor
git commit -m "实现 Vue 编辑器连接点与边系统"
```

### Task 6: Rebuild editor panels and save / validate / run flows

**Files:**
- Create: `frontend/src/editor/panels/StatePanel.vue`
- Create: `frontend/src/editor/panels/InspectorPanel.vue`
- Create: `frontend/src/editor/workspace/EditorToolbar.vue`
- Modify: `frontend/src/pages/EditorPage.vue`
- Modify: `frontend/src/stores/graphDocument.ts`

- [ ] **Step 1: Build the editor toolbar**

Support:

- save
- validate
- run
- graph title

- [ ] **Step 2: Build the state panel**

Support:

- state listing
- state editing
- node/state relation visibility

- [ ] **Step 3: Wire save / validate / run**

Use the current backend API unchanged.

- [ ] **Step 4: Verify build**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editor frontend/src/pages/EditorPage.vue frontend/src/stores/graphDocument.ts
git commit -m "接入 Vue 编辑器面板与运行链路"
```

### Task 7: Rebuild runs, settings, and home pages

**Files:**
- Modify: `frontend/src/pages/HomePage.vue`
- Modify: `frontend/src/pages/RunsPage.vue`
- Modify: `frontend/src/pages/SettingsPage.vue`
- Create: `frontend/src/api/runs.ts`
- Create: `frontend/src/api/settings.ts`

- [ ] **Step 1: Rebuild runs page**

Implement fetching and displaying runs.

- [ ] **Step 2: Rebuild settings page**

Implement fetching and editing settings.

- [ ] **Step 3: Rebuild home page**

Implement a minimal shell that links to the editor and other core sections.

- [ ] **Step 4: Verify build**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages frontend/src/api
git commit -m "重建 Vue 前端次级页面"
```

### Task 8: End-to-end verification and branch cleanup

**Files:**
- Modify: `docs/current_engineering_backlog.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Run final build verification**

Run:

```bash
cd frontend && npm run build
```

Expected: success

- [ ] **Step 2: Restart the dev environment**

Run:

```bash
./scripts/start.sh
```

Expected: frontend on `http://127.0.0.1:3477`, backend on `http://127.0.0.1:8765`

- [ ] **Step 3: Verify runtime health**

Run:

```bash
curl -sf http://127.0.0.1:8765/health
curl -I -s http://127.0.0.1:3477/ | head -n 1
curl -I -s http://127.0.0.1:3477/editor/new | head -n 1
```

Expected:

```txt
{"status":"ok"}
HTTP/1.1 200 OK
HTTP/1.1 200 OK
```

- [ ] **Step 4: Update docs**

Reflect the Vue frontend rebuild in:

- `docs/current_engineering_backlog.md`
- `docs/README.md`

- [ ] **Step 5: Commit**

```bash
git add docs/current_engineering_backlog.md docs/README.md
git commit -m "完成 Vue 前端重建收尾"
```

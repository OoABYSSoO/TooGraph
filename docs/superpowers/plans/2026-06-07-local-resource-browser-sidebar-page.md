# Local Resource Browser Sidebar Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class sidebar page for browsing local files through backend path APIs, without uploading folder contents through the browser.

**Architecture:** Extend the existing `local_input_sources` backend primitive with a non-recursive directory entries API. Add a reusable frontend local resource API client and a stable `/local-files` page in the app shell. The first UI version focuses on path input, breadcrumbs, current-directory listing, and clear denied/error states; knowledge import reuse comes next.

**Tech Stack:** FastAPI, Python storage helpers, Vue 3, Element Plus, node:test structure tests, pytest/unittest backend tests.

---

### Task 1: Backend Non-Recursive Directory Browser API

**Files:**
- Modify: `backend/app/core/storage/local_input_sources.py`
- Modify: `backend/app/api/routes_local_input_sources.py`
- Test: `backend/tests/test_local_input_sources.py`

- [ ] **Step 1: Write failing tests**

Add tests that call `list_local_directory_entries()` directly and through `GET /api/local-input-sources/entries`. The expected behavior is that the response lists only the current directory, returns breadcrumbs, includes parent path, and does not recursively include nested files.

- [ ] **Step 2: Run tests to confirm failure**

Run: `python -m pytest backend/tests/test_local_input_sources.py -q`

Expected: fail because `list_local_directory_entries` and `/entries` do not exist.

- [ ] **Step 3: Implement minimal backend**

Add `list_local_directory_entries(path, read_roots=None)` that reuses `resolve_local_input_root`, `is_denied_local_input_path`, `_build_directory_entry`, and `_build_file_entry`, but only iterates one directory level. Add `/api/local-input-sources/entries`.

- [ ] **Step 4: Verify backend tests**

Run: `python -m pytest backend/tests/test_local_input_sources.py -q`

Expected: pass.

### Task 2: Frontend API Client

**Files:**
- Modify: `frontend/src/api/localInputSources.ts`
- Modify: `frontend/src/api/localInputSources.test.ts`

- [ ] **Step 1: Write failing tests**

Add a test for `fetchLocalDirectoryEntries("C:/Users/abyss")` that expects `/api/local-input-sources/entries?path=C%3A%2FUsers%2Fabyss` and a response with `kind: "local_directory_entries"`.

- [ ] **Step 2: Run test to confirm failure**

Run: `node --test frontend/src/api/localInputSources.test.ts`

Expected: fail because `fetchLocalDirectoryEntries` does not exist.

- [ ] **Step 3: Implement client types and function**

Add `LocalDirectoryEntry`, `LocalDirectoryEntries`, and `fetchLocalDirectoryEntries()`.

- [ ] **Step 4: Verify frontend API test**

Run: `node --test frontend/src/api/localInputSources.test.ts`

Expected: pass.

### Task 3: Stable Sidebar Page and Routing

**Files:**
- Modify: `frontend/src/lib/layout-mode.ts`
- Modify: `frontend/src/lib/layout-mode.test.ts`
- Modify: `frontend/src/lib/navigation.ts`
- Modify: `frontend/src/lib/navigation.test.ts`
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/router/index.structure.test.ts`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/i18n/additionalMessages.ts`
- Create: `frontend/src/pages/LocalFilesPage.vue`
- Create: `frontend/src/pages/LocalFilesPage.structure.test.ts`

- [ ] **Step 1: Write failing structure tests**

Add expectations that `/local-files` is a stable navigation item, router lazy-loads `LocalFilesPage`, and the page uses `fetchLocalDirectoryEntries`.

- [ ] **Step 2: Run targeted tests to confirm failure**

Run: `node --test frontend/src/lib/navigation.test.ts frontend/src/lib/layout-mode.test.ts frontend/src/router/index.structure.test.ts frontend/src/pages/LocalFilesPage.structure.test.ts`

Expected: fail because the page, route, navigation section, and tests are not implemented.

- [ ] **Step 3: Implement navigation and page**

Add a `FolderOpened` icon navigation item, route `/local-files`, layout section `localFiles`, i18n keys, and a page that renders path input, refresh button, breadcrumbs, entry list, and error/loading/empty states.

- [ ] **Step 4: Verify targeted frontend tests**

Run: `node --test frontend/src/lib/navigation.test.ts frontend/src/lib/layout-mode.test.ts frontend/src/router/index.structure.test.ts frontend/src/pages/LocalFilesPage.structure.test.ts frontend/src/api/localInputSources.test.ts`

Expected: pass.

### Task 4: Runtime Verification

**Files:**
- No new files unless visual verification finds a page-level bug.

- [ ] **Step 1: Run backend and frontend focused tests**

Run: `python -m pytest backend/tests/test_local_input_sources.py -q`

Run: `node --test frontend/src/api/localInputSources.test.ts frontend/src/lib/navigation.test.ts frontend/src/lib/layout-mode.test.ts frontend/src/router/index.structure.test.ts frontend/src/pages/LocalFilesPage.structure.test.ts`

- [ ] **Step 2: Restart TooGraph**

Run: `npm.cmd start`

Expected: TooGraph serves `http://127.0.0.1:3477` and releases any existing TooGraph process on that port.

- [ ] **Step 3: Browser verification**

Open `http://127.0.0.1:3477/local-files`, confirm the sidebar item is visible and active, the page loads the default path, and the file list has no obvious overflow.

- [ ] **Step 4: No commit**

Do not create a commit unless the user explicitly asks for one.

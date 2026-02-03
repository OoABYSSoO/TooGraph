import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDocumentMetaToWorkspaceTab,
  closeWorkspaceTab,
  createNewTabId,
  createUnsavedWorkspaceTab,
  EDITOR_WORKSPACE_STORAGE_KEY,
  ensureSavedGraphTab,
  isSameSavedGraph,
  readPersistedEditorWorkspace,
  resolveEditorUrl,
  writePersistedEditorWorkspace,
  type PersistedEditorWorkspace,
} from "./editor-workspace.ts";

function createStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

test("readPersistedEditorWorkspace returns empty workspace for malformed storage", () => {
  const storage = createStorageMock();
  storage.setItem(EDITOR_WORKSPACE_STORAGE_KEY, "{not-json");
  Object.assign(globalThis, { localStorage: storage });

  assert.deepEqual(readPersistedEditorWorkspace(), {
    activeTabId: null,
    tabs: [],
  });
});

test("writePersistedEditorWorkspace round-trips workspace metadata", () => {
  const storage = createStorageMock();
  Object.assign(globalThis, { localStorage: storage });
  const tab = createUnsavedWorkspaceTab({
    title: "知识库验证",
    kind: "template",
    templateId: "knowledge_validation",
    defaultTemplateId: "knowledge_validation",
  });
  const workspace: PersistedEditorWorkspace = {
    activeTabId: tab.tabId,
    tabs: [tab],
  };

  writePersistedEditorWorkspace(workspace);

  assert.deepEqual(readPersistedEditorWorkspace(), workspace);
});

test("resolveEditorUrl only uses graph id for saved graphs", () => {
  assert.equal(resolveEditorUrl(null), "/editor");
  assert.equal(resolveEditorUrl("graph_123"), "/editor/graph_123");
});

test("ensureSavedGraphTab activates an existing graph tab instead of duplicating it", () => {
  const first = createUnsavedWorkspaceTab({ title: "已有图", kind: "existing" });
  const workspace: PersistedEditorWorkspace = {
    activeTabId: first.tabId,
    tabs: [{ ...first, graphId: "graph_a" }],
  };

  const next = ensureSavedGraphTab(workspace, {
    graphId: "graph_a",
    title: "Graph A",
  });

  assert.equal(next.tabs.length, 1);
  assert.equal(next.activeTabId, first.tabId);
  assert.equal(next.tabs[0]?.title, "Graph A");
  assert.equal(isSameSavedGraph(next.tabs[0]!, "graph_a"), true);
});

test("closeWorkspaceTab keeps a valid active tab after removing the current tab", () => {
  const first = createUnsavedWorkspaceTab({ title: "A", kind: "existing" });
  const second = createUnsavedWorkspaceTab({ title: "B", kind: "new" });
  const third = createUnsavedWorkspaceTab({ title: "C", kind: "template", templateId: "hello_world" });
  const workspace: PersistedEditorWorkspace = {
    activeTabId: second.tabId,
    tabs: [first, second, third],
  };

  const next = closeWorkspaceTab(workspace, second.tabId);

  assert.deepEqual(
    next.tabs.map((tab) => tab.tabId),
    [first.tabId, third.tabId],
  );
  assert.equal(next.activeTabId, third.tabId);
});

test("applyDocumentMetaToWorkspaceTab is a no-op when metadata is unchanged", () => {
  const tab = {
    ...createUnsavedWorkspaceTab({ title: "知识库验证", kind: "new" }),
    kind: "existing" as const,
    dirty: true,
    graphId: "graph_a",
  };
  const workspace: PersistedEditorWorkspace = {
    activeTabId: tab.tabId,
    tabs: [tab],
  };

  const next = applyDocumentMetaToWorkspaceTab(workspace, tab.tabId, {
    title: "知识库验证",
    dirty: true,
    graphId: "graph_a",
  });

  assert.equal(next, workspace);
});

test("applyDocumentMetaToWorkspaceTab updates the target tab when metadata changes", () => {
  const tab = createUnsavedWorkspaceTab({ title: "初始图", kind: "new" });
  const workspace: PersistedEditorWorkspace = {
    activeTabId: tab.tabId,
    tabs: [tab],
  };

  const next = applyDocumentMetaToWorkspaceTab(workspace, tab.tabId, {
    title: "新标题",
    dirty: true,
    graphId: "graph_saved",
  });

  assert.notEqual(next, workspace);
  assert.equal(next.tabs[0]?.title, "新标题");
  assert.equal(next.tabs[0]?.dirty, true);
  assert.equal(next.tabs[0]?.graphId, "graph_saved");
  assert.equal(next.tabs[0]?.kind, "existing");
});

test("createNewTabId generates non-empty distinct ids", () => {
  const first = createNewTabId();
  const second = createNewTabId();

  assert.notEqual(first, "");
  assert.notEqual(second, "");
  assert.notEqual(first, second);
});

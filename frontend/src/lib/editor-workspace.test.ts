import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDocumentMetaToWorkspaceTab,
  closeWorkspaceTab,
  closeWorkspaceTabTransition,
  createNewTabId,
  createUnsavedWorkspaceTab,
  EDITOR_WORKSPACE_DOCUMENTS_STORAGE_KEY,
  EDITOR_WORKSPACE_STORAGE_KEY,
  ensureSavedGraphTab,
  isSameSavedGraph,
  prunePersistedEditorDocumentDrafts,
  readPersistedEditorDocumentDraft,
  readPersistedEditorWorkspace,
  reorderWorkspaceTab,
  removePersistedEditorDocumentDraft,
  resolveEditorUrl,
  resolveWorkspaceTabUrl,
  writePersistedEditorDocumentDraft,
  writePersistedEditorWorkspace,
  type PersistedEditorWorkspace,
} from "./editor-workspace.ts";

import type { GraphPayload } from "../types/node-system.ts";

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

test("persisted editor document drafts preserve agent thinking level exactly", () => {
  const storage = createStorageMock();
  Object.assign(globalThis, { localStorage: storage });
  const draft: GraphPayload = {
    graph_id: "graph_a",
    name: "Draft Graph",
    state_schema: {},
    nodes: {
      agent_1: {
        kind: "agent",
        name: "agent",
        description: "",
        ui: { position: { x: 10, y: 20 } },
        reads: [],
        writes: [],
        config: {
          skills: [],
          taskInstruction: "Say hi",
          modelSource: "global",
          model: "gpt-5.5",
          thinkingMode: "low",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  writePersistedEditorDocumentDraft("tab_a", draft);

  assert.deepEqual(readPersistedEditorDocumentDraft("tab_a"), draft);
  assert.match(storage.getItem(EDITOR_WORKSPACE_DOCUMENTS_STORAGE_KEY) ?? "", /"thinkingMode":"low"/);
});

test("persisted editor document drafts can be pruned and removed by tab id", () => {
  const storage = createStorageMock();
  Object.assign(globalThis, { localStorage: storage });
  const firstDraft: GraphPayload = {
    graph_id: null,
    name: "First",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
  const secondDraft: GraphPayload = {
    ...firstDraft,
    name: "Second",
  };

  writePersistedEditorDocumentDraft("tab_a", firstDraft);
  writePersistedEditorDocumentDraft("tab_b", secondDraft);
  prunePersistedEditorDocumentDrafts(["tab_b"]);

  assert.equal(readPersistedEditorDocumentDraft("tab_a"), null);
  assert.deepEqual(readPersistedEditorDocumentDraft("tab_b"), secondDraft);

  removePersistedEditorDocumentDraft("tab_b");

  assert.equal(readPersistedEditorDocumentDraft("tab_b"), null);
});

test("resolveEditorUrl only uses graph id for saved graphs", () => {
  assert.equal(resolveEditorUrl(null), "/editor");
  assert.equal(resolveEditorUrl("graph_123"), "/editor/graph_123");
});

test("resolveWorkspaceTabUrl keeps unsaved drafts on /editor/new", () => {
  const draftTab = createUnsavedWorkspaceTab({ title: "空白图", kind: "new" });
  const templateTab = createUnsavedWorkspaceTab({
    title: "Hello World",
    kind: "template",
    templateId: "hello_world",
    defaultTemplateId: "hello_world",
  });
  const savedTab = {
    ...createUnsavedWorkspaceTab({ title: "已保存图", kind: "existing" as const }),
    graphId: "graph_123",
    kind: "existing" as const,
  };

  assert.equal(resolveWorkspaceTabUrl(draftTab), "/editor/new");
  assert.equal(resolveWorkspaceTabUrl(templateTab), "/editor/new?template=hello_world");
  assert.equal(resolveWorkspaceTabUrl(savedTab), "/editor/graph_123");
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

test("reorderWorkspaceTab moves a tab before a target tab without changing the active tab", () => {
  const first = createUnsavedWorkspaceTab({ title: "A", kind: "existing" });
  const second = createUnsavedWorkspaceTab({ title: "B", kind: "new" });
  const third = createUnsavedWorkspaceTab({ title: "C", kind: "template", templateId: "hello_world" });
  const workspace: PersistedEditorWorkspace = {
    activeTabId: second.tabId,
    tabs: [first, second, third],
  };

  const next = reorderWorkspaceTab(workspace, third.tabId, first.tabId, "before");

  assert.deepEqual(
    next.tabs.map((tab) => tab.tabId),
    [third.tabId, first.tabId, second.tabId],
  );
  assert.equal(next.activeTabId, second.tabId);
});

test("reorderWorkspaceTab moves a tab after a target tab", () => {
  const first = createUnsavedWorkspaceTab({ title: "A", kind: "existing" });
  const second = createUnsavedWorkspaceTab({ title: "B", kind: "new" });
  const third = createUnsavedWorkspaceTab({ title: "C", kind: "template", templateId: "hello_world" });
  const workspace: PersistedEditorWorkspace = {
    activeTabId: first.tabId,
    tabs: [first, second, third],
  };

  const next = reorderWorkspaceTab(workspace, first.tabId, third.tabId, "after");

  assert.deepEqual(
    next.tabs.map((tab) => tab.tabId),
    [second.tabId, third.tabId, first.tabId],
  );
});

test("closeWorkspaceTabTransition returns empty workspace and null route target when closing the last active tab", () => {
  const only = {
    ...createUnsavedWorkspaceTab({ title: "唯一图", kind: "existing" }),
    graphId: "graph_only",
  };
  const workspace: PersistedEditorWorkspace = {
    activeTabId: only.tabId,
    tabs: [only],
  };

  const transition = closeWorkspaceTabTransition(workspace, only.tabId);

  assert.deepEqual(transition.workspace, {
    activeTabId: null,
    tabs: [],
  });
  assert.equal(transition.closedActiveTab, true);
  assert.equal(transition.nextGraphId, null);
});

test("closeWorkspaceTabTransition leaves route target unset when closing an inactive tab", () => {
  const first = {
    ...createUnsavedWorkspaceTab({ title: "A", kind: "existing" }),
    graphId: "graph_a",
  };
  const second = {
    ...createUnsavedWorkspaceTab({ title: "B", kind: "existing" }),
    graphId: "graph_b",
  };
  const workspace: PersistedEditorWorkspace = {
    activeTabId: first.tabId,
    tabs: [first, second],
  };

  const transition = closeWorkspaceTabTransition(workspace, second.tabId);

  assert.equal(transition.closedActiveTab, false);
  assert.equal(transition.nextGraphId, null);
  assert.equal(transition.workspace.activeTabId, first.tabId);
  assert.deepEqual(
    transition.workspace.tabs.map((tab) => tab.tabId),
    [first.tabId],
  );
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

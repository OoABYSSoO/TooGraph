import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDocumentMetaToWorkspaceTab,
  closeWorkspaceTab,
  closeWorkspaceTabTransition,
  createNewTabId,
  createSubgraphWorkspaceTab,
  createUnsavedWorkspaceTab,
  EDITOR_WORKSPACE_DOCUMENTS_STORAGE_KEY,
  EDITOR_WORKSPACE_STORAGE_KEY,
  EDITOR_WORKSPACE_VIEWPORTS_STORAGE_KEY,
  ensureSavedGraphTab,
  isSameSavedGraph,
  prunePersistedEditorDocumentDrafts,
  prunePersistedEditorViewportDrafts,
  readPersistedEditorDocumentDraft,
  readPersistedEditorViewportDraft,
  readPersistedEditorWorkspace,
  reorderWorkspaceTab,
  removePersistedEditorDocumentDraft,
  removePersistedEditorViewportDraft,
  resolveEditorUrl,
  resolveWorkspaceTabUrl,
  formatSubgraphWorkspaceTabTitle,
  writePersistedEditorDocumentDraft,
  writePersistedEditorViewportDraft,
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

test("createSubgraphWorkspaceTab records source metadata and labels the tab as a subgraph", () => {
  const tab = createSubgraphWorkspaceTab({
    parentTabId: "parent_tab",
    parentGraphId: "graph_parent",
    parentTitle: "Untitled Graph",
    nodeId: "node_subgraph",
    nodeName: "高级联网搜索 Subgraph",
  });

  assert.equal(tab.kind, "subgraph");
  assert.equal(tab.graphId, null);
  assert.equal(tab.title, "子图 · 高级联网搜索 Subgraph");
  assert.equal(tab.dirty, false);
  assert.deepEqual(tab.subgraphSource, {
    parentTabId: "parent_tab",
    parentGraphId: "graph_parent",
    parentTitle: "Untitled Graph",
    nodeId: "node_subgraph",
    nodeName: "高级联网搜索 Subgraph",
  });
});

test("persisted workspace round-trips subgraph tabs with their parent source", () => {
  const storage = createStorageMock();
  Object.assign(globalThis, { localStorage: storage });
  const tab = createSubgraphWorkspaceTab({
    parentTabId: "parent_tab",
    parentGraphId: null,
    parentTitle: "Parent Draft",
    nodeId: "node_subgraph",
    nodeName: "Research Subgraph",
  });
  const workspace: PersistedEditorWorkspace = {
    activeTabId: tab.tabId,
    tabs: [tab],
  };

  writePersistedEditorWorkspace(workspace);

  assert.deepEqual(readPersistedEditorWorkspace(), workspace);
});

test("applyDocumentMetaToWorkspaceTab keeps subgraph tabs attached to the parent node instead of converting them to saved graphs", () => {
  const tab = createSubgraphWorkspaceTab({
    parentTabId: "parent_tab",
    parentGraphId: "graph_parent",
    parentTitle: "Parent Graph",
    nodeId: "node_subgraph",
    nodeName: "Original Subgraph",
  });
  const workspace: PersistedEditorWorkspace = {
    activeTabId: tab.tabId,
    tabs: [tab],
  };

  const next = applyDocumentMetaToWorkspaceTab(workspace, tab.tabId, {
    title: "Renamed Subgraph",
    dirty: true,
    graphId: "graph_saved_should_not_attach",
  });

  assert.notEqual(next, workspace);
  assert.equal(next.tabs[0]?.kind, "subgraph");
  assert.equal(next.tabs[0]?.graphId, null);
  assert.equal(next.tabs[0]?.title, formatSubgraphWorkspaceTabTitle("Renamed Subgraph"));
  assert.equal(next.tabs[0]?.dirty, true);
  assert.equal(next.tabs[0]?.subgraphSource?.nodeName, "Renamed Subgraph");
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
          skillKey: "",
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

test("persisted editor document drafts repair legacy web research answer writer state mapping", () => {
  const storage = createStorageMock();
  Object.assign(globalThis, { localStorage: storage });
  const draft: GraphPayload = {
    graph_id: null,
    name: "联网研究循环",
    state_schema: {
      state_1: { name: "request", description: "", type: "text", value: "", color: "" },
      state_4: { name: "research_notes", description: "", type: "markdown", value: "", color: "" },
      state_5: { name: "needs_more_search", description: "", type: "boolean", value: false, color: "" },
      state_6: { name: "final_answer", description: "", type: "markdown", value: "", color: "" },
      state_7: { name: "exhausted_answer", description: "", type: "markdown", value: "", color: "" },
    },
    nodes: {
      need_more_search_check: {
        kind: "condition",
        name: "need_more_search_check",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "state_5", required: true }],
        writes: [],
        config: {
          branches: ["true", "false", "exhausted"],
          loopLimit: 3,
          branchMapping: { true: "true", false: "false" },
          rule: { source: "state_5", operator: "==", value: true },
        },
      },
      web_search_agent: {
        kind: "agent",
        name: "web_search_agent",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "state_1", required: true }],
        writes: [{ state: "state_4", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0.2,
        },
      },
      final_answer_writer: {
        kind: "agent",
        name: "final_answer_writer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "state_4", required: true }],
        writes: [{ state: "state_7", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "严格返回 JSON，字段 final_answer 为 Markdown 字符串。",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0.2,
        },
      },
      exhausted_answer_writer: {
        kind: "agent",
        name: "exhausted_answer_writer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "state_4", required: true }],
        writes: [{ state: "state_6", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "严格返回 JSON，字段 exhausted_answer 为 Markdown 字符串。",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0.2,
        },
      },
      output_final_answer: {
        kind: "output",
        name: "output_final_answer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "state_6", required: true }],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
      output_exhausted_answer: {
        kind: "output",
        name: "output_exhausted_answer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "state_7", required: true }],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [
      { source: "final_answer_writer", target: "output_final_answer" },
      { source: "exhausted_answer_writer", target: "output_exhausted_answer" },
    ],
    conditional_edges: [
      {
        source: "need_more_search_check",
        branches: {
          true: "web_search_agent",
          false: "final_answer_writer",
          exhausted: "exhausted_answer_writer",
        },
      },
    ],
    metadata: {},
  };
  storage.setItem(EDITOR_WORKSPACE_DOCUMENTS_STORAGE_KEY, JSON.stringify({ tab_a: draft }));

  const repaired = readPersistedEditorDocumentDraft("tab_a");

  assert.equal(repaired?.nodes.final_answer_writer?.writes[0]?.state, "state_6");
  assert.equal(repaired?.nodes.exhausted_answer_writer?.writes[0]?.state, "state_7");
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

test("persisted editor viewport drafts preserve canvas zoom state by tab id", () => {
  const storage = createStorageMock();
  Object.assign(globalThis, { localStorage: storage });

  writePersistedEditorViewportDraft("tab_a", { x: -120, y: 40, scale: 1.4 });

  assert.deepEqual(readPersistedEditorViewportDraft("tab_a"), { x: -120, y: 40, scale: 1.4 });
  assert.match(storage.getItem(EDITOR_WORKSPACE_VIEWPORTS_STORAGE_KEY) ?? "", /"scale":1.4/);
});

test("persisted editor viewport drafts normalize invalid values and can be pruned", () => {
  const storage = createStorageMock();
  Object.assign(globalThis, { localStorage: storage });
  storage.setItem(
    EDITOR_WORKSPACE_VIEWPORTS_STORAGE_KEY,
    JSON.stringify({
      tab_a: { x: 10, y: 20, scale: 9 },
      tab_b: { x: "bad", y: 0, scale: 1 },
      tab_c: { x: -5, y: 12, scale: 0.75 },
    }),
  );

  assert.deepEqual(readPersistedEditorViewportDraft("tab_a"), { x: 10, y: 20, scale: 2.2 });
  assert.equal(readPersistedEditorViewportDraft("tab_b"), null);
  prunePersistedEditorViewportDrafts(["tab_c"]);

  assert.equal(readPersistedEditorViewportDraft("tab_a"), null);
  assert.deepEqual(readPersistedEditorViewportDraft("tab_c"), { x: -5, y: 12, scale: 0.75 });

  removePersistedEditorViewportDraft("tab_c");
  assert.equal(readPersistedEditorViewportDraft("tab_c"), null);
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
    templateId: "starter_graph",
    defaultTemplateId: "starter_graph",
  });
  const savedTab = {
    ...createUnsavedWorkspaceTab({ title: "已保存图", kind: "existing" as const }),
    graphId: "graph_123",
    kind: "existing" as const,
  };

  assert.equal(resolveWorkspaceTabUrl(draftTab), "/editor/new");
  assert.equal(resolveWorkspaceTabUrl(templateTab), "/editor/new?template=starter_graph");
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
  const third = createUnsavedWorkspaceTab({ title: "C", kind: "template", templateId: "starter_graph" });
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
  const third = createUnsavedWorkspaceTab({ title: "C", kind: "template", templateId: "starter_graph" });
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
  const third = createUnsavedWorkspaceTab({ title: "C", kind: "template", templateId: "starter_graph" });
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

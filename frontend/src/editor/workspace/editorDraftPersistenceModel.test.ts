import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasViewport } from "../canvas/canvasViewport.ts";
import type { EditorWorkspaceTab, PersistedEditorWorkspace } from "../../lib/editor-workspace.ts";
import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";

import {
  buildNextCanvasViewportDrafts,
  listTabsMissingDocumentDrafts,
  listTabsMissingViewportDrafts,
  resolveExistingGraphDocumentHydrationSource,
  resolveUnsavedGraphDocumentHydrationSource,
  resolveWorkspaceDraftPersistenceRequest,
  shouldHydrateExistingGraphDocument,
  shouldRunWorkspaceDraftHydration,
} from "./editorDraftPersistenceModel.ts";

const viewportA: CanvasViewport = { x: 10, y: 20, scale: 1.25 };
const viewportB: CanvasViewport = { x: -30, y: 40, scale: 0.8 };

function createTab(tabId: string): EditorWorkspaceTab {
  return {
    tabId,
    kind: "new",
    graphId: null,
    title: tabId,
    dirty: false,
    templateId: null,
    defaultTemplateId: null,
    subgraphSource: null,
  };
}

function createDocument(name: string): GraphPayload {
  return {
    graph_id: null,
    name,
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

function createSavedDocument(name: string): GraphDocument {
  return {
    ...createDocument(name),
    graph_id: `graph_${name.toLowerCase()}`,
  };
}

test("listTabsMissingViewportDrafts returns workspace tab ids without loaded viewport drafts", () => {
  assert.deepEqual(
    listTabsMissingViewportDrafts([createTab("tab_a"), createTab("tab_b"), createTab("tab_c")], {
      tab_b: viewportB,
    }),
    ["tab_a", "tab_c"],
  );
});

test("buildNextCanvasViewportDrafts skips identical viewport updates", () => {
  const current = { tab_a: viewportA };

  assert.equal(buildNextCanvasViewportDrafts(current, "tab_a", { ...viewportA }), null);
});

test("buildNextCanvasViewportDrafts writes changed viewport drafts immutably", () => {
  const current = { tab_a: viewportA };
  const next = buildNextCanvasViewportDrafts(current, "tab_a", viewportB);

  assert.deepEqual(next, { tab_a: viewportB });
  assert.notEqual(next, current);
  assert.deepEqual(current, { tab_a: viewportA });
});

test("buildNextCanvasViewportDrafts adds missing viewport drafts immutably", () => {
  const current = { tab_a: viewportA };
  const next = buildNextCanvasViewportDrafts(current, "tab_b", viewportB);

  assert.deepEqual(next, { tab_a: viewportA, tab_b: viewportB });
  assert.notEqual(next, current);
});

test("listTabsMissingDocumentDrafts returns unsaved tabs without loaded documents", () => {
  const existingTab: EditorWorkspaceTab = { ...createTab("tab_existing"), kind: "existing", graphId: "graph_1" };

  assert.deepEqual(
    listTabsMissingDocumentDrafts([createTab("tab_a"), existingTab, createTab("tab_b")], {
      tab_b: createDocument("Loaded"),
    }).map((tab) => tab.tabId),
    ["tab_a"],
  );
});

test("resolveUnsavedGraphDocumentHydrationSource prefers persisted drafts before seed documents", () => {
  const persisted = createDocument("Persisted");

  assert.deepEqual(resolveUnsavedGraphDocumentHydrationSource(persisted), { type: "persisted", document: persisted });
  assert.deepEqual(resolveUnsavedGraphDocumentHydrationSource(null), { type: "seed" });
});

test("shouldHydrateExistingGraphDocument skips already loaded or loading graph tabs", () => {
  assert.equal(shouldHydrateExistingGraphDocument({ hasDocument: true, isLoading: false }), false);
  assert.equal(shouldHydrateExistingGraphDocument({ hasDocument: false, isLoading: true }), false);
  assert.equal(shouldHydrateExistingGraphDocument({ hasDocument: false, isLoading: false }), true);
});

test("resolveExistingGraphDocumentHydrationSource chooses persisted, cached, then fetch", () => {
  const persisted = createDocument("Persisted");
  const cached = createSavedDocument("Cached");

  assert.deepEqual(resolveExistingGraphDocumentHydrationSource({ persistedDraft: persisted, cachedGraph: cached }), {
    type: "persisted",
    document: persisted,
  });
  assert.deepEqual(resolveExistingGraphDocumentHydrationSource({ persistedDraft: null, cachedGraph: cached }), {
    type: "cached-graph",
    graph: cached,
  });
  assert.deepEqual(resolveExistingGraphDocumentHydrationSource({ persistedDraft: null, cachedGraph: null }), {
    type: "fetch",
  });
});

test("resolveWorkspaceDraftPersistenceRequest waits for hydration before writing workspace drafts", () => {
  const workspace: PersistedEditorWorkspace = {
    activeTabId: "tab_b",
    tabs: [createTab("tab_a"), createTab("tab_b")],
  };

  assert.equal(resolveWorkspaceDraftPersistenceRequest({ hydrated: false, workspace }), null);
  assert.deepEqual(resolveWorkspaceDraftPersistenceRequest({ hydrated: true, workspace }), {
    workspace,
    tabIds: ["tab_a", "tab_b"],
  });
});

test("shouldRunWorkspaceDraftHydration follows the shell hydration gate", () => {
  assert.equal(shouldRunWorkspaceDraftHydration(false), false);
  assert.equal(shouldRunWorkspaceDraftHydration(true), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type { CanvasViewport } from "@/editor/canvas/canvasViewport";
import {
  EDITOR_WORKSPACE_DOCUMENTS_STORAGE_KEY,
  readPersistedEditorDocumentDraft,
  type PersistedEditorWorkspace,
} from "../../lib/editor-workspace.ts";
import type { GraphPayload } from "@/types/node-system";

import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";
import { useWorkspaceDocumentState } from "./useWorkspaceDocumentState.ts";

function graphDocument(name: string = "Graph A"): GraphPayload {
  return {
    graph_id: null,
    name,
    nodes: {},
    edges: [],
    conditional_edges: [],
    state_schema: {},
    metadata: {},
    version: 1,
  } as unknown as GraphPayload;
}

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

function createDocumentHarness() {
  const workspace = ref<PersistedEditorWorkspace>({
    activeTabId: "tab_a",
    tabs: [
      {
        tabId: "tab_a",
        kind: "new",
        graphId: null,
        title: "Draft",
        dirty: false,
        templateId: null,
        defaultTemplateId: null,
      },
    ],
  });
  const documentsByTabId = ref<Record<string, GraphPayload>>({});
  const loadingByTabId = ref<Record<string, boolean>>({ tab_a: true });
  const errorByTabId = ref<Record<string, string | null>>({ tab_a: "Loading" });
  const feedbackByTabId = ref<Record<string, WorkspaceRunFeedback | null>>({});
  const viewportByTabId = ref<Record<string, CanvasViewport>>({});
  const messages: Array<{ tabId: string; message: string }> = [];
  let guardBlocked = false;

  const controller = useWorkspaceDocumentState({
    workspace,
    documentsByTabId,
    loadingByTabId,
    errorByTabId,
    feedbackByTabId,
    viewportByTabId,
    updateWorkspace: (nextWorkspace) => {
      workspace.value = nextWorkspace;
    },
    setMessageFeedbackForTab: (tabId, input) => {
      messages.push({ tabId, message: input.message });
    },
    guardGraphEditForTab: () => guardBlocked,
  });

  return {
    workspace,
    documentsByTabId,
    loadingByTabId,
    errorByTabId,
    feedbackByTabId,
    viewportByTabId,
    messages,
    setGuardBlocked: (nextBlocked: boolean) => {
      guardBlocked = nextBlocked;
    },
    controller,
  };
}

test("useWorkspaceDocumentState registers documents and initializes tab feedback", () => {
  const harness = createDocumentHarness();

  harness.controller.registerDocumentForTab("tab_a", graphDocument());

  assert.equal(harness.documentsByTabId.value.tab_a.name, "Graph A");
  assert.equal(harness.loadingByTabId.value.tab_a, false);
  assert.equal(harness.errorByTabId.value.tab_a, null);
  assert.deepEqual(harness.messages, [{ tabId: "tab_a", message: "Ready to edit Graph A." }]);
});

test("useWorkspaceDocumentState does not persist clean registered documents as dirty drafts", () => {
  const storage = createStorageMock();
  Object.assign(globalThis, { localStorage: storage });
  const harness = createDocumentHarness();

  harness.controller.registerDocumentForTab("tab_a", graphDocument());

  assert.equal(storage.getItem(EDITOR_WORKSPACE_DOCUMENTS_STORAGE_KEY), null);
  assert.equal(readPersistedEditorDocumentDraft("tab_a"), null);
});

test("useWorkspaceDocumentState skips ready feedback when tab feedback already exists", () => {
  const harness = createDocumentHarness();
  harness.feedbackByTabId.value = {
    tab_a: {
      tone: "neutral",
      message: "Existing",
      summary: { idle: 0, running: 0, paused: 0, success: 0, failed: 0 },
      currentNodeLabel: null,
    },
  };

  harness.controller.registerDocumentForTab("tab_a", graphDocument());

  assert.deepEqual(harness.messages, []);
});

test("useWorkspaceDocumentState commits dirty document metadata through the workspace updater", () => {
  const storage = createStorageMock();
  Object.assign(globalThis, { localStorage: storage });
  const harness = createDocumentHarness();

  harness.controller.commitDirtyDocumentForTab("tab_a", graphDocument("Renamed Graph"));

  assert.equal(harness.documentsByTabId.value.tab_a.name, "Renamed Graph");
  assert.equal(harness.workspace.value.tabs[0]?.title, "Renamed Graph");
  assert.equal(harness.workspace.value.tabs[0]?.dirty, true);
  assert.equal(readPersistedEditorDocumentDraft("tab_a")?.name, "Renamed Graph");
});

test("useWorkspaceDocumentState honors locked graph edit guards before dirty commits", () => {
  const harness = createDocumentHarness();
  harness.setGuardBlocked(true);

  harness.controller.markDocumentDirty("tab_a", graphDocument("Blocked Graph"));

  assert.equal(harness.documentsByTabId.value.tab_a, undefined);
  assert.equal(harness.workspace.value.tabs[0]?.title, "Draft");
});

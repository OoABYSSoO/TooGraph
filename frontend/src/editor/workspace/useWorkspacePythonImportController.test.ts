import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type { EditorWorkspaceTab, PersistedEditorWorkspace } from "@/lib/editor-workspace";
import type { GraphPayload } from "@/types/node-system";

import { useWorkspacePythonImportController } from "./useWorkspacePythonImportController.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

function graphDocument(name: string): GraphPayload {
  return {
    graph_id: null,
    name,
    nodes: {},
    edges: [],
    conditional_edges: [],
    state_schema: {},
    metadata: {},
  };
}

function createFile(name: string, source: string) {
  return {
    name,
    text: async () => source,
  };
}

function createHarness() {
  const initialTab: EditorWorkspaceTab = {
    tabId: "tab_a",
    kind: "new",
    graphId: null,
    title: "Draft",
    dirty: false,
    templateId: null,
    defaultTemplateId: null,
    subgraphSource: null,
  };
  const activeTab = ref<EditorWorkspaceTab | null>(initialTab);
  const workspace = ref<PersistedEditorWorkspace>({
    activeTabId: "tab_a",
    tabs: [initialTab],
  });
  const documentsByTabId = ref<Record<string, GraphPayload>>({
    tab_a: graphDocument("Draft"),
  });
  const clicked = { count: 0 };
  const registeredDocuments: Array<{ tabId: string; document: GraphPayload }> = [];
  const routeTabs: Array<{ kind: string; mode?: string }> = [];
  const feedback: Array<{ tabId: string; feedback: Partial<WorkspaceRunFeedback> }> = [];
  const importedSources: string[] = [];
  const handledRouteSignature = ref<string | null>(null);

  const controller = useWorkspacePythonImportController({
    activeTab,
    workspace,
    handledRouteSignature,
    clickPythonGraphImportInput: () => {
      clicked.count += 1;
    },
    registerDocumentForTab: (tabId, document) => {
      registeredDocuments.push({ tabId, document });
      documentsByTabId.value = { ...documentsByTabId.value, [tabId]: document };
    },
    updateWorkspace: (nextWorkspace) => {
      workspace.value = nextWorkspace;
      activeTab.value = nextWorkspace.tabs.find((tab) => tab.tabId === nextWorkspace.activeTabId) ?? null;
    },
    syncRouteToTab: (tab, mode) => {
      routeTabs.push({ kind: tab.kind, mode });
    },
    importGraphFromPythonSource: async (source) => {
      importedSources.push(source);
      return graphDocument("Imported Flow");
    },
    isGraphiteUiPythonExportSource: (source) => source.includes("GraphiteUI"),
    setMessageFeedbackForTab: (tabId, nextFeedback) => {
      feedback.push({ tabId, feedback: nextFeedback });
    },
  });

  return {
    activeTab,
    workspace,
    documentsByTabId,
    clicked,
    registeredDocuments,
    routeTabs,
    feedback,
    importedSources,
    handledRouteSignature,
    controller,
  };
}

test("useWorkspacePythonImportController imports GraphiteUI Python exports as dirty new tabs", async () => {
  const harness = createHarness();
  const input = {
    files: [createFile("flow.py", "# GraphiteUI export")],
    value: "flow.py",
  };

  harness.controller.openPythonGraphImportDialog();
  await harness.controller.handlePythonGraphImportSelection({ currentTarget: input } as unknown as Event);

  assert.equal(harness.clicked.count, 1);
  assert.equal(input.value, "");
  assert.deepEqual(harness.importedSources, ["# GraphiteUI export"]);
  assert.equal(harness.workspace.value.tabs.length, 2);
  assert.equal(harness.workspace.value.activeTabId, harness.workspace.value.tabs[1]?.tabId);
  assert.equal(harness.workspace.value.tabs[1]?.title, "Imported Flow");
  assert.equal(harness.workspace.value.tabs[1]?.dirty, true);
  assert.equal(harness.registeredDocuments[0]?.document.name, "Imported Flow");
  assert.deepEqual(harness.routeTabs, [{ kind: "new", mode: undefined }]);
  assert.equal(harness.handledRouteSignature.value, "new:");
  assert.equal(harness.feedback.at(-1)?.feedback.tone, "success");
  assert.equal(harness.feedback.at(-1)?.feedback.message, "Imported graph from flow.py.");
});

test("useWorkspacePythonImportController warns for non-export files unless fallback node import is allowed", async () => {
  const harness = createHarness();

  const blocked = await harness.controller.importPythonGraphFile(createFile("plain.py", "print('plain')"), { fallbackToFileNode: false });
  const fallback = await harness.controller.importPythonGraphFile(createFile("plain.txt", "plain text"), { fallbackToFileNode: true });

  assert.equal(blocked, false);
  assert.equal(fallback, false);
  assert.equal(harness.workspace.value.tabs.length, 1);
  assert.equal(harness.feedback.length, 1);
  assert.equal(harness.feedback[0]?.feedback.tone, "warning");
  assert.equal(harness.feedback[0]?.feedback.message, "plain.py is not a GraphiteUI Python export.");
});

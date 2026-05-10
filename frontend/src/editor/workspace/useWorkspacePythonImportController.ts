import type { ComputedRef, Ref } from "vue";

import { cloneGraphDocument } from "../../lib/graph-document.ts";
import { createUnsavedWorkspaceTab, type EditorWorkspaceTab, type PersistedEditorWorkspace } from "../../lib/editor-workspace.ts";
import type { GraphPayload } from "../../types/node-system.ts";

import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

type WorkspaceRouteTab = Pick<EditorWorkspaceTab, "graphId" | "kind" | "templateId" | "defaultTemplateId" | "subgraphSource">;

type PythonImportFile = {
  name: string;
  text: () => Promise<string>;
};

type PythonImportSelectionTarget = {
  files?: ArrayLike<PythonImportFile> | null;
  value?: string;
};

type WorkspacePythonImportControllerInput = {
  activeTab: ComputedRef<EditorWorkspaceTab | null> | Ref<EditorWorkspaceTab | null>;
  workspace: Ref<PersistedEditorWorkspace>;
  handledRouteSignature: Ref<string | null>;
  clickPythonGraphImportInput: () => void;
  registerDocumentForTab: (tabId: string, document: GraphPayload) => void;
  updateWorkspace: (nextWorkspace: PersistedEditorWorkspace) => void;
  syncRouteToTab: (tab: WorkspaceRouteTab, mode?: "push" | "replace") => void;
  importGraphFromPythonSource: (source: string) => Promise<GraphPayload>;
  isTooGraphPythonExportSource: (source: string) => boolean;
  setMessageFeedbackForTab: (
    tabId: string,
    feedback: { tone: WorkspaceRunFeedback["tone"]; message: string; activeRunId?: string | null; activeRunStatus?: string | null },
  ) => void;
};

function getPythonImportSelectionTarget(event: Event): PythonImportSelectionTarget | null {
  const target = event.currentTarget;
  if (!target || typeof target !== "object" || !("files" in target)) {
    return null;
  }
  return target as PythonImportSelectionTarget;
}

export function useWorkspacePythonImportController(input: WorkspacePythonImportControllerInput) {
  function openImportedGraphTab(graph: GraphPayload, fileName: string) {
    const importedGraph = cloneGraphDocument({
      ...graph,
      graph_id: null,
      name: graph.name?.trim() || fileName.replace(/\.py$/i, "") || "Imported Graph",
    });
    const tab = {
      ...createUnsavedWorkspaceTab({
        kind: "new",
        title: importedGraph.name,
      }),
      dirty: true,
    };

    input.registerDocumentForTab(tab.tabId, importedGraph);
    input.updateWorkspace({
      activeTabId: tab.tabId,
      tabs: [...input.workspace.value.tabs, tab],
    });
    input.syncRouteToTab(tab);
    input.handledRouteSignature.value = "new:";
    input.setMessageFeedbackForTab(tab.tabId, {
      tone: "success",
      message: `Imported graph from ${fileName}.`,
    });
  }

  function openPythonGraphImportDialog() {
    input.clickPythonGraphImportInput();
  }

  async function handlePythonGraphImportSelection(event: Event) {
    const target = getPythonImportSelectionTarget(event);
    const file = target?.files?.[0] ?? null;
    if (target) {
      target.value = "";
    }
    if (!file) {
      return;
    }
    await importPythonGraphFile(file, { fallbackToFileNode: false });
  }

  async function importPythonGraphFile(file: PythonImportFile, options: { fallbackToFileNode: boolean }) {
    const source = await file.text();
    if (!input.isTooGraphPythonExportSource(source)) {
      if (!options.fallbackToFileNode) {
        const tab = input.activeTab.value;
        if (tab) {
          input.setMessageFeedbackForTab(tab.tabId, {
            tone: "warning",
            message: `${file.name} is not a TooGraph Python export.`,
          });
        }
      }
      return false;
    }

    try {
      const importedGraph = await input.importGraphFromPythonSource(source);
      openImportedGraphTab(importedGraph, file.name);
      return true;
    } catch (error) {
      const tab = input.activeTab.value;
      if (tab) {
        input.setMessageFeedbackForTab(tab.tabId, {
          tone: "warning",
          message: error instanceof Error ? error.message : "Failed to import TooGraph Python export.",
        });
      }
      return true;
    }
  }

  return {
    handlePythonGraphImportSelection,
    importPythonGraphFile,
    openPythonGraphImportDialog,
  };
}

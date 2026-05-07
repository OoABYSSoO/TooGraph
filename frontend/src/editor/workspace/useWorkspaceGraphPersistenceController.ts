import type { ComputedRef, Ref } from "vue";

import {
  cloneGraphDocument,
  pruneUnreferencedStateSchemaInDocument,
  updateSubgraphNodeGraphInDocument,
  updateNodeMetadataInDocument,
} from "../../lib/graph-document.ts";
import {
  applyDocumentMetaToWorkspaceTab,
  ensureSavedGraphTab,
  type EditorWorkspaceTab,
  type PersistedEditorWorkspace,
} from "../../lib/editor-workspace.ts";
import type {
  GraphCorePayload,
  GraphDocument,
  GraphPayload,
  GraphSaveResponse,
  GraphValidationResponse,
  TemplateSaveResponse,
} from "../../types/node-system.ts";

import { buildPythonExportFileName } from "./pythonExportModel.ts";
import { formatValidationFeedback } from "./runFeedbackModel.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

type WorkspaceRouteTab = Pick<EditorWorkspaceTab, "graphId" | "kind" | "templateId" | "defaultTemplateId" | "subgraphSource">;

type WorkspaceGraphPersistenceControllerInput = {
  activeTab: ComputedRef<EditorWorkspaceTab | null> | Ref<EditorWorkspaceTab | null>;
  workspace: Ref<PersistedEditorWorkspace>;
  documentsByTabId: Ref<Record<string, GraphPayload | GraphDocument>>;
  guardGraphEditForTab: (tabId: string) => boolean;
  commitDirtyDocumentForTab: (tabId: string, document: GraphPayload | GraphDocument) => void;
  registerDocumentForTab: (tabId: string, document: GraphPayload | GraphDocument) => void;
  updateWorkspace: (nextWorkspace: PersistedEditorWorkspace) => void;
  updateWorkspaceTab: (tabId: string, updater: (tab: EditorWorkspaceTab) => EditorWorkspaceTab) => void;
  syncRouteToTab: (tab: WorkspaceRouteTab, mode: "push" | "replace") => void;
  loadGraphs: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  saveGraph: (document: GraphPayload | GraphDocument) => Promise<GraphSaveResponse>;
  saveGraphAsTemplate: (document: GraphPayload | GraphDocument) => Promise<TemplateSaveResponse>;
  fetchGraph: (graphId: string) => Promise<GraphDocument>;
  validateGraph: (document: GraphPayload | GraphDocument) => Promise<GraphValidationResponse>;
  exportLangGraphPython: (document: GraphPayload | GraphDocument) => Promise<string>;
  downloadPythonSource: (source: string, fileName: string) => void;
  setMessageFeedbackForTab: (
    tabId: string,
    feedback: { tone: WorkspaceRunFeedback["tone"]; message: string; activeRunId?: string | null; activeRunStatus?: string | null },
  ) => void;
};

export function useWorkspaceGraphPersistenceController(input: WorkspaceGraphPersistenceControllerInput) {
  function renameActiveGraph(name: string) {
    const tab = input.activeTab.value;
    if (!tab) {
      return;
    }
    if (input.guardGraphEditForTab(tab.tabId)) {
      return;
    }
    const document = input.documentsByTabId.value[tab.tabId];
    if (!document) {
      return;
    }

    const nextDocument = cloneGraphDocument(document);
    nextDocument.name = name;
    input.commitDirtyDocumentForTab(tab.tabId, nextDocument);
  }

  async function saveTab(tabId: string) {
    const document = input.documentsByTabId.value[tabId];
    if (!document) {
      return false;
    }
    const tab = input.workspace.value.tabs.find((candidate) => candidate.tabId === tabId) ?? null;
    if (!tab) {
      return false;
    }
    if (tab.kind === "subgraph") {
      return saveSubgraphTab(tab, document);
    }

    try {
      const documentToSave = pruneUnreferencedStateSchemaInDocument(document);
      const response = await input.saveGraph(documentToSave);
      const savedGraph = await input.fetchGraph(response.graph_id);
      input.registerDocumentForTab(tabId, savedGraph);

      input.updateWorkspaceTab(tabId, (tab) => ({
        ...tab,
        kind: "existing",
        graphId: savedGraph.graph_id,
        title: savedGraph.name,
        dirty: false,
        templateId: null,
        defaultTemplateId: null,
        subgraphSource: null,
      }));
      input.updateWorkspace(
        applyDocumentMetaToWorkspaceTab(input.workspace.value, tabId, {
          title: savedGraph.name,
          dirty: false,
          graphId: savedGraph.graph_id,
        }),
      );
      await input.loadGraphs();
      if (input.workspace.value.activeTabId === tabId) {
        input.syncRouteToTab(
          {
            graphId: savedGraph.graph_id,
            kind: "existing",
            templateId: null,
            defaultTemplateId: null,
            subgraphSource: null,
          },
          "replace",
        );
      }

      input.setMessageFeedbackForTab(tabId, {
        tone: "success",
        message: `Saved graph ${savedGraph.graph_id}.`,
      });
      return response.saved;
    } catch (error) {
      input.setMessageFeedbackForTab(tabId, {
        tone: "danger",
        message: error instanceof Error ? error.message : "Failed to save graph.",
      });
      throw error;
    }
  }

  async function saveSubgraphTab(tab: EditorWorkspaceTab, document: GraphPayload | GraphDocument) {
    const source = tab.subgraphSource;
    if (!source) {
      input.setMessageFeedbackForTab(tab.tabId, {
        tone: "danger",
        message: "Subgraph tab is missing its parent source.",
      });
      return false;
    }
    if (input.guardGraphEditForTab(source.parentTabId)) {
      return false;
    }
    const parentDocument = input.documentsByTabId.value[source.parentTabId];
    const parentNode = parentDocument?.nodes[source.nodeId];
    if (!parentDocument || parentNode?.kind !== "subgraph") {
      input.setMessageFeedbackForTab(tab.tabId, {
        tone: "danger",
        message: "Cannot save this subgraph because the parent node is no longer available.",
      });
      return false;
    }

    const documentToSave = pruneUnreferencedStateSchemaInDocument(document);
    let nextParentDocument = updateSubgraphNodeGraphInDocument(parentDocument, source.nodeId, extractCoreGraphFromDocument(documentToSave));
    nextParentDocument = updateNodeMetadataInDocument(nextParentDocument, source.nodeId, (current) => ({
      name: documentToSave.name.trim() || current.name,
      description: current.description,
    }));
    if (nextParentDocument !== parentDocument) {
      input.commitDirtyDocumentForTab(source.parentTabId, nextParentDocument);
    }

    input.registerDocumentForTab(tab.tabId, documentToSave);
    input.updateWorkspace(
      applyDocumentMetaToWorkspaceTab(input.workspace.value, tab.tabId, {
        title: documentToSave.name,
        dirty: false,
        graphId: null,
      }),
    );
    input.setMessageFeedbackForTab(tab.tabId, {
      tone: "success",
      message: `Saved subgraph back to ${source.parentTitle}.`,
    });
    return true;
  }

  function extractCoreGraphFromDocument(document: GraphPayload | GraphDocument): GraphCorePayload {
    const clonedDocument = cloneGraphDocument(document);
    return {
      state_schema: clonedDocument.state_schema,
      nodes: clonedDocument.nodes,
      edges: clonedDocument.edges,
      conditional_edges: clonedDocument.conditional_edges,
      metadata: clonedDocument.metadata,
    };
  }

  async function saveTabAsNewGraph(tabId: string) {
    const document = input.documentsByTabId.value[tabId];
    if (!document) {
      return false;
    }

    try {
      const documentToSave = pruneUnreferencedStateSchemaInDocument(document);
      const response = await input.saveGraph(documentToSave);
      const savedGraph = await input.fetchGraph(response.graph_id);
      const nextWorkspace = ensureSavedGraphTab(input.workspace.value, {
        graphId: savedGraph.graph_id,
        title: savedGraph.name,
      });
      input.updateWorkspace(nextWorkspace);
      const savedTabId = nextWorkspace.activeTabId;
      if (savedTabId) {
        input.registerDocumentForTab(savedTabId, savedGraph);
        input.setMessageFeedbackForTab(savedTabId, {
          tone: "success",
          message: `Saved graph ${savedGraph.graph_id}.`,
        });
      }
      await input.loadGraphs();
      input.syncRouteToTab(
        {
          graphId: savedGraph.graph_id,
          kind: "existing",
          templateId: null,
          defaultTemplateId: null,
          subgraphSource: null,
        },
        "replace",
      );
      return response.saved;
    } catch (error) {
      input.setMessageFeedbackForTab(tabId, {
        tone: "danger",
        message: error instanceof Error ? error.message : "Failed to save graph.",
      });
      throw error;
    }
  }

  async function saveActiveGraph() {
    if (!input.activeTab.value) {
      return;
    }
    await saveTab(input.activeTab.value.tabId);
  }

  async function saveActiveGraphAsNewGraph() {
    if (!input.activeTab.value) {
      return;
    }
    await saveTabAsNewGraph(input.activeTab.value.tabId);
  }

  async function saveActiveGraphAsTemplate() {
    const tab = input.activeTab.value;
    if (!tab) {
      return;
    }
    const document = input.documentsByTabId.value[tab.tabId];
    if (!document) {
      return;
    }

    try {
      const documentToSave = pruneUnreferencedStateSchemaInDocument(document);
      const response = await input.saveGraphAsTemplate(documentToSave);
      await input.loadTemplates();
      input.setMessageFeedbackForTab(tab.tabId, {
        tone: "success",
        message: `Saved template ${response.template_id}.`,
      });
      return response.saved;
    } catch (error) {
      input.setMessageFeedbackForTab(tab.tabId, {
        tone: "danger",
        message: error instanceof Error ? error.message : "Failed to save graph as template.",
      });
      throw error;
    }
  }

  async function validateActiveGraph() {
    const tab = input.activeTab.value;
    if (!tab) {
      return;
    }
    const document = input.documentsByTabId.value[tab.tabId];
    if (!document) {
      return;
    }

    try {
      const response = await input.validateGraph(document);
      const feedback = formatValidationFeedback(response);
      input.setMessageFeedbackForTab(tab.tabId, feedback);
    } catch (error) {
      input.setMessageFeedbackForTab(tab.tabId, {
        tone: "danger",
        message: error instanceof Error ? error.message : "Failed to validate graph.",
      });
    }
  }

  async function exportActiveGraph() {
    const tab = input.activeTab.value;
    if (!tab) {
      return;
    }
    const document = input.documentsByTabId.value[tab.tabId];
    if (!document) {
      return;
    }

    try {
      const exportDocument = cloneGraphDocument(document);
      const source = await input.exportLangGraphPython(exportDocument);
      const fileName = buildPythonExportFileName(exportDocument.name || tab.title);
      input.downloadPythonSource(source, fileName);
      input.setMessageFeedbackForTab(tab.tabId, {
        tone: "success",
        message: `Exported ${fileName}.`,
      });
    } catch (error) {
      input.setMessageFeedbackForTab(tab.tabId, {
        tone: "danger",
        message: error instanceof Error ? error.message : "Failed to export Python code.",
      });
    }
  }

  return {
    renameActiveGraph,
    saveActiveGraph,
    saveActiveGraphAsNewGraph,
    saveActiveGraphAsTemplate,
    saveTab,
    saveTabAsNewGraph,
    validateActiveGraph,
    exportActiveGraph,
  };
}

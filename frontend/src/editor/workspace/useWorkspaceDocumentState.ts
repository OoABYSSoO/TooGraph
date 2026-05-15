import type { Ref } from "vue";

import type { CanvasViewport } from "../canvas/canvasViewport.ts";
import {
  applyDocumentMetaToWorkspaceTab,
  type PersistedEditorWorkspace,
  readPersistedEditorViewportDraft,
  writePersistedEditorDocumentDraft,
  writePersistedEditorViewportDraft,
} from "../../lib/editor-workspace.ts";
import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";
import type { RunDetail } from "../../types/run.ts";

import {
  buildNextCanvasViewportDrafts,
  listTabsMissingViewportDrafts,
} from "./editorDraftPersistenceModel.ts";
import { setTabScopedRecordEntry } from "./editorTabRuntimeModel.ts";
import { applyRunWrittenStateValuesToDocument } from "./runStatePersistence.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

type WorkspaceDocumentStateInput = {
  workspace: Ref<PersistedEditorWorkspace>;
  documentsByTabId: Ref<Record<string, GraphPayload | GraphDocument>>;
  loadingByTabId: Ref<Record<string, boolean>>;
  errorByTabId: Ref<Record<string, string | null>>;
  feedbackByTabId: Ref<Record<string, WorkspaceRunFeedback | null>>;
  viewportByTabId: Ref<Record<string, CanvasViewport>>;
  updateWorkspace: (workspace: PersistedEditorWorkspace) => void;
  setMessageFeedbackForTab: (tabId: string, input: { tone: "neutral"; message: string }) => void;
  guardGraphEditForTab: (tabId: string) => boolean;
};

export function useWorkspaceDocumentState(input: WorkspaceDocumentStateInput) {
  function setDocumentForTab(tabId: string, nextDocument: GraphPayload | GraphDocument) {
    input.documentsByTabId.value = setTabScopedRecordEntry(input.documentsByTabId.value, tabId, nextDocument);
  }

  function persistDocumentDraftForTab(tabId: string, nextDocument: GraphPayload | GraphDocument) {
    setDocumentForTab(tabId, nextDocument);
    writePersistedEditorDocumentDraft(tabId, nextDocument);
  }

  function registerDocumentForTab(tabId: string, graph: GraphPayload | GraphDocument) {
    setDocumentForTab(tabId, graph);
    input.loadingByTabId.value = setTabScopedRecordEntry(input.loadingByTabId.value, tabId, false);
    input.errorByTabId.value = setTabScopedRecordEntry(input.errorByTabId.value, tabId, null);
    if (!input.feedbackByTabId.value[tabId]) {
      input.setMessageFeedbackForTab(tabId, {
        tone: "neutral",
        message: `Ready to edit ${input.documentsByTabId.value[tabId]?.name ?? graph.name}.`,
      });
    }
  }

  function ensureTabViewportDrafts() {
    let nextViewports = input.viewportByTabId.value;
    for (const tabId of listTabsMissingViewportDrafts(input.workspace.value.tabs, input.viewportByTabId.value)) {
      const persistedViewport = readPersistedEditorViewportDraft(tabId);
      if (!persistedViewport) {
        continue;
      }
      nextViewports = buildNextCanvasViewportDrafts(nextViewports, tabId, persistedViewport) ?? nextViewports;
    }

    if (nextViewports !== input.viewportByTabId.value) {
      input.viewportByTabId.value = nextViewports;
    }
  }

  function updateCanvasViewportForTab(tabId: string, viewport: CanvasViewport) {
    const nextViewports = buildNextCanvasViewportDrafts(input.viewportByTabId.value, tabId, viewport);
    if (!nextViewports) {
      return;
    }

    input.viewportByTabId.value = nextViewports;
    writePersistedEditorViewportDraft(tabId, viewport);
  }

  function persistRunStateValuesForTab(tabId: string, run: RunDetail) {
    const document = input.documentsByTabId.value[tabId];
    if (!document) {
      return;
    }

    const nextDocument = applyRunWrittenStateValuesToDocument(document, run);
    if (nextDocument !== document) {
      persistDocumentDraftForTab(tabId, nextDocument);
    }
  }

  function commitDirtyDocumentForTab(tabId: string, nextDocument: GraphPayload | GraphDocument) {
    persistDocumentDraftForTab(tabId, nextDocument);
    input.updateWorkspace(
      applyDocumentMetaToWorkspaceTab(input.workspace.value, tabId, {
        title: nextDocument.name,
        dirty: true,
        graphId: "graph_id" in nextDocument ? nextDocument.graph_id ?? null : null,
      }),
    );
  }

  function markDocumentDirty(tabId: string, nextDocument: GraphPayload | GraphDocument) {
    if (input.guardGraphEditForTab(tabId)) {
      return;
    }
    commitDirtyDocumentForTab(tabId, nextDocument);
  }

  return {
    registerDocumentForTab,
    ensureTabViewportDrafts,
    updateCanvasViewportForTab,
    persistRunStateValuesForTab,
    commitDirtyDocumentForTab,
    markDocumentDirty,
  };
}

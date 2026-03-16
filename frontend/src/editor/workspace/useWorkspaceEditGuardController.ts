import type { Ref } from "vue";

import { cloneGraphDocument } from "../../lib/graph-document.ts";
import type { GraphDocument, GraphNodeSize, GraphPayload, GraphPosition } from "../../types/node-system.ts";
import type { RunDetail } from "../../types/run.ts";

type GraphDraft = GraphPayload | GraphDocument;

type WorkspaceEditGuardControllerInput = {
  documentsByTabId: Ref<Record<string, GraphDraft>>;
  latestRunDetailByTabId: Ref<Record<string, RunDetail | null>>;
  showLockedEditToast: () => void;
  commitDirtyDocumentForTab: (tabId: string, nextDocument: GraphDraft) => void;
};

export function useWorkspaceEditGuardController(input: WorkspaceEditGuardControllerInput) {
  function isGraphInteractionLocked(tabId: string) {
    return input.latestRunDetailByTabId.value[tabId]?.status === "awaiting_human";
  }

  function showGraphLockedEditToast() {
    input.showLockedEditToast();
  }

  function guardGraphEditForTab(tabId: string) {
    if (!isGraphInteractionLocked(tabId)) {
      return false;
    }
    showGraphLockedEditToast();
    return true;
  }

  function handleNodePositionUpdate(tabId: string, payload: { nodeId: string; position: GraphPosition }) {
    if (guardGraphEditForTab(tabId)) {
      return;
    }
    const document = input.documentsByTabId.value[tabId];
    if (!document?.nodes[payload.nodeId]) {
      return;
    }

    const nextDocument = cloneGraphDocument(document);
    nextDocument.nodes[payload.nodeId].ui.position = payload.position;
    input.commitDirtyDocumentForTab(tabId, nextDocument);
  }

  function handleNodeSizeUpdate(tabId: string, payload: { nodeId: string; position: GraphPosition; size: GraphNodeSize }) {
    if (guardGraphEditForTab(tabId)) {
      return;
    }
    const document = input.documentsByTabId.value[tabId];
    if (!document?.nodes[payload.nodeId]) {
      return;
    }

    const nextDocument = cloneGraphDocument(document);
    nextDocument.nodes[payload.nodeId].ui.position = payload.position;
    nextDocument.nodes[payload.nodeId].ui.size = payload.size;
    input.commitDirtyDocumentForTab(tabId, nextDocument);
  }

  return {
    guardGraphEditForTab,
    handleNodePositionUpdate,
    handleNodeSizeUpdate,
    isGraphInteractionLocked,
    showGraphLockedEditToast,
  };
}

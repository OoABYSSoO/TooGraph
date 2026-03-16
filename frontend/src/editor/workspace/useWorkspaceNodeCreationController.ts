import type { Ref } from "vue";

import type { GraphDocument, GraphPayload, GraphPosition, NodeCreationContext, NodeCreationEntry, PresetDocument } from "../../types/node-system.ts";

import {
  buildClosedNodeCreationMenuState,
  buildCreatedStateEdgeEditorRequest,
  buildNodeCreationEntries,
  buildOpenNodeCreationMenuState,
  buildUpdatedNodeCreationMenuQuery,
  type CreatedStateEdgeEditorRequest,
  type NodeCreationMenuState,
} from "./nodeCreationMenuModel.ts";

import { setTabScopedRecordEntry } from "./editorTabRuntimeModel.ts";
import { buildBuiltinNodeCreationEntries } from "./nodeCreationBuiltins.ts";
import { createNodeFromCreationEntry, createNodeFromDroppedFile } from "./nodeCreationExecution.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

type WorkspaceNodeCreationControllerInput = {
  documentsByTabId: Ref<Record<string, GraphPayload | GraphDocument>>;
  dataEdgeStateEditorRequestByTabId: Ref<Record<string, CreatedStateEdgeEditorRequest | null>>;
  nodeCreationMenuByTabId: Ref<Record<string, NodeCreationMenuState>>;
  persistedPresets: Ref<PresetDocument[]>;
  guardGraphEditForTab: (tabId: string) => boolean;
  markDocumentDirty: (tabId: string, document: GraphPayload | GraphDocument) => void;
  setMessageFeedbackForTab: (
    tabId: string,
    feedback: { tone: WorkspaceRunFeedback["tone"]; message: string; activeRunId?: string | null; activeRunStatus?: string | null },
  ) => void;
  importPythonGraphFile: (file: File, options: { fallbackToFileNode: boolean }) => Promise<boolean>;
  isGraphiteUiPythonExportFile: (file: File) => boolean;
  now?: () => number;
};

export function useWorkspaceNodeCreationController(input: WorkspaceNodeCreationControllerInput) {
  function nodeCreationMenuState(tabId: string) {
    return input.nodeCreationMenuByTabId.value[tabId] ?? null;
  }

  function nodeCreationEntriesForTab(tabId: string): NodeCreationEntry[] {
    const menuState = nodeCreationMenuState(tabId);
    const context = menuState?.context ?? null;
    return buildNodeCreationEntries({
      builtins: buildBuiltinNodeCreationEntries(),
      presets: input.persistedPresets.value,
      query: menuState?.query ?? "",
      sourceValueType: context?.sourceValueType ?? context?.targetValueType ?? null,
      sourceAnchorKind: context?.sourceAnchorKind ?? context?.targetAnchorKind ?? null,
    });
  }

  function openNodeCreationMenuForTab(tabId: string, context: NodeCreationContext) {
    if (input.guardGraphEditForTab(tabId)) {
      return;
    }
    input.nodeCreationMenuByTabId.value = setTabScopedRecordEntry(
      input.nodeCreationMenuByTabId.value,
      tabId,
      buildOpenNodeCreationMenuState(context),
    );
  }

  function closeNodeCreationMenu(tabId: string) {
    input.nodeCreationMenuByTabId.value = setTabScopedRecordEntry(
      input.nodeCreationMenuByTabId.value,
      tabId,
      buildClosedNodeCreationMenuState(),
    );
  }

  function updateNodeCreationQuery(tabId: string, query: string) {
    const currentState = nodeCreationMenuState(tabId);
    input.nodeCreationMenuByTabId.value = setTabScopedRecordEntry(
      input.nodeCreationMenuByTabId.value,
      tabId,
      buildUpdatedNodeCreationMenuQuery(currentState, query),
    );
  }

  function createNodeFromMenuForTab(tabId: string, entry: NodeCreationEntry) {
    if (input.guardGraphEditForTab(tabId)) {
      closeNodeCreationMenu(tabId);
      return;
    }
    const document = input.documentsByTabId.value[tabId];
    const menuState = nodeCreationMenuState(tabId);
    if (!document || !menuState?.context) {
      closeNodeCreationMenu(tabId);
      return;
    }

    try {
      const result = createNodeFromCreationEntry(document, {
        entry,
        context: menuState.context,
        persistedPresets: input.persistedPresets.value,
      });
      input.markDocumentDirty(tabId, result.document);
      openCreatedStateEdgeEditorForTab(tabId, menuState.context, result);
      input.setMessageFeedbackForTab(tabId, {
        tone: "neutral",
        message: `Created ${result.document.nodes[result.createdNodeId]?.name ?? entry.label}.`,
      });
      closeNodeCreationMenu(tabId);
    } catch (error) {
      input.setMessageFeedbackForTab(tabId, {
        tone: "warning",
        message: error instanceof Error ? error.message : "Failed to create node.",
      });
    }
  }

  function openCreatedStateEdgeEditorForTab(
    tabId: string,
    context: NodeCreationContext,
    result: { createdNodeId: string; createdStateKey: string | null },
  ) {
    const editorRequest = buildCreatedStateEdgeEditorRequest(context, result, input.now?.() ?? Date.now());
    if (!editorRequest) {
      return;
    }

    input.dataEdgeStateEditorRequestByTabId.value = setTabScopedRecordEntry(
      input.dataEdgeStateEditorRequestByTabId.value,
      tabId,
      editorRequest,
    );
  }

  async function createNodeFromFileForTab(tabId: string, payload: { file: File; position: GraphPosition }) {
    if (input.guardGraphEditForTab(tabId)) {
      closeNodeCreationMenu(tabId);
      return;
    }
    const document = input.documentsByTabId.value[tabId];
    if (!document) {
      closeNodeCreationMenu(tabId);
      return;
    }

    try {
      if (input.isGraphiteUiPythonExportFile(payload.file) && (await input.importPythonGraphFile(payload.file, { fallbackToFileNode: true }))) {
        closeNodeCreationMenu(tabId);
        return;
      }

      const result = await createNodeFromDroppedFile(document, {
        file: payload.file,
        position: payload.position,
      });
      input.markDocumentDirty(tabId, result.document);
      input.setMessageFeedbackForTab(tabId, {
        tone: "neutral",
        message: `Created ${result.document.nodes[result.createdNodeId]?.name ?? "input node"} from ${payload.file.name}.`,
      });
    } catch (error) {
      input.setMessageFeedbackForTab(tabId, {
        tone: "warning",
        message: error instanceof Error ? error.message : "Failed to create input node from file.",
      });
    }
    closeNodeCreationMenu(tabId);
  }

  return {
    closeNodeCreationMenu,
    createNodeFromFileForTab,
    createNodeFromMenuForTab,
    nodeCreationEntriesForTab,
    nodeCreationMenuState,
    openCreatedStateEdgeEditorForTab,
    openNodeCreationMenuForTab,
    updateNodeCreationQuery,
  };
}

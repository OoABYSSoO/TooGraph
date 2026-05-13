import type { Ref } from "vue";

import type {
  GraphDocument,
  GraphPayload,
  GraphPosition,
  NodeCreationContext,
  NodeCreationEntry,
  PresetDocument,
  TemplateRecord,
} from "../../types/node-system.ts";

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
import type { UploadedAssetUploadResult } from "../nodes/uploadedAssetModel.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

const BATCH_FILE_NODE_OFFSET = {
  x: 36,
  y: 132,
} as const;

type WorkspaceNodeCreationControllerInput = {
  documentsByTabId: Ref<Record<string, GraphPayload | GraphDocument>>;
  dataEdgeStateEditorRequestByTabId: Ref<Record<string, CreatedStateEdgeEditorRequest | null>>;
  nodeCreationMenuByTabId: Ref<Record<string, NodeCreationMenuState>>;
  persistedPresets: Ref<PresetDocument[]>;
  templates: Ref<TemplateRecord[]>;
  guardGraphEditForTab: (tabId: string) => boolean;
  markDocumentDirty: (tabId: string, document: GraphPayload | GraphDocument) => void;
  setMessageFeedbackForTab: (
    tabId: string,
    feedback: { tone: WorkspaceRunFeedback["tone"]; message: string; activeRunId?: string | null; activeRunStatus?: string | null },
  ) => void;
  importPythonGraphFile: (file: File, options: { fallbackToFileNode: boolean }) => Promise<boolean>;
  isTooGraphPythonExportFile: (file: File) => boolean;
  uploadFile?: (file: File) => Promise<UploadedAssetUploadResult>;
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
      templates: input.templates.value,
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
        templates: input.templates.value,
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

  function resolveFileDropNodePosition(position: GraphPosition, index: number): GraphPosition {
    return {
      x: position.x + BATCH_FILE_NODE_OFFSET.x * index,
      y: position.y + BATCH_FILE_NODE_OFFSET.y * index,
    };
  }

  function listDroppedFiles(payload: { file?: File | null; files?: readonly File[] | null }) {
    if (payload.files && payload.files.length > 0) {
      return [...payload.files];
    }
    return payload.file ? [payload.file] : [];
  }

  async function createNodeFromFileForTab(tabId: string, payload: { file?: File | null; files?: readonly File[] | null; position: GraphPosition }) {
    if (input.guardGraphEditForTab(tabId)) {
      closeNodeCreationMenu(tabId);
      return;
    }
    const document = input.documentsByTabId.value[tabId];
    const files = listDroppedFiles(payload);
    if (!document || files.length === 0) {
      closeNodeCreationMenu(tabId);
      return;
    }

    let nextDocument = document;
    const createdFileNames: string[] = [];
    const failedFileNames: string[] = [];

    for (const file of files) {
      try {
        if (input.isTooGraphPythonExportFile(file) && (await input.importPythonGraphFile(file, { fallbackToFileNode: true }))) {
          continue;
        }

        const result = await createNodeFromDroppedFile(nextDocument, {
          file,
          position: resolveFileDropNodePosition(payload.position, createdFileNames.length),
          uploadFile: input.uploadFile,
        });
        nextDocument = result.document;
        createdFileNames.push(file.name);
      } catch (error) {
        failedFileNames.push(file.name);
      }
    }

    if (createdFileNames.length > 0) {
      input.markDocumentDirty(tabId, nextDocument);
    }

    if (failedFileNames.length > 0) {
      input.setMessageFeedbackForTab(tabId, {
        tone: "warning",
        message:
          createdFileNames.length > 0
            ? `Created ${createdFileNames.length} input ${createdFileNames.length === 1 ? "node" : "nodes"}; failed to import ${failedFileNames.join(", ")}.`
            : `Failed to create input ${failedFileNames.length === 1 ? "node" : "nodes"} from ${failedFileNames.join(", ")}.`,
      });
    } else if (createdFileNames.length === 1) {
      input.setMessageFeedbackForTab(tabId, {
        tone: "neutral",
        message: `Created input node from ${createdFileNames[0]}.`,
      });
    } else if (createdFileNames.length > 1) {
      input.setMessageFeedbackForTab(tabId, {
        tone: "neutral",
        message: `Created ${createdFileNames.length} input nodes from ${createdFileNames.length} files.`,
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

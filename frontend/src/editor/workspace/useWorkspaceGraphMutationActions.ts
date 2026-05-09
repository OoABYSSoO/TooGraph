import type { Ref } from "vue";

import {
  addConditionBranchToDocument,
  connectConditionRouteInDocument,
  connectFlowNodesInDocument,
  connectStateBindingInDocument,
  reconnectConditionRouteInDocument,
  reconnectFlowEdgeInDocument,
  removeConditionBranchFromDocument,
  removeConditionRouteFromDocument,
  removeFlowEdgeFromDocument,
  removeNodeFromDocument,
  reorderNodePortStateInDocument,
  updateAgentBreakpointInDocument,
  updateAgentNodeConfigInDocument,
  updateConditionBranchInDocument,
  updateConditionNodeConfigInDocument,
  updateInputNodeConfigInDocument,
  updateNodeMetadataInDocument,
  updateOutputNodeConfigInDocument,
} from "@/lib/graph-document";
import { connectStateInputSourceToTarget } from "@/lib/graph-node-creation";
import { isVirtualAnyOutputStateKey } from "@/lib/virtual-any-input";
import type {
  AgentNode,
  ConditionNode,
  GraphDocument,
  GraphNode,
  GraphPayload,
  GraphPosition,
  InputNode,
  NodeCreationContext,
  OutputNode,
  StateDefinition,
} from "@/types/node-system";
import type { SkillDefinition } from "@/types/skills";

import { addStateBindingToDocument, removeStateBindingFromDocument } from "./statePanelBindings.ts";
import {
  addStateFieldToDocument,
  buildNextDefaultStateField,
  deleteStateFieldFromDocument,
  insertStateFieldIntoDocument,
  listStateFieldUsageLabels,
  updateStateFieldInDocument,
  type StateFieldDraft,
} from "./statePanelFields.ts";
import type { WorkspaceFeedbackTone } from "./runFeedbackModel.ts";

type WorkspaceGraphMutationMessage = {
  tone: WorkspaceFeedbackTone;
  message: string;
};

type WorkspaceGraphMutationActionsInput = {
  documentsByTabId: Ref<Record<string, GraphPayload | GraphDocument>>;
  focusedNodeIdByTabId: Ref<Record<string, string | null>>;
  skillDefinitions: Ref<SkillDefinition[]>;
  markDocumentDirty: (tabId: string, nextDocument: GraphPayload | GraphDocument) => void;
  focusNodeForTab: (tabId: string, nodeId: string | null) => void;
  setMessageFeedbackForTab: (tabId: string, feedback: WorkspaceGraphMutationMessage) => void;
  showStateDeleteBlockedToast: (message: string) => void;
  openCreatedStateEdgeEditorForTab: (
    tabId: string,
    context: NodeCreationContext,
    result: { createdNodeId: string; createdStateKey: string | null },
  ) => void;
  translate: (key: string, params?: Record<string, unknown>) => string;
};

export function useWorkspaceGraphMutationActions(input: WorkspaceGraphMutationActionsInput) {
  function commitDocumentMutationForTab(
    tabId: string,
    mutate: (document: GraphPayload | GraphDocument) => GraphPayload | GraphDocument,
    options: { focusNodeId?: string | null } = {},
  ) {
    const document = input.documentsByTabId.value[tabId];
    if (!document) {
      return null;
    }

    const nextDocument = mutate(document);
    if (nextDocument === document) {
      return null;
    }

    input.markDocumentDirty(tabId, nextDocument);
    if ("focusNodeId" in options) {
      input.focusNodeForTab(tabId, options.focusNodeId ?? null);
    }
    return nextDocument;
  }

  function addStateReaderBinding(tabId: string, stateKey: string, nodeId: string) {
    commitDocumentMutationForTab(tabId, (document) => addStateBindingToDocument(document, stateKey, nodeId, "read"), {
      focusNodeId: nodeId,
    });
  }

  function removeStateReaderBinding(tabId: string, stateKey: string, nodeId: string) {
    commitDocumentMutationForTab(tabId, (document) => removeStateBindingFromDocument(document, stateKey, nodeId, "read"));
  }

  function addStateWriterBinding(tabId: string, stateKey: string, nodeId: string) {
    commitDocumentMutationForTab(tabId, (document) => addStateBindingToDocument(document, stateKey, nodeId, "write"), {
      focusNodeId: nodeId,
    });
  }

  function bindNodePortStateForTab(tabId: string, nodeId: string, side: "input" | "output", stateKey: string) {
    commitDocumentMutationForTab(
      tabId,
      (document) => addStateBindingToDocument(document, stateKey, nodeId, side === "input" ? "read" : "write"),
      {
        focusNodeId: nodeId,
      },
    );
  }

  function removeNodePortStateForTab(tabId: string, nodeId: string, side: "input" | "output", stateKey: string) {
    commitDocumentMutationForTab(
      tabId,
      (document) => removeStateBindingFromDocument(document, stateKey, nodeId, side === "input" ? "read" : "write"),
      {
        focusNodeId: nodeId,
      },
    );
  }

  function reorderNodePortStateForTab(tabId: string, nodeId: string, side: "input" | "output", stateKey: string, targetIndex: number) {
    commitDocumentMutationForTab(tabId, (document) => reorderNodePortStateInDocument(document, nodeId, side, stateKey, targetIndex), {
      focusNodeId: nodeId,
    });
  }

  function disconnectDataEdgeForTab(tabId: string, sourceNodeId: string, targetNodeId: string, stateKey: string, mode: "state" | "flow") {
    commitDocumentMutationForTab(
      tabId,
      (document) =>
        mode === "flow"
          ? removeFlowEdgeFromDocument(document, sourceNodeId, targetNodeId)
          : removeStateBindingFromDocument(document, stateKey, targetNodeId, "read"),
      {
        focusNodeId: targetNodeId,
      },
    );
  }

  function createNodePortStateForTab(tabId: string, nodeId: string, side: "input" | "output", field: StateFieldDraft) {
    const document = input.documentsByTabId.value[tabId];
    if (!document) {
      return;
    }

    const stateField = buildNextDefaultStateField(document, field.definition);
    const nextDocumentWithState = insertStateFieldIntoDocument(document, stateField);
    if (nextDocumentWithState === document) {
      return;
    }

    const nextDocument = addStateBindingToDocument(nextDocumentWithState, stateField.key, nodeId, side === "input" ? "read" : "write");
    if (nextDocument === nextDocumentWithState) {
      return;
    }

    input.markDocumentDirty(tabId, nextDocument);
    input.focusNodeForTab(tabId, nodeId);
  }

  function deleteNodeForTab(tabId: string, nodeId: string) {
    const document = input.documentsByTabId.value[tabId];
    if (!document) {
      return;
    }

    const deletedNodeName = document.nodes[nodeId]?.name ?? nodeId;
    const nextDocument = removeNodeFromDocument(document, nodeId);
    if (nextDocument === document) {
      return;
    }

    input.markDocumentDirty(tabId, nextDocument);
    if (input.focusedNodeIdByTabId.value[tabId] === nodeId) {
      input.focusNodeForTab(tabId, null);
    }
    input.setMessageFeedbackForTab(tabId, {
      tone: "neutral",
      message: `Deleted ${deletedNodeName}.`,
    });
  }

  function connectFlowNodesForTab(tabId: string, sourceNodeId: string, targetNodeId: string) {
    commitDocumentMutationForTab(tabId, (document) => connectFlowNodesInDocument(document, sourceNodeId, targetNodeId), {
      focusNodeId: targetNodeId,
    });
  }

  function connectStateBindingForTab(
    tabId: string,
    payload: {
      sourceNodeId: string;
      sourceStateKey: string;
      targetNodeId: string;
      targetStateKey: string;
      position: GraphPosition;
      sourceValueType?: string | null;
    },
  ) {
    const document = input.documentsByTabId.value[tabId];
    if (!document) {
      return;
    }

    const nextDocument = connectStateBindingInDocument(
      document,
      payload.sourceNodeId,
      payload.sourceStateKey,
      payload.targetNodeId,
      payload.targetStateKey,
      payload.sourceValueType ?? null,
    );
    if (nextDocument === document) {
      return;
    }

    const createdStateKey = resolveCreatedVirtualOutputStateKey(document, nextDocument, payload.sourceNodeId, payload.sourceStateKey);
    input.markDocumentDirty(tabId, nextDocument);
    if (createdStateKey) {
      input.openCreatedStateEdgeEditorForTab(
        tabId,
        {
          position: payload.position,
          sourceNodeId: payload.sourceNodeId,
          sourceAnchorKind: "state-out",
          sourceStateKey: payload.sourceStateKey,
          targetNodeId: payload.targetNodeId,
          targetAnchorKind: "state-in",
          targetStateKey: payload.targetStateKey,
        },
        {
          createdNodeId: payload.sourceNodeId,
          createdStateKey,
        },
      );
    }
    input.focusNodeForTab(tabId, payload.targetNodeId);
  }

  function resolveCreatedVirtualOutputStateKey(
    previousDocument: GraphPayload | GraphDocument,
    nextDocument: GraphPayload | GraphDocument,
    sourceNodeId: string,
    sourceStateKey: string,
  ) {
    if (!isVirtualAnyOutputStateKey(sourceStateKey)) {
      return null;
    }

    const previousOutputKeys = new Set(previousDocument.nodes[sourceNodeId]?.writes.map((binding) => binding.state) ?? []);
    const createdBinding = nextDocument.nodes[sourceNodeId]?.writes.find((binding) => !previousOutputKeys.has(binding.state)) ?? null;
    if (!createdBinding) {
      return null;
    }
    if (previousDocument.state_schema[createdBinding.state]) {
      return null;
    }
    return nextDocument.state_schema[createdBinding.state] ? createdBinding.state : null;
  }

  function connectStateInputSourceForTab(
    tabId: string,
    payload: { sourceNodeId: string; targetNodeId: string; targetStateKey: string; targetValueType?: string | null },
  ) {
    const document = input.documentsByTabId.value[tabId];
    if (!document) {
      return;
    }

    const result = connectStateInputSourceToTarget(document, payload);
    if (result.document === document) {
      return;
    }

    input.markDocumentDirty(tabId, result.document);
    input.openCreatedStateEdgeEditorForTab(
      tabId,
      {
        position: result.document.nodes[payload.sourceNodeId]?.ui.position ?? { x: 0, y: 0 },
        targetNodeId: payload.targetNodeId,
        targetAnchorKind: "state-in",
        targetStateKey: payload.targetStateKey,
        targetValueType: payload.targetValueType ?? null,
      },
      {
        createdNodeId: payload.sourceNodeId,
        createdStateKey: result.createdStateKey,
      },
    );
    input.focusNodeForTab(tabId, payload.targetNodeId);
  }

  function connectConditionRouteForTab(tabId: string, sourceNodeId: string, branchKey: string, targetNodeId: string) {
    commitDocumentMutationForTab(tabId, (document) => connectConditionRouteInDocument(document, sourceNodeId, branchKey, targetNodeId), {
      focusNodeId: targetNodeId,
    });
  }

  function removeFlowEdgeForTab(tabId: string, sourceNodeId: string, targetNodeId: string) {
    commitDocumentMutationForTab(tabId, (document) => removeFlowEdgeFromDocument(document, sourceNodeId, targetNodeId));
  }

  function reconnectFlowEdgeForTab(tabId: string, sourceNodeId: string, currentTargetNodeId: string, nextTargetNodeId: string) {
    commitDocumentMutationForTab(
      tabId,
      (document) => reconnectFlowEdgeInDocument(document, sourceNodeId, currentTargetNodeId, nextTargetNodeId),
      {
        focusNodeId: nextTargetNodeId,
      },
    );
  }

  function removeConditionRouteForTab(tabId: string, sourceNodeId: string, branchKey: string) {
    commitDocumentMutationForTab(tabId, (document) => removeConditionRouteFromDocument(document, sourceNodeId, branchKey));
  }

  function reconnectConditionRouteForTab(tabId: string, sourceNodeId: string, branchKey: string, nextTargetNodeId: string) {
    commitDocumentMutationForTab(tabId, (document) => reconnectConditionRouteInDocument(document, sourceNodeId, branchKey, nextTargetNodeId), {
      focusNodeId: nextTargetNodeId,
    });
  }

  function addStateField(tabId: string) {
    commitDocumentMutationForTab(tabId, (document) => addStateFieldToDocument(document));
  }

  function updateInputConfigForTab(tabId: string, nodeId: string, patch: Partial<InputNode["config"]>) {
    commitDocumentMutationForTab(
      tabId,
      (document) =>
        updateInputNodeConfigInDocument(document, nodeId, (current) => ({
          ...current,
          ...patch,
        })),
      {
        focusNodeId: nodeId,
      },
    );
  }

  function updateNodeMetadataForTab(tabId: string, nodeId: string, patch: Partial<Pick<GraphNode, "name" | "description">>) {
    commitDocumentMutationForTab(
      tabId,
      (document) =>
        updateNodeMetadataInDocument(document, nodeId, (current) => ({
          ...current,
          ...patch,
        })),
      {
        focusNodeId: nodeId,
      },
    );
  }

  function updateAgentConfigForTab(tabId: string, nodeId: string, patch: Partial<AgentNode["config"]>) {
    commitDocumentMutationForTab(
      tabId,
      (document) =>
        updateAgentNodeConfigInDocument(document, nodeId, (current) => ({
          ...current,
          ...patch,
        }), { skillDefinitions: input.skillDefinitions.value }),
      {
        focusNodeId: nodeId,
      },
    );
  }

  function toggleAgentBreakpointForTab(tabId: string, nodeId: string, enabled: boolean) {
    commitDocumentMutationForTab(tabId, (document) => updateAgentBreakpointInDocument(document, nodeId, enabled), {
      focusNodeId: nodeId,
    });
  }

  function updateConditionConfigForTab(tabId: string, nodeId: string, patch: Partial<ConditionNode["config"]>) {
    commitDocumentMutationForTab(
      tabId,
      (document) =>
        updateConditionNodeConfigInDocument(document, nodeId, (current) => ({
          ...current,
          ...patch,
        })),
      {
        focusNodeId: nodeId,
      },
    );
  }

  function updateConditionBranchForTab(tabId: string, nodeId: string, currentKey: string, nextKey: string, mappingKeys: string[]) {
    commitDocumentMutationForTab(tabId, (document) => updateConditionBranchInDocument(document, nodeId, currentKey, nextKey, mappingKeys), {
      focusNodeId: nodeId,
    });
  }

  function addConditionBranchForTab(tabId: string, nodeId: string) {
    commitDocumentMutationForTab(tabId, (document) => addConditionBranchToDocument(document, nodeId), {
      focusNodeId: nodeId,
    });
  }

  function removeConditionBranchForTab(tabId: string, nodeId: string, branchKey: string) {
    commitDocumentMutationForTab(tabId, (document) => removeConditionBranchFromDocument(document, nodeId, branchKey), {
      focusNodeId: nodeId,
    });
  }

  function updateOutputConfigForTab(tabId: string, nodeId: string, patch: Partial<OutputNode["config"]>) {
    commitDocumentMutationForTab(
      tabId,
      (document) =>
        updateOutputNodeConfigInDocument(document, nodeId, (current) => ({
          ...current,
          ...patch,
        })),
      {
        focusNodeId: nodeId,
      },
    );
  }

  function updateStateField(tabId: string, stateKey: string, patch: Partial<StateDefinition>) {
    commitDocumentMutationForTab(tabId, (document) =>
      updateStateFieldInDocument(document, stateKey, (current) => ({
        ...current,
        ...patch,
      })),
    );
  }

  function formatStateDefinitionLabel(document: GraphPayload | GraphDocument, stateKey: string) {
    return document.state_schema[stateKey]?.name.trim() || stateKey;
  }

  function formatStateUsageLabelList(labels: string[]) {
    const visibleLabels = labels.slice(0, 3);
    const remainingCount = labels.length - visibleLabels.length;
    return remainingCount > 0 ? `${visibleLabels.join(", ")} +${remainingCount}` : visibleLabels.join(", ");
  }

  function deleteStateField(tabId: string, stateKey: string) {
    const document = input.documentsByTabId.value[tabId];
    if (!document) {
      return;
    }
    if (!document.state_schema[stateKey]) {
      const message = input.translate("statePanel.deleteStateMissing");
      input.setMessageFeedbackForTab(tabId, {
        tone: "warning",
        message,
      });
      input.showStateDeleteBlockedToast(message);
      return;
    }
    const usageLabels = listStateFieldUsageLabels(document, stateKey);
    if (usageLabels.length > 0) {
      const message = input.translate("statePanel.deleteStateBlocked", { nodes: formatStateUsageLabelList(usageLabels) });
      input.setMessageFeedbackForTab(tabId, {
        tone: "warning",
        message,
      });
      input.showStateDeleteBlockedToast(message);
      return;
    }
    const nextDocument = deleteStateFieldFromDocument(document, stateKey);
    if (nextDocument === document) {
      return;
    }
    input.markDocumentDirty(tabId, nextDocument);
    input.setMessageFeedbackForTab(tabId, {
      tone: "neutral",
      message: input.translate("statePanel.deleteStateDeleted", { state: formatStateDefinitionLabel(document, stateKey) }),
    });
  }

  function removeStateWriterBinding(tabId: string, stateKey: string, nodeId: string) {
    commitDocumentMutationForTab(tabId, (document) => removeStateBindingFromDocument(document, stateKey, nodeId, "write"));
  }

  return {
    addStateReaderBinding,
    removeStateReaderBinding,
    addStateWriterBinding,
    bindNodePortStateForTab,
    removeNodePortStateForTab,
    reorderNodePortStateForTab,
    disconnectDataEdgeForTab,
    createNodePortStateForTab,
    deleteNodeForTab,
    connectFlowNodesForTab,
    connectStateBindingForTab,
    connectStateInputSourceForTab,
    connectConditionRouteForTab,
    removeFlowEdgeForTab,
    reconnectFlowEdgeForTab,
    removeConditionRouteForTab,
    reconnectConditionRouteForTab,
    addStateField,
    updateInputConfigForTab,
    updateNodeMetadataForTab,
    updateAgentConfigForTab,
    toggleAgentBreakpointForTab,
    updateConditionConfigForTab,
    updateConditionBranchForTab,
    addConditionBranchForTab,
    removeConditionBranchForTab,
    updateOutputConfigForTab,
    updateStateField,
    deleteStateField,
    removeStateWriterBinding,
  };
}

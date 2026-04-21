import type { GraphDocument, GraphPayload } from "../types/node-system.ts";
import { isVirtualAnyInputStateKey } from "./virtual-any-input.ts";

export type GraphConnectionAnchorKind = "flow-in" | "flow-out" | "state-in" | "state-out" | "route-out";

export type PendingGraphConnection = {
  sourceNodeId: string;
  sourceKind: Extract<GraphConnectionAnchorKind, "flow-out" | "route-out" | "state-out">;
  sourceStateKey?: string;
  branchKey?: string;
  mode?: "create" | "reconnect";
  currentTargetNodeId?: string;
};

export type GraphConnectionTarget = {
  nodeId: string;
  kind: GraphConnectionAnchorKind;
  stateKey?: string;
};

function canNodeAcceptFlowTarget(
  sourceNode: GraphPayload["nodes"][string],
  targetNode: GraphPayload["nodes"][string],
) {
  if (targetNode.kind === "input") {
    return false;
  }
  if (sourceNode.kind === "condition" && targetNode.kind === "condition") {
    return false;
  }
  return true;
}

export function canStartGraphConnection(anchorKind: GraphConnectionAnchorKind) {
  return anchorKind === "flow-out" || anchorKind === "route-out" || anchorKind === "state-out";
}

export function canConnectStateBinding(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  sourceStateKey: string,
  targetNodeId: string,
  targetStateKey: string,
) {
  const sourceNode = document.nodes[sourceNodeId];
  const targetNode = document.nodes[targetNodeId];
  if (!sourceNode || !targetNode || targetNode.kind === "input") {
    return false;
  }

  if (!sourceStateKey || !targetStateKey || sourceStateKey === targetStateKey) {
    return false;
  }

  if (!sourceNode.writes.some((binding) => binding.state === sourceStateKey)) {
    return false;
  }

  if (isVirtualAnyInputStateKey(targetStateKey)) {
    return targetNode.reads.length === 0;
  }

  if (!targetNode.reads.some((binding) => binding.state === targetStateKey)) {
    return false;
  }

  return !targetNode.reads.some((binding) => binding.state === sourceStateKey);
}

export function canConnectFlowNodes(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  targetNodeId: string,
) {
  const sourceNode = document.nodes[sourceNodeId];
  const targetNode = document.nodes[targetNodeId];
  if (!sourceNode || !targetNode) {
    return false;
  }

  if ((sourceNode.kind !== "input" && sourceNode.kind !== "agent") || !canNodeAcceptFlowTarget(sourceNode, targetNode)) {
    return false;
  }

  return !document.edges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId);
}

export function canConnectConditionRoute(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  branchKey: string,
  targetNodeId: string,
) {
  const sourceNode = document.nodes[sourceNodeId];
  const targetNode = document.nodes[targetNodeId];
  if (!sourceNode || sourceNode.kind !== "condition" || !targetNode) {
    return false;
  }

  if (!sourceNode.config.branches.includes(branchKey) || !canNodeAcceptFlowTarget(sourceNode, targetNode)) {
    return false;
  }

  const existingConditionalEdge = document.conditional_edges.find((edge) => edge.source === sourceNodeId);
  return existingConditionalEdge?.branches[branchKey] !== targetNodeId;
}

export function canReconnectFlowEdge(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  currentTargetNodeId: string,
  nextTargetNodeId: string,
) {
  const hasCurrentEdge = document.edges.some((edge) => edge.source === sourceNodeId && edge.target === currentTargetNodeId);
  if (!hasCurrentEdge || currentTargetNodeId === nextTargetNodeId) {
    return false;
  }

  return canConnectFlowNodes(document, sourceNodeId, nextTargetNodeId);
}

export function canReconnectConditionRoute(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  branchKey: string,
  currentTargetNodeId: string,
  nextTargetNodeId: string,
) {
  const existingConditionalEdge = document.conditional_edges.find(
    (edge) => edge.source === sourceNodeId && edge.branches[branchKey] === currentTargetNodeId,
  );
  if (!existingConditionalEdge || currentTargetNodeId === nextTargetNodeId) {
    return false;
  }

  return canConnectConditionRoute(document, sourceNodeId, branchKey, nextTargetNodeId);
}

export function canCompleteGraphConnection(
  document: GraphPayload | GraphDocument,
  pending: PendingGraphConnection | null,
  target: GraphConnectionTarget,
) {
  if (!pending) {
    return false;
  }

  if (pending.sourceKind === "state-out") {
    return target.kind === "state-in" &&
      typeof pending.sourceStateKey === "string" &&
      typeof target.stateKey === "string"
      ? canConnectStateBinding(document, pending.sourceNodeId, pending.sourceStateKey, target.nodeId, target.stateKey)
      : false;
  }

  if (target.kind !== "flow-in") {
    return false;
  }

  if (pending.mode === "reconnect") {
    if (!pending.currentTargetNodeId) {
      return false;
    }

    if (pending.sourceKind === "flow-out") {
      return canReconnectFlowEdge(document, pending.sourceNodeId, pending.currentTargetNodeId, target.nodeId);
    }

    return typeof pending.branchKey === "string" && pending.branchKey.length > 0
      ? canReconnectConditionRoute(document, pending.sourceNodeId, pending.branchKey, pending.currentTargetNodeId, target.nodeId)
      : false;
  }

  if (pending.sourceKind === "flow-out") {
    return canConnectFlowNodes(document, pending.sourceNodeId, target.nodeId);
  }

  return typeof pending.branchKey === "string" && pending.branchKey.length > 0
    ? canConnectConditionRoute(document, pending.sourceNodeId, pending.branchKey, target.nodeId)
    : false;
}

import type { GraphDocument, GraphPayload } from "../types/node-system.ts";
import { isCreateAgentInputStateKey, isVirtualAnyInputStateKey } from "./virtual-any-input.ts";

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

export function canDisconnectSequenceEdgeForDataConnection(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  targetNodeId: string,
) {
  return document.edges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId);
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

  if (!sourceStateKey || !targetStateKey) {
    return false;
  }

  if (!sourceNode.writes.some((binding) => binding.state === sourceStateKey)) {
    return false;
  }

  if (!canResolveStateConnectionWriter(document, sourceNodeId, sourceStateKey, targetNodeId)) {
    return false;
  }

  if (sourceStateKey === targetStateKey) {
    return (
      targetNode.reads.some((binding) => binding.state === sourceStateKey) &&
      shouldAddImplicitFlowEdgeForStateConnection(document, sourceNodeId, targetNodeId)
    );
  }

  if (isCreateAgentInputStateKey(targetStateKey)) {
    return targetNode.kind === "agent" && !targetNode.reads.some((binding) => binding.state === sourceStateKey);
  }

  if (isVirtualAnyInputStateKey(targetStateKey)) {
    return targetNode.reads.length === 0;
  }

  if (!targetNode.reads.some((binding) => binding.state === targetStateKey)) {
    return false;
  }

  return !targetNode.reads.some((binding) => binding.state === sourceStateKey);
}

export function shouldAddImplicitFlowEdgeForStateConnection(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  targetNodeId: string,
) {
  if (sourceNodeId === targetNodeId || canReachNode(document, sourceNodeId, targetNodeId)) {
    return false;
  }
  if (canReachNode(document, targetNodeId, sourceNodeId)) {
    return false;
  }
  return canConnectFlowNodes(document, sourceNodeId, targetNodeId);
}

function canResolveStateConnectionWriter(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  sourceStateKey: string,
  targetNodeId: string,
) {
  if (sourceNodeId === targetNodeId) {
    return false;
  }

  const includeImplicitFlowEdge = shouldAddImplicitFlowEdgeForStateConnection(document, sourceNodeId, targetNodeId);
  if (!includeImplicitFlowEdge && !canReachNode(document, sourceNodeId, targetNodeId)) {
    return false;
  }

  const successors = buildSuccessorMap(document);
  if (includeImplicitFlowEdge) {
    successors.set(sourceNodeId, [...(successors.get(sourceNodeId) ?? []), targetNodeId]);
  }
  const reachability = new Map(
    Object.keys(document.nodes).map((nodeId) => [nodeId, collectReachableNodes(nodeId, successors)]),
  );
  const candidateWriters = Object.entries(document.nodes)
    .filter(([, node]) => node.writes.some((binding) => binding.state === sourceStateKey))
    .map(([nodeId]) => nodeId)
    .filter((writerId) => writerId !== targetNodeId && reachability.get(writerId)?.has(targetNodeId));
  const remainingWriters = candidateWriters.filter(
    (writerId) =>
      !candidateWriters.some(
        (otherWriterId) =>
          otherWriterId !== writerId &&
          reachability.get(writerId)?.has(otherWriterId) &&
          reachability.get(otherWriterId)?.has(targetNodeId),
      ),
  );

  return remainingWriters.length === 1 && remainingWriters[0] === sourceNodeId;
}

function canReachNode(document: GraphPayload | GraphDocument, sourceNodeId: string, targetNodeId: string) {
  return collectReachableNodes(sourceNodeId, buildSuccessorMap(document)).has(targetNodeId);
}

function buildSuccessorMap(document: GraphPayload | GraphDocument) {
  const successors = new Map<string, string[]>();
  for (const nodeId of Object.keys(document.nodes)) {
    successors.set(nodeId, []);
  }
  for (const edge of document.edges) {
    successors.set(edge.source, [...(successors.get(edge.source) ?? []), edge.target]);
  }
  for (const conditionalEdge of document.conditional_edges) {
    for (const target of Object.values(conditionalEdge.branches)) {
      successors.set(conditionalEdge.source, [...(successors.get(conditionalEdge.source) ?? []), target]);
    }
  }
  return successors;
}

function collectReachableNodes(startNodeId: string, successors: Map<string, string[]>) {
  const visited = new Set<string>();
  const stack = [...(successors.get(startNodeId) ?? [])];
  while (stack.length > 0) {
    const nextNodeId = stack.pop();
    if (!nextNodeId || visited.has(nextNodeId)) {
      continue;
    }
    visited.add(nextNodeId);
    stack.push(...(successors.get(nextNodeId) ?? []));
  }
  return visited;
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

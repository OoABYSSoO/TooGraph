import type { GraphDocument, GraphPayload } from "../types/node-system.ts";
import { isCreateAgentInputStateKey, isVirtualAnyInputStateKey, isVirtualAnyOutputStateKey } from "./virtual-any-input.ts";

export type GraphConnectionAnchorKind = "flow-in" | "flow-out" | "state-in" | "state-out" | "route-out";

export type PendingGraphConnection = {
  sourceNodeId: string;
  sourceKind: Extract<GraphConnectionAnchorKind, "flow-out" | "route-out" | "state-out" | "state-in">;
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

type StateInputSourceReplacement = {
  sourceNodeId: string;
  targetNodeId: string;
  previousStateKey: string;
  nextStateKey: string;
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
  return anchorKind === "flow-out" || anchorKind === "route-out" || anchorKind === "state-out" || anchorKind === "state-in";
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

  const isVirtualOutputSource =
    isVirtualAnyOutputStateKey(sourceStateKey) &&
    (sourceNode.kind === "agent" || sourceNode.kind === "input") &&
    sourceNode.writes.length === 0;

  if (!isVirtualOutputSource && !sourceNode.writes.some((binding) => binding.state === sourceStateKey)) {
    return false;
  }

  if (isVirtualOutputSource) {
    if (!canResolveVirtualOutputConnectionOrder(document, sourceNodeId, targetNodeId)) {
      return false;
    }
    if (isCreateAgentInputStateKey(targetStateKey)) {
      return targetNode.kind === "agent";
    }
    if (isVirtualAnyInputStateKey(targetStateKey)) {
      return targetNode.kind === "agent" || targetNode.reads.length === 0;
    }
    return targetNode.reads.some((binding) => binding.state === targetStateKey);
  }

  const replacement = isConcreteStateInputKey(targetStateKey)
    ? {
        sourceNodeId,
        targetNodeId,
        previousStateKey: targetStateKey,
        nextStateKey: sourceStateKey,
      }
    : null;

  if (!canResolveStateConnectionWriter(document, sourceNodeId, sourceStateKey, targetNodeId, replacement)) {
    return false;
  }

  if (sourceStateKey === targetStateKey) {
    return (
      targetNode.reads.some((binding) => binding.state === sourceStateKey) &&
      shouldAddImplicitFlowEdgeForStateConnection(document, sourceNodeId, targetNodeId, replacement)
    );
  }

  if (isCreateAgentInputStateKey(targetStateKey)) {
    return targetNode.kind === "agent" && !targetNode.reads.some((binding) => binding.state === sourceStateKey);
  }

  if (isVirtualAnyInputStateKey(targetStateKey)) {
    return targetNode.kind === "agent" ? !targetNode.reads.some((binding) => binding.state === sourceStateKey) : targetNode.reads.length === 0;
  }

  if (!targetNode.reads.some((binding) => binding.state === targetStateKey)) {
    return false;
  }

  return !targetNode.reads.some((binding) => binding.state === sourceStateKey);
}

function canResolveVirtualOutputConnectionOrder(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  targetNodeId: string,
) {
  if (sourceNodeId === targetNodeId) {
    return false;
  }
  return canReachNode(document, sourceNodeId, targetNodeId) || shouldAddImplicitFlowEdgeForStateConnection(document, sourceNodeId, targetNodeId);
}

export function shouldAddImplicitFlowEdgeForStateConnection(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  targetNodeId: string,
  replacement: StateInputSourceReplacement | null = null,
) {
  if (sourceNodeId === targetNodeId || canReachNode(document, sourceNodeId, targetNodeId, replacement)) {
    return false;
  }
  if (canReachNode(document, targetNodeId, sourceNodeId, replacement)) {
    return false;
  }
  return canConnectFlowNodes(document, sourceNodeId, targetNodeId);
}

function canResolveStateConnectionWriter(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  sourceStateKey: string,
  targetNodeId: string,
  replacement: StateInputSourceReplacement | null = null,
) {
  if (sourceNodeId === targetNodeId) {
    return false;
  }

  const includeImplicitFlowEdge = shouldAddImplicitFlowEdgeForStateConnection(document, sourceNodeId, targetNodeId, replacement);
  if (!includeImplicitFlowEdge && !canReachNode(document, sourceNodeId, targetNodeId, replacement)) {
    return false;
  }

  const successors = buildSuccessorMap(document, replacement);
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

function isConcreteStateInputKey(stateKey: string) {
  return !isCreateAgentInputStateKey(stateKey) && !isVirtualAnyInputStateKey(stateKey) && !isVirtualAnyOutputStateKey(stateKey);
}

function nodeWritesState(document: GraphPayload | GraphDocument, nodeId: string, stateKey: string) {
  return document.nodes[nodeId]?.writes.some((binding) => binding.state === stateKey) ?? false;
}

function shouldRemoveReplacedStateInputSourceEdge(
  document: GraphPayload | GraphDocument,
  edge: GraphPayload["edges"][number],
  replacement: StateInputSourceReplacement | null,
) {
  if (!replacement || edge.target !== replacement.targetNodeId || edge.source === replacement.sourceNodeId) {
    return false;
  }

  if (!nodeWritesState(document, edge.source, replacement.previousStateKey)) {
    return false;
  }

  if (replacement.previousStateKey === replacement.nextStateKey) {
    return true;
  }

  const sourceNode = document.nodes[edge.source];
  const targetNode = document.nodes[replacement.targetNodeId];
  if (!sourceNode || !targetNode) {
    return true;
  }

  const remainingReadKeys = targetNode.reads
    .map((binding) => binding.state)
    .filter((stateKey) => stateKey !== replacement.previousStateKey);
  return !sourceNode.writes.some((binding) => remainingReadKeys.includes(binding.state));
}

export function filterReplacedStateInputSourceEdges<T extends GraphPayload | GraphDocument>(
  document: T,
  replacement: StateInputSourceReplacement | null,
): T["edges"] {
  if (!replacement) {
    return document.edges;
  }
  return document.edges.filter((edge) => !shouldRemoveReplacedStateInputSourceEdge(document, edge, replacement)) as T["edges"];
}

function canReachNode(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  targetNodeId: string,
  replacement: StateInputSourceReplacement | null = null,
) {
  return collectReachableNodes(sourceNodeId, buildSuccessorMap(document, replacement)).has(targetNodeId);
}

function buildSuccessorMap(document: GraphPayload | GraphDocument, replacement: StateInputSourceReplacement | null = null) {
  const successors = new Map<string, string[]>();
  for (const nodeId of Object.keys(document.nodes)) {
    successors.set(nodeId, []);
  }
  for (const edge of document.edges) {
    if (shouldRemoveReplacedStateInputSourceEdge(document, edge, replacement)) {
      continue;
    }
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

export function canConnectStateInputSource(
  document: GraphPayload | GraphDocument,
  sourceNodeId: string,
  targetNodeId: string,
  targetStateKey: string | null | undefined,
) {
  const sourceNode = document.nodes[sourceNodeId];
  const targetNode = document.nodes[targetNodeId];
  if (!sourceNode || !targetNode || sourceNodeId === targetNodeId || !targetStateKey) {
    return false;
  }

  if (targetNode.kind === "input") {
    return false;
  }

  if (sourceNode.kind === "input") {
    if (sourceNode.writes.length > 0) {
      return false;
    }
  } else if (sourceNode.kind !== "agent") {
    return false;
  }

  if (isCreateAgentInputStateKey(targetStateKey)) {
    if (targetNode.kind !== "agent") {
      return false;
    }
  } else if (isVirtualAnyInputStateKey(targetStateKey)) {
    if (targetNode.kind !== "agent" && targetNode.reads.length > 0) {
      return false;
    }
  } else if (!targetNode.reads.some((binding) => binding.state === targetStateKey)) {
    return false;
  }

  const alreadyWritesState = sourceNode.writes.some((binding) => binding.state === targetStateKey);
  const alreadyHasFlowEdge = document.edges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId);
  return !alreadyWritesState || !alreadyHasFlowEdge;
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

  if (pending.sourceKind === "state-in") {
    return target.kind === "state-out" &&
      typeof pending.sourceStateKey === "string" &&
      typeof target.stateKey === "string"
      ? canConnectStateBinding(document, target.nodeId, target.stateKey, pending.sourceNodeId, pending.sourceStateKey)
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

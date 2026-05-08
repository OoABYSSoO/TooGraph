import {
  cloneGraphDocument,
  reconcileAgentCapabilityInputBindingsInPlace,
} from "../../lib/graph-document.ts";
import type { GraphDocument, GraphNode, GraphPayload } from "../../types/node-system.ts";

export type StateBindingMode = "read" | "write";

export type StateBindingNodeOption = {
  nodeId: string;
  nodeLabel: string;
  kind: GraphNode["kind"];
};

export function listStateBindingNodeOptions(
  document: GraphPayload | GraphDocument,
  stateKey: string,
  mode: StateBindingMode,
): StateBindingNodeOption[] {
  return Object.entries(document.nodes)
    .filter(([, node]) => canNodeBindState(document, node, stateKey, mode))
    .map(([nodeId, node]) => ({
      nodeId,
      nodeLabel: node.name.trim() || nodeId,
      kind: node.kind,
    }))
    .sort((left, right) => left.nodeLabel.localeCompare(right.nodeLabel) || left.nodeId.localeCompare(right.nodeId));
}

export function addStateBindingToDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  stateKey: string,
  nodeId: string,
  mode: StateBindingMode,
): T {
  const node = document.nodes[nodeId];
  if (!node || !canNodeBindState(document, node, stateKey, mode)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const nextNode = nextDocument.nodes[nodeId];

  if (mode === "read") {
    if (nextNode.kind === "agent") {
      nextNode.reads = [...nextNode.reads, { state: stateKey, required: false }];
      reconcileAgentCapabilityInputBindingsInPlace(nextDocument, nodeId);
      return nextDocument;
    }

    if (nextNode.kind === "condition") {
      nextNode.reads = [{ state: stateKey, required: true }];
      nextNode.config.rule.source = stateKey;
      return nextDocument;
    }

    if (nextNode.kind === "output") {
      nextNode.reads = [{ state: stateKey, required: true }];
      return nextDocument;
    }

    return document;
  }

  if (nextNode.kind === "agent") {
    nextNode.writes = [...nextNode.writes, { state: stateKey, mode: "replace" }];
    reconcileAgentCapabilityInputBindingsInPlace(nextDocument, nodeId);
    return nextDocument;
  }

  if (nextNode.kind === "input") {
    nextNode.writes = [{ state: stateKey, mode: "replace" }];
    return nextDocument;
  }

  return document;
}

export function removeStateBindingFromDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  stateKey: string,
  nodeId: string,
  mode: StateBindingMode,
): T {
  const node = document.nodes[nodeId];
  if (!node) {
    return document;
  }

  if (mode === "read") {
    if (node.kind !== "agent" && node.kind !== "condition" && node.kind !== "output") {
      return document;
    }
    if (!node.reads.some((binding) => binding.state === stateKey)) {
      return document;
    }
    const nextDocument = cloneGraphDocument(document);
    nextDocument.nodes[nodeId].reads = nextDocument.nodes[nodeId].reads.filter((binding) => binding.state !== stateKey);
    reconcileAgentCapabilityInputBindingsInPlace(nextDocument, nodeId);
    pruneDisconnectedFlowEdges(nextDocument, nodeId, mode);
    return nextDocument;
  }

  if (node.kind !== "agent") {
    return document;
  }
  if (document.state_schema[stateKey]?.binding?.kind === "skill_output" || document.state_schema[stateKey]?.binding?.kind === "capability_result") {
    return document;
  }
  if (!node.writes.some((binding) => binding.state === stateKey)) {
    return document;
  }
  const nextDocument = cloneGraphDocument(document);
  nextDocument.nodes[nodeId].writes = nextDocument.nodes[nodeId].writes.filter((binding) => binding.state !== stateKey);
  pruneDisconnectedFlowEdges(nextDocument, nodeId, mode);
  return nextDocument;
}

function pruneDisconnectedFlowEdges(document: GraphPayload | GraphDocument, nodeId: string, mode: StateBindingMode) {
  document.edges = document.edges.filter((edge) => {
    if (mode === "read" && edge.target !== nodeId) {
      return true;
    }
    if (mode === "write" && edge.source !== nodeId) {
      return true;
    }

    const sourceNode = document.nodes[edge.source];
    const targetNode = document.nodes[edge.target];
    if (!sourceNode || !targetNode) {
      return false;
    }

    return hasSharedStateBinding(sourceNode, targetNode);
  });
}

function hasSharedStateBinding(sourceNode: GraphNode, targetNode: GraphNode) {
  const targetReadStates = new Set(targetNode.reads.map((binding) => binding.state));
  return sourceNode.writes.some((binding) => targetReadStates.has(binding.state));
}

function canNodeBindState(document: GraphPayload | GraphDocument, node: GraphNode, stateKey: string, mode: StateBindingMode) {
  if (mode === "read") {
    if (node.kind === "agent") {
      return !node.reads.some((binding) => binding.state === stateKey);
    }
    if (node.kind === "condition") {
      return node.reads[0]?.state !== stateKey;
    }
    if (node.kind === "output") {
      return node.reads[0]?.state !== stateKey;
    }
    return false;
  }

  if (node.kind === "agent") {
    if (isDynamicCapabilityExecutorNode(document, node)) {
      return false;
    }
    return !node.writes.some((binding) => binding.state === stateKey);
  }
  if (node.kind === "input") {
    return node.writes[0]?.state !== stateKey;
  }
  return false;
}

function isDynamicCapabilityExecutorNode(document: GraphPayload | GraphDocument, node: GraphNode) {
  return (
    node.kind === "agent" &&
    !node.config.skillKey.trim() &&
    node.reads.some((binding) => document.state_schema[binding.state]?.type?.trim() === "capability")
  );
}

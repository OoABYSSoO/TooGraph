import { cloneGraphDocument } from "../../lib/graph-document.ts";
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
    .filter(([, node]) => canNodeBindState(node, stateKey, mode))
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
  if (!node || !canNodeBindState(node, stateKey, mode)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const nextNode = nextDocument.nodes[nodeId];

  if (mode === "read") {
    if (nextNode.kind === "agent" || nextNode.kind === "condition") {
      nextNode.reads = [...nextNode.reads, { state: stateKey, required: false }];
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
    return nextDocument;
  }

  if (node.kind !== "agent" && node.kind !== "input") {
    return document;
  }
  if (!node.writes.some((binding) => binding.state === stateKey)) {
    return document;
  }
  const nextDocument = cloneGraphDocument(document);
  nextDocument.nodes[nodeId].writes = nextDocument.nodes[nodeId].writes.filter((binding) => binding.state !== stateKey);
  return nextDocument;
}

function canNodeBindState(node: GraphNode, stateKey: string, mode: StateBindingMode) {
  if (mode === "read") {
    if (node.kind === "agent" || node.kind === "condition") {
      return !node.reads.some((binding) => binding.state === stateKey);
    }
    if (node.kind === "output") {
      return node.reads[0]?.state !== stateKey;
    }
    return false;
  }

  if (node.kind === "agent") {
    return !node.writes.some((binding) => binding.state === stateKey);
  }
  if (node.kind === "input") {
    return node.writes[0]?.state !== stateKey;
  }
  return false;
}

import { cloneGraphDocument, clonePlainValue } from "../../lib/graph-document.ts";
import type {
  AgentNode,
  ConditionalEdge,
  GraphDocument,
  GraphEdge,
  GraphNode,
  GraphPayload,
  GraphPosition,
  StateDefinition,
} from "../../types/node-system.ts";

type GraphDraft = GraphPayload | GraphDocument;

export type CanvasClipboardPayload = {
  version: 1;
  nodeIds: string[];
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  conditional_edges: ConditionalEdge[];
  state_schema: Record<string, StateDefinition>;
};

export type CanvasPasteOptions = {
  offset?: GraphPosition;
};

export type CanvasPasteResult<T extends GraphDraft> = {
  document: T;
  pastedNodeIds: string[];
  focusedNodeId: string | null;
};

const DEFAULT_PASTE_OFFSET: GraphPosition = { x: 120, y: 120 };

export function createCanvasClipboardPayload(
  document: GraphDraft,
  selectedNodeIds: readonly string[],
): CanvasClipboardPayload | null {
  const nodeIds = normalizeSelectedNodeIds(selectedNodeIds).filter((nodeId) => Boolean(document.nodes[nodeId]));
  if (nodeIds.length === 0) {
    return null;
  }

  const selectedNodeIdSet = new Set(nodeIds);
  const nodes = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, clonePlainValue(document.nodes[nodeId])]));
  const stateKeys = collectCopiedStateKeys(Object.values(nodes), document.state_schema, selectedNodeIdSet);
  const state_schema = Object.fromEntries(
    [...stateKeys]
      .filter((stateKey) => Boolean(document.state_schema[stateKey]))
      .map((stateKey) => [stateKey, clonePlainValue(document.state_schema[stateKey])]),
  );

  return {
    version: 1,
    nodeIds,
    nodes,
    edges: document.edges
      .filter((edge) => selectedNodeIdSet.has(edge.source) && selectedNodeIdSet.has(edge.target))
      .map((edge) => ({ ...edge })),
    conditional_edges: document.conditional_edges
      .filter((edge) => selectedNodeIdSet.has(edge.source))
      .map((edge) => ({
        source: edge.source,
        branches: Object.fromEntries(Object.entries(edge.branches).filter(([, targetNodeId]) => selectedNodeIdSet.has(targetNodeId))),
      }))
      .filter((edge) => Object.keys(edge.branches).length > 0),
    state_schema,
  };
}

export function pasteCanvasClipboardPayload<T extends GraphDraft>(
  document: T,
  payload: CanvasClipboardPayload,
  options: CanvasPasteOptions = {},
): CanvasPasteResult<T> {
  const nextDocument = cloneGraphDocument(document);
  const offset = options.offset ?? DEFAULT_PASTE_OFFSET;
  const nodeIdMap = buildNodeIdMap(payload.nodeIds, nextDocument);
  const stateKeyMap = buildStateKeyMap(Object.keys(payload.state_schema), nextDocument);

  for (const [sourceNodeId, sourceNode] of Object.entries(payload.nodes)) {
    const nextNodeId = nodeIdMap[sourceNodeId];
    if (!nextNodeId) {
      continue;
    }
    nextDocument.nodes[nextNodeId] = remapClipboardNode(sourceNode, {
      nodeIdMap,
      stateKeyMap,
      offset,
      nextNodeId,
    });
  }

  for (const [sourceStateKey, definition] of Object.entries(payload.state_schema)) {
    const nextStateKey = stateKeyMap[sourceStateKey];
    if (!nextStateKey) {
      continue;
    }
    nextDocument.state_schema[nextStateKey] = remapStateDefinition(definition, nodeIdMap);
  }

  nextDocument.edges = [
    ...nextDocument.edges,
    ...payload.edges
      .map((edge) => ({ source: nodeIdMap[edge.source], target: nodeIdMap[edge.target] }))
      .filter((edge): edge is GraphEdge => Boolean(edge.source && edge.target)),
  ];

  nextDocument.conditional_edges = mergeConditionalEdges(
    nextDocument.conditional_edges,
    payload.conditional_edges
      .map((edge) => ({
        source: nodeIdMap[edge.source] ?? "",
        branches: Object.fromEntries(
          Object.entries(edge.branches)
            .map(([branchKey, targetNodeId]) => [branchKey, nodeIdMap[targetNodeId] ?? ""] as const)
            .filter(([, targetNodeId]) => Boolean(targetNodeId)),
        ),
      }))
      .filter((edge) => edge.source && Object.keys(edge.branches).length > 0),
  );

  const pastedNodeIds = payload.nodeIds.map((nodeId) => nodeIdMap[nodeId]).filter((nodeId): nodeId is string => Boolean(nodeId));
  return {
    document: nextDocument,
    pastedNodeIds,
    focusedNodeId: pastedNodeIds.at(-1) ?? null,
  };
}

function normalizeSelectedNodeIds(nodeIds: readonly string[]) {
  const normalized: string[] = [];
  for (const nodeId of nodeIds) {
    const compactNodeId = nodeId.trim();
    if (compactNodeId && !normalized.includes(compactNodeId)) {
      normalized.push(compactNodeId);
    }
  }
  return normalized;
}

function collectCopiedStateKeys(
  nodes: GraphNode[],
  stateSchema: Record<string, StateDefinition>,
  selectedNodeIdSet: Set<string>,
) {
  const stateKeys = new Set<string>();
  for (const node of nodes) {
    for (const binding of node.writes) {
      stateKeys.add(binding.state);
    }
    if (node.kind === "agent") {
      for (const actionBinding of node.config.actionBindings ?? []) {
        for (const mappedStateKey of Object.values(actionBinding.outputMapping ?? {})) {
          stateKeys.add(mappedStateKey);
        }
      }
    }
  }
  for (const [stateKey, definition] of Object.entries(stateSchema)) {
    const binding = definition.binding;
    if (binding && "nodeId" in binding && selectedNodeIdSet.has(binding.nodeId)) {
      stateKeys.add(stateKey);
    }
  }
  return stateKeys;
}

function buildNodeIdMap(nodeIds: string[], document: GraphDraft) {
  const usedNodeIds = new Set(Object.keys(document.nodes));
  const nodeIdMap: Record<string, string> = {};
  for (const sourceNodeId of nodeIds) {
    const nextNodeId = buildUniqueKey(`${sourceNodeId}_copy`, usedNodeIds);
    usedNodeIds.add(nextNodeId);
    nodeIdMap[sourceNodeId] = nextNodeId;
  }
  return nodeIdMap;
}

function buildStateKeyMap(stateKeys: string[], document: GraphDraft) {
  const usedStateKeys = new Set(Object.keys(document.state_schema));
  const stateKeyMap: Record<string, string> = {};
  for (const sourceStateKey of stateKeys) {
    const nextStateKey = buildUniqueKey(`${sourceStateKey}_copy`, usedStateKeys);
    usedStateKeys.add(nextStateKey);
    stateKeyMap[sourceStateKey] = nextStateKey;
  }
  return stateKeyMap;
}

function buildUniqueKey(baseKey: string, usedKeys: Set<string>) {
  if (!usedKeys.has(baseKey)) {
    return baseKey;
  }
  let index = 2;
  while (usedKeys.has(`${baseKey}_${index}`)) {
    index += 1;
  }
  return `${baseKey}_${index}`;
}

function remapClipboardNode(
  node: GraphNode,
  input: {
    nodeIdMap: Record<string, string>;
    stateKeyMap: Record<string, string>;
    offset: GraphPosition;
    nextNodeId: string;
  },
): GraphNode {
  const nextNode = clonePlainValue(node);
  nextNode.ui.position = {
    x: node.ui.position.x + input.offset.x,
    y: node.ui.position.y + input.offset.y,
  };
  nextNode.reads = nextNode.reads.map((binding) => ({
    ...binding,
    state: input.stateKeyMap[binding.state] ?? binding.state,
  }));
  nextNode.writes = nextNode.writes.map((binding) => ({
    ...binding,
    state: input.stateKeyMap[binding.state] ?? binding.state,
  }));
  if (nextNode.kind === "agent") {
    remapAgentActionBindings(nextNode, input.stateKeyMap);
  }
  void input.nextNodeId;
  return nextNode;
}

function remapAgentActionBindings(node: AgentNode, stateKeyMap: Record<string, string>) {
  node.config.actionBindings = node.config.actionBindings?.map((actionBinding) => ({
    ...actionBinding,
    outputMapping: Object.fromEntries(
      Object.entries(actionBinding.outputMapping ?? {}).map(([fieldKey, stateKey]) => [fieldKey, stateKeyMap[stateKey] ?? stateKey]),
    ),
  }));
}

function remapStateDefinition(definition: StateDefinition, nodeIdMap: Record<string, string>): StateDefinition {
  const nextDefinition = clonePlainValue(definition);
  const binding = nextDefinition.binding;
  if (binding && "nodeId" in binding && nodeIdMap[binding.nodeId]) {
    binding.nodeId = nodeIdMap[binding.nodeId];
  }
  return nextDefinition;
}

function mergeConditionalEdges(existingEdges: ConditionalEdge[], addedEdges: ConditionalEdge[]) {
  let nextEdges = existingEdges.map((edge) => ({ source: edge.source, branches: { ...edge.branches } }));
  for (const addedEdge of addedEdges) {
    const existingIndex = nextEdges.findIndex((edge) => edge.source === addedEdge.source);
    if (existingIndex === -1) {
      nextEdges = [...nextEdges, addedEdge];
      continue;
    }
    nextEdges[existingIndex] = {
      ...nextEdges[existingIndex],
      branches: {
        ...nextEdges[existingIndex].branches,
        ...addedEdge.branches,
      },
    };
  }
  return nextEdges;
}

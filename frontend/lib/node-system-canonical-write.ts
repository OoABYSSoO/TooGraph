import {
  buildCanonicalNodeFromEditorConfig,
  type CanonicalGraphPayload,
} from "./node-system-canonical.ts";
import type {
  GraphPosition,
  NodePresetDefinition,
  NodeViewportSize,
} from "./node-system-schema.ts";

type CanonicalNodeSnapshot = {
  id: string;
  position: GraphPosition;
  data: {
    isExpanded?: boolean;
    collapsedSize?: NodeViewportSize | null;
    expandedSize?: NodeViewportSize | null;
  };
};

type EditorFlowNodeSnapshot = CanonicalNodeSnapshot & {
  data: CanonicalNodeSnapshot["data"] & {
    config: NodePresetDefinition;
  };
};

type EditorFlowEdgeSnapshot = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

const GENERIC_STATE_KEYS = new Set(["value", "input", "output", "result", "text"]);

function serializeNode(value: unknown) {
  return JSON.stringify(value);
}

function replaceStateHandleKey(handle: string, currentKey: string, nextKey: string) {
  const [side, key] = handle.split(":", 2);
  if (!side || key !== currentKey) {
    return handle;
  }
  return `${side}:${nextKey}`;
}

function getPortKeyFromHandle(handleId?: string | null) {
  if (!handleId) return null;
  const [, key] = handleId.split(":");
  return key ?? null;
}

function getBoundStateKeyForPort(config: NodePresetDefinition, side: "input" | "output", portKey: string) {
  if (side === "input") {
    if (config.family === "agent" || config.family === "condition") {
      return (config.stateReads ?? []).find((binding) => binding.inputKey === portKey)?.stateKey ?? portKey;
    }
    if (config.family === "output") {
      return (config.stateReads ?? []).find((binding) => binding.inputKey === portKey)?.stateKey ?? portKey;
    }
    return null;
  }

  if (config.family === "agent" || config.family === "input") {
    return (config.stateWrites ?? []).find((binding) => binding.outputKey === portKey)?.stateKey ?? portKey;
  }

  return null;
}

function chooseStateKeyForConnection(sourceStateKey: string, targetStateKey: string) {
  if (sourceStateKey === targetStateKey) return sourceStateKey;
  const sourceGeneric = GENERIC_STATE_KEYS.has(sourceStateKey);
  const targetGeneric = GENERIC_STATE_KEYS.has(targetStateKey);
  if (sourceGeneric && !targetGeneric) return targetStateKey;
  if (targetGeneric && !sourceGeneric) return sourceStateKey;
  return targetStateKey || sourceStateKey;
}

export function buildCanonicalNodeFromEditorState(
  node: EditorFlowNodeSnapshot,
  config: NodePresetDefinition = node.data.config,
) {
  return buildCanonicalNodeFromEditorConfig({
    nodeId: node.id,
    position: node.position,
    config,
    isExpanded: config.family === "input" ? true : Boolean(node.data.isExpanded),
    collapsedSize: node.data.collapsedSize ?? null,
    expandedSize: node.data.expandedSize ?? null,
  });
}

export function buildCanonicalFlowProjectionFromEditorState(
  nodes: EditorFlowNodeSnapshot[],
  edges: EditorFlowEdgeSnapshot[],
): Pick<CanonicalGraphPayload, "nodes" | "edges" | "conditional_edges"> {
  const flowNodeMap = new Map(nodes.map((node) => [node.id, node]));
  const canonicalNodes = Object.fromEntries(nodes.map((node) => [node.id, buildCanonicalNodeFromEditorState(node)]));
  const conditionalEdgesBySource: Record<string, Record<string, string>> = {};
  const canonicalEdges: CanonicalGraphPayload["edges"] = [];

  for (const edge of edges) {
    const sourceNode = flowNodeMap.get(edge.source);
    const targetNode = flowNodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourcePortKey = getPortKeyFromHandle(edge.sourceHandle);
    const targetPortKey = getPortKeyFromHandle(edge.targetHandle);

    if (sourceNode.data.config.family === "condition") {
      if (sourcePortKey) {
        conditionalEdgesBySource[edge.source] = {
          ...(conditionalEdgesBySource[edge.source] ?? {}),
          [sourcePortKey]: edge.target,
        };
      }
      continue;
    }

    if (!sourcePortKey || !targetPortKey) continue;

    const sourceStateKey = getBoundStateKeyForPort(sourceNode.data.config, "output", sourcePortKey) ?? sourcePortKey;
    const targetStateKey = getBoundStateKeyForPort(targetNode.data.config, "input", targetPortKey) ?? targetPortKey;
    const stateKey = chooseStateKeyForConnection(sourceStateKey, targetStateKey);

    canonicalEdges.push({
      source: edge.source,
      target: edge.target,
      sourceHandle: `write:${stateKey}`,
      targetHandle: `read:${stateKey}`,
    });
  }

  return {
    nodes: canonicalNodes,
    edges: canonicalEdges,
    conditional_edges: Object.entries(conditionalEdgesBySource).map(([source, branches]) => ({
      source,
      branches,
    })),
  };
}

export function applyEditorConfigToCanonicalGraph<T extends CanonicalGraphPayload>(
  graph: T,
  node: CanonicalNodeSnapshot,
  nextConfig: NodePresetDefinition,
): T {
  const currentNode = graph.nodes[node.id];
  if (!currentNode) {
    return graph;
  }

  const nextNode = buildCanonicalNodeFromEditorState({
    ...node,
    data: {
      ...node.data,
      config: nextConfig,
    },
  });

  if (serializeNode(currentNode) === serializeNode(nextNode)) {
    return graph;
  }

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [node.id]: nextNode,
    },
  };
}

export function addEditorNodeToCanonicalGraph<T extends CanonicalGraphPayload>(
  graph: T,
  node: CanonicalNodeSnapshot,
  config: NodePresetDefinition,
): T {
  if (graph.nodes[node.id]) {
    return graph;
  }

  const nextNode = buildCanonicalNodeFromEditorState({
    ...node,
    data: {
      ...node.data,
      config,
    },
  });

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [node.id]: nextNode,
    },
  };
}

export function applyFlowProjectionToCanonicalGraph<T extends CanonicalGraphPayload>(
  graph: T,
  projection: Pick<CanonicalGraphPayload, "nodes" | "edges" | "conditional_edges">,
): T {
  let changed = false;
  const flowNodeIds = new Set(Object.keys(projection.nodes));
  const nextNodes = { ...graph.nodes } as Record<string, T["nodes"][string]>;

  for (const [nodeId, existingNode] of Object.entries(graph.nodes)) {
    if (!flowNodeIds.has(nodeId)) {
      delete nextNodes[nodeId];
      changed = true;
      continue;
    }

    const projectedNode = projection.nodes[nodeId];
    if (projectedNode && serializeNode(existingNode.ui) !== serializeNode(projectedNode.ui)) {
      nextNodes[nodeId] = {
        ...existingNode,
        ui: projectedNode.ui,
      } as T["nodes"][string];
      changed = true;
    }
  }

  const nextEdges =
    serializeNode(graph.edges) === serializeNode(projection.edges) ? graph.edges : (projection.edges as T["edges"]);
  const nextConditionalEdges =
    serializeNode(graph.conditional_edges) === serializeNode(projection.conditional_edges)
      ? graph.conditional_edges
      : (projection.conditional_edges as T["conditional_edges"]);

  if (nextEdges !== graph.edges || nextConditionalEdges !== graph.conditional_edges) {
    changed = true;
  }

  if (!changed) {
    return graph;
  }

  return {
    ...graph,
    nodes: nextNodes as T["nodes"],
    edges: nextEdges,
    conditional_edges: nextConditionalEdges,
  };
}

export function applyEditorConfigsToCanonicalGraph<T extends CanonicalGraphPayload>(
  graph: T,
  updates: Array<{
    node: CanonicalNodeSnapshot;
    config: NodePresetDefinition;
  }>,
): T {
  let nextGraph = graph;

  for (const update of updates) {
    nextGraph = applyEditorConfigToCanonicalGraph(nextGraph, update.node, update.config);
  }

  return nextGraph;
}

export function renameStateKeyInCanonicalGraph<T extends CanonicalGraphPayload>(
  graph: T,
  currentKey: string,
  nextKey: string,
): T {
  if (currentKey === nextKey) {
    return graph;
  }

  const currentDefinition = graph.state_schema[currentKey];
  if (!currentDefinition) {
    return graph;
  }

  const { [currentKey]: _, ...restStateSchema } = graph.state_schema;
  const readNodeIds = new Set<string>();
  const writeNodeIds = new Set<string>();
  const nextNodes = Object.fromEntries(
    Object.entries(graph.nodes).map(([nodeId, node]) => {
      const nextReads = node.reads.map((binding) => {
        if (binding.state !== currentKey) {
          return binding;
        }
        readNodeIds.add(nodeId);
        return {
          ...binding,
          state: nextKey,
        };
      });
      const nextWrites = node.writes.map((binding) => {
        if (binding.state !== currentKey) {
          return binding;
        }
        writeNodeIds.add(nodeId);
        return {
          ...binding,
          state: nextKey,
        };
      });

      return [
        nodeId,
        nextReads === node.reads && nextWrites === node.writes
          ? node
          : {
              ...node,
              reads: nextReads,
              writes: nextWrites,
            },
      ];
    }),
  ) as T["nodes"];

  const nextEdges = graph.edges.map((edge) => {
    const nextSourceHandle = writeNodeIds.has(edge.source)
      ? replaceStateHandleKey(edge.sourceHandle, currentKey, nextKey)
      : edge.sourceHandle;
    const nextTargetHandle = readNodeIds.has(edge.target)
      ? replaceStateHandleKey(edge.targetHandle, currentKey, nextKey)
      : edge.targetHandle;

    if (nextSourceHandle === edge.sourceHandle && nextTargetHandle === edge.targetHandle) {
      return edge;
    }

    return {
      ...edge,
      sourceHandle: nextSourceHandle,
      targetHandle: nextTargetHandle,
    };
  }) as T["edges"];

  return {
    ...graph,
    state_schema: {
      ...restStateSchema,
      [nextKey]: {
        ...currentDefinition,
        name: currentDefinition.name || nextKey,
      },
    },
    nodes: nextNodes,
    edges: nextEdges,
  };
}

export function upsertStateInCanonicalGraph<T extends CanonicalGraphPayload>(
  graph: T,
  stateKey: string,
  definition: CanonicalGraphPayload["state_schema"][string],
): T {
  const currentDefinition = graph.state_schema[stateKey];
  if (currentDefinition && serializeNode(currentDefinition) === serializeNode(definition)) {
    return graph;
  }

  return {
    ...graph,
    state_schema: {
      ...graph.state_schema,
      [stateKey]: definition,
    },
  };
}

export function bindStateToCanonicalNode<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  side: "input" | "output",
  stateKey: string,
): T {
  const node = graph.nodes[nodeId];
  if (!node) {
    return graph;
  }

  if (side === "input") {
    if (node.kind === "agent" || node.kind === "condition") {
      if (node.reads.some((binding) => binding.state === stateKey)) {
        return graph;
      }
      return {
        ...graph,
        nodes: {
          ...graph.nodes,
          [nodeId]: {
            ...node,
            reads: [...node.reads, { state: stateKey, required: false }],
          },
        },
      };
    }

    if (node.kind === "output") {
      const nextReads = [{ state: stateKey, required: true }] as const;
      if (serializeNode(node.reads) === serializeNode(nextReads)) {
        return graph;
      }
      return {
        ...graph,
        nodes: {
          ...graph.nodes,
          [nodeId]: {
            ...node,
            reads: [...nextReads],
          },
        },
      };
    }

    return graph;
  }

  if (node.kind === "agent") {
    if (node.writes.some((binding) => binding.state === stateKey)) {
      return graph;
    }
    return {
      ...graph,
      nodes: {
        ...graph.nodes,
        [nodeId]: {
          ...node,
          writes: [...node.writes, { state: stateKey, mode: "replace" }],
        },
      },
    };
  }

  if (node.kind === "input") {
    const nextWrites = [{ state: stateKey, mode: "replace" }] as const;
    if (serializeNode(node.writes) === serializeNode(nextWrites)) {
      return graph;
    }
    return {
      ...graph,
      nodes: {
        ...graph.nodes,
        [nodeId]: {
          ...node,
          writes: [...nextWrites],
        },
      },
    };
  }

  return graph;
}

export function removeStateFromCanonicalNode<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  side: "input" | "output",
  stateKey: string,
): T {
  const node = graph.nodes[nodeId];
  if (!node) {
    return graph;
  }

  if (side === "input") {
    if (node.kind !== "agent" && node.kind !== "condition" && node.kind !== "output") {
      return graph;
    }
    const nextReads = node.reads.filter((binding) => binding.state !== stateKey);
    if (nextReads.length === node.reads.length) {
      return graph;
    }
    return {
      ...graph,
      nodes: {
        ...graph.nodes,
        [nodeId]: {
          ...node,
          reads: nextReads,
        },
      },
    };
  }

  if (node.kind !== "agent" && node.kind !== "input") {
    return graph;
  }
  const nextWrites = node.writes.filter((binding) => binding.state !== stateKey);
  if (nextWrites.length === node.writes.length) {
    return graph;
  }
  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [nodeId]: {
        ...node,
        writes: nextWrites,
      },
    },
  };
}

export function renameStateNameInCanonicalGraph<T extends CanonicalGraphPayload>(
  graph: T,
  stateKey: string,
  nextName: string,
): T {
  const currentDefinition = graph.state_schema[stateKey];
  if (!currentDefinition) {
    return graph;
  }

  const normalizedName = nextName.trim() || stateKey;
  if (currentDefinition.name === normalizedName) {
    return graph;
  }

  return {
    ...graph,
    state_schema: {
      ...graph.state_schema,
      [stateKey]: {
        ...currentDefinition,
        name: normalizedName,
      },
    },
  };
}

export function deleteStateFromCanonicalGraph<T extends CanonicalGraphPayload>(
  graph: T,
  stateKey: string,
): T {
  if (!graph.state_schema[stateKey]) {
    return graph;
  }

  const { [stateKey]: _, ...restStateSchema } = graph.state_schema;
  const nextNodes = Object.fromEntries(
    Object.entries(graph.nodes).map(([nodeId, node]) => [
      nodeId,
      {
        ...node,
        reads: node.reads.filter((binding) => binding.state !== stateKey),
        writes: node.writes.filter((binding) => binding.state !== stateKey),
      },
    ]),
  ) as T["nodes"];

  return {
    ...graph,
    state_schema: restStateSchema,
    nodes: nextNodes,
  };
}

export function composeCanonicalGraphForSubmission<T extends CanonicalGraphPayload>(
  current: T,
  projection: Pick<CanonicalGraphPayload, "nodes" | "edges" | "conditional_edges">,
): T {
  const mergedNodes = { ...projection.nodes } as Record<string, T["nodes"][string]>;

  for (const [nodeId, currentNode] of Object.entries(current.nodes)) {
    const derivedNode = projection.nodes[nodeId];
    mergedNodes[nodeId] = derivedNode
      ? ({
          ...derivedNode,
          ...currentNode,
          ui: derivedNode.ui,
        } as T["nodes"][string])
      : (currentNode as T["nodes"][string]);
  }

  return {
    ...current,
    nodes: mergedNodes as T["nodes"],
    edges: projection.edges as T["edges"],
    conditional_edges: projection.conditional_edges as T["conditional_edges"],
  };
}

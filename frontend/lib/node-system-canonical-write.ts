import {
  buildCanonicalNodeFromEditorConfig,
  type CanonicalNode,
  type CanonicalGraphPayload,
} from "./node-system-canonical.ts";
import type {
  GraphPosition,
  NodePresetDefinition,
  ValueType,
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
    canonicalNode?: CanonicalNode;
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

function getBoundStateKeyForCanonicalPort(node: CanonicalNode, side: "input" | "output", portKey: string) {
  if (side === "input") {
    if (node.kind === "agent" || node.kind === "condition" || node.kind === "output") {
      return portKey;
    }
    return null;
  }

  if (node.kind === "agent" || node.kind === "input") {
    return portKey;
  }

  return null;
}

function listProjectionStateKeys(node: CanonicalNode, side: "input" | "output"): string[] {
  if (side === "input") {
    if (node.kind === "agent" || node.kind === "condition" || node.kind === "output") {
      return node.reads.map((binding) => binding.state);
    }
    return [];
  }

  if (node.kind === "agent" || node.kind === "input") {
    return node.writes.map((binding) => binding.state);
  }
  if (node.kind === "condition") {
    return node.config.branches;
  }
  return [];
}

function resolveProjectionStateKey(node: CanonicalNode, side: "input" | "output", portKey: string) {
  const stateKeys = listProjectionStateKeys(node, side);
  const matchedKey = stateKeys.find((stateKey) => stateKey === portKey);
  if (matchedKey) {
    return getBoundStateKeyForCanonicalPort(node, side, matchedKey) ?? matchedKey;
  }
  if (stateKeys.length === 1) {
    return getBoundStateKeyForCanonicalPort(node, side, stateKeys[0]) ?? stateKeys[0];
  }
  return portKey;
}

function chooseStateKeyForConnection(sourceStateKey: string, targetStateKey: string) {
  if (sourceStateKey === targetStateKey) return sourceStateKey;
  const sourceGeneric = GENERIC_STATE_KEYS.has(sourceStateKey);
  const targetGeneric = GENERIC_STATE_KEYS.has(targetStateKey);
  if (sourceGeneric && !targetGeneric) return targetStateKey;
  if (targetGeneric && !sourceGeneric) return sourceStateKey;
  return targetStateKey || sourceStateKey;
}

function valueTypeToCanonicalStateType(valueType: ValueType): CanonicalGraphPayload["state_schema"][string]["type"] {
  switch (valueType) {
    case "json":
      return "json";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "file":
      return "file";
    case "knowledge_base":
      return "knowledge_base";
    case "text":
    case "any":
    default:
      return "text";
  }
}

function defaultCanonicalStateValue(type: CanonicalGraphPayload["state_schema"][string]["type"]): unknown {
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "object":
    case "json":
      return {};
    case "array":
    case "file_list":
      return [];
    default:
      return "";
  }
}

function ensureCanonicalStateKeys<T extends CanonicalGraphPayload>(graph: T, stateKeys: string[]): T {
  let nextGraph = graph;

  for (const rawStateKey of stateKeys) {
    const stateKey = String(rawStateKey ?? "").trim();
    if (!stateKey) {
      continue;
    }
    const currentDefinition = nextGraph.state_schema[stateKey];
    const nextType = currentDefinition?.type ?? valueTypeToCanonicalStateType("text");
    const nextName = currentDefinition?.name?.trim() || stateKey;
    const nextDefinition = {
      name: nextName,
      description: currentDefinition?.description ?? "",
      type: nextType,
      value: currentDefinition?.value ?? defaultCanonicalStateValue(nextType),
      color: currentDefinition?.color ?? "",
    };

    nextGraph = upsertStateInCanonicalGraph(nextGraph, stateKey, nextDefinition);
  }

  return nextGraph;
}

export function buildCanonicalNodeFromEditorState(
  node: EditorFlowNodeSnapshot,
  config: NodePresetDefinition,
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

function buildCanonicalNodeProjectionFromGraph(
  node: EditorFlowNodeSnapshot,
  canonicalNode: CanonicalNode | undefined,
  graph: CanonicalGraphPayload,
) {
  if (!canonicalNode) {
    return null;
  }

  return {
    ...canonicalNode,
    ui: {
      position: node.position,
      collapsed: canonicalNode.kind === "input" ? false : !Boolean(node.data.isExpanded),
      expandedSize: node.data.expandedSize ?? null,
      collapsedSize: node.data.collapsedSize ?? null,
    },
  } satisfies CanonicalNode;
}

export function buildCanonicalFlowProjectionFromEditorState(
  nodes: EditorFlowNodeSnapshot[],
  graph: CanonicalGraphPayload,
  edges: EditorFlowEdgeSnapshot[],
): Pick<CanonicalGraphPayload, "nodes" | "edges" | "conditional_edges"> {
  const flowNodeMap = new Map(nodes.map((node) => [node.id, node]));
  const resolvedNodes = new Map(
    nodes
      .map((node) => {
        const canonicalNode = node.data.canonicalNode ?? graph.nodes[node.id];
        return canonicalNode ? ([node.id, canonicalNode] as const) : null;
      })
      .filter((entry): entry is readonly [string, CanonicalNode] => Boolean(entry)),
  );
  const canonicalNodeEntries: Array<[string, CanonicalNode]> = [];
  for (const node of nodes) {
    const projectedNode = buildCanonicalNodeProjectionFromGraph(node, node.data.canonicalNode ?? graph.nodes[node.id], graph);
    if (projectedNode) {
      canonicalNodeEntries.push([node.id, projectedNode]);
    }
  }
  const canonicalNodes = Object.fromEntries(canonicalNodeEntries);
  const conditionalEdgesBySource: Record<string, Record<string, string>> = {};
  const canonicalEdges: CanonicalGraphPayload["edges"] = [];

  for (const edge of edges) {
    const sourceNode = flowNodeMap.get(edge.source);
    const targetNode = flowNodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    const sourceCanonicalNode = resolvedNodes.get(edge.source);
    const targetCanonicalNode = resolvedNodes.get(edge.target);
    if (!sourceCanonicalNode || !targetCanonicalNode) continue;

    const sourcePortKey = getPortKeyFromHandle(edge.sourceHandle);
    const targetPortKey = getPortKeyFromHandle(edge.targetHandle);

    if (sourceCanonicalNode.kind === "condition") {
      if (sourcePortKey) {
        conditionalEdgesBySource[edge.source] = {
          ...(conditionalEdgesBySource[edge.source] ?? {}),
          [sourcePortKey]: edge.target,
        };
      }
      continue;
    }

    if (!sourcePortKey || !targetPortKey) continue;

    const sourceStateKey = resolveProjectionStateKey(sourceCanonicalNode, "output", sourcePortKey);
    const targetStateKey = resolveProjectionStateKey(targetCanonicalNode, "input", targetPortKey);
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

export function addEditorNodeToCanonicalGraph<T extends CanonicalGraphPayload>(
  graph: T,
  node: CanonicalNodeSnapshot,
  config: NodePresetDefinition,
): T {
  if (graph.nodes[node.id]) {
    return graph;
  }

  const nextNode = buildCanonicalNodeFromEditorState(node, config);

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [node.id]: nextNode,
    },
  };
}

export function addCanonicalNodeToGraph<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  node: CanonicalNode,
): T {
  if (graph.nodes[nodeId]) {
    return graph;
  }

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [nodeId]: node,
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

export function renameConditionBranchKeyInCanonicalGraph<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  currentKey: string,
  nextKey: string,
): T {
  const node = graph.nodes[nodeId];
  if (!node || node.kind !== "condition") {
    return graph;
  }

  const normalizedNextKey = nextKey.trim();
  if (!normalizedNextKey || normalizedNextKey === currentKey) {
    return graph;
  }

  if (!node.config.branches.includes(currentKey) || node.config.branches.includes(normalizedNextKey)) {
    return graph;
  }

  const nextBranches = node.config.branches.map((branchKey) => (branchKey === currentKey ? normalizedNextKey : branchKey));
  const nextBranchMapping = Object.fromEntries(
    Object.entries(node.config.branchMapping).map(([branchKey, target]) => [
      branchKey === currentKey ? normalizedNextKey : branchKey,
      target,
    ]),
  );
  const nextConditionalEdges = graph.conditional_edges.map((edge) => {
    if (edge.source !== nodeId || !Object.prototype.hasOwnProperty.call(edge.branches, currentKey)) {
      return edge;
    }
    return {
      ...edge,
      branches: Object.fromEntries(
        Object.entries(edge.branches).map(([branchKey, target]) => [
          branchKey === currentKey ? normalizedNextKey : branchKey,
          target,
        ]),
      ),
    };
  }) as T["conditional_edges"];

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [nodeId]: {
        ...node,
        config: {
          ...node.config,
          branches: nextBranches,
          branchMapping: nextBranchMapping,
        },
      },
    },
    conditional_edges: nextConditionalEdges,
  };
}

export function renameCanonicalNodeName<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  nextName: string,
): T {
  const node = graph.nodes[nodeId];
  if (!node) {
    return graph;
  }

  const normalizedName = nextName.trim() || nodeId;
  if (node.name === normalizedName) {
    return graph;
  }

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [nodeId]: {
        ...node,
        name: normalizedName,
      },
    },
  };
}

export function renameCanonicalNodeDescription<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  nextDescription: string,
): T {
  const node = graph.nodes[nodeId];
  if (!node) {
    return graph;
  }

  const normalizedDescription = nextDescription.trim();
  if ((node.description ?? "") === normalizedDescription) {
    return graph;
  }

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [nodeId]: {
        ...node,
        description: normalizedDescription,
      },
    },
  };
}

export function updateCanonicalInputNodeValue<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  nextValue: unknown,
): T {
  const node = graph.nodes[nodeId];
  if (!node || node.kind !== "input") {
    return graph;
  }

  const boundStateKey = node.writes[0]?.state;
  const boundState = boundStateKey ? graph.state_schema[boundStateKey] : null;
  const nodeValueUnchanged = serializeNode(node.config.value) === serializeNode(nextValue);
  const stateValueUnchanged = !boundState || serializeNode(boundState.value) === serializeNode(nextValue);

  if (nodeValueUnchanged && stateValueUnchanged) {
    return graph;
  }

  return {
    ...graph,
    state_schema:
      boundStateKey && boundState
        ? {
            ...graph.state_schema,
            [boundStateKey]: {
              ...boundState,
              value: nextValue,
            },
          }
        : graph.state_schema,
    nodes: {
      ...graph.nodes,
      [nodeId]: {
        ...node,
        config: {
          ...node.config,
          value: nextValue,
        },
      },
    },
  };
}

export function updateCanonicalInputNodeStateType<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  nextType: T["state_schema"][string]["type"],
): T {
  const node = graph.nodes[nodeId];
  if (!node || node.kind !== "input") {
    return graph;
  }

  const boundStateKey = node.writes[0]?.state;
  const boundState = boundStateKey ? graph.state_schema[boundStateKey] : null;
  if (!boundStateKey || !boundState || boundState.type === nextType) {
    return graph;
  }

  return {
    ...graph,
    state_schema: {
      ...graph.state_schema,
      [boundStateKey]: {
        ...boundState,
        type: nextType,
      },
    },
  };
}

export function updateCanonicalNode<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  updater: (node: T["nodes"][string]) => T["nodes"][string],
): T {
  const node = graph.nodes[nodeId] as T["nodes"][string] | undefined;
  if (!node) {
    return graph;
  }

  const nextNode = updater(node);
  if (serializeNode(node) === serializeNode(nextNode)) {
    return graph;
  }

  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [nodeId]: nextNode,
    },
  };
}

export function updateCanonicalNodeConfig<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  updater: (node: T["nodes"][string]) => T["nodes"][string]["config"],
): T {
  return updateCanonicalNode(graph, nodeId, (node) => {
    const nextConfig = updater(node);
    if (serializeNode(node.config) === serializeNode(nextConfig)) {
      return node;
    }

    return {
      ...node,
      config: nextConfig,
    } as T["nodes"][string];
  });
}

export function updateCanonicalReadBindingRequired<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  stateKey: string,
  required: boolean,
): T {
  return updateCanonicalNode(graph, nodeId, (node) => {
    const nextReads = node.reads.map((binding) =>
      binding.state === stateKey ? { ...binding, required } : binding,
    );

    if (serializeNode(node.reads) === serializeNode(nextReads)) {
      return node;
    }

    return {
      ...node,
      reads: nextReads,
    };
  });
}

export function replaceCanonicalNodeReads<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  reads: CanonicalNode["reads"],
): T {
  const nextReads = reads
    .map((binding) => ({
      state: String(binding.state ?? "").trim(),
      required: Boolean(binding.required),
    }))
    .filter((binding) => binding.state.length > 0);
  const graphWithStates = ensureCanonicalStateKeys(graph, nextReads.map((binding) => binding.state));
  return updateCanonicalNode(graphWithStates, nodeId, (node) => {
    if (serializeNode(node.reads) === serializeNode(nextReads)) {
      return node;
    }

    return {
      ...node,
      reads: nextReads,
    };
  });
}

export function replaceCanonicalNodeWrites<T extends CanonicalGraphPayload>(
  graph: T,
  nodeId: string,
  writes: CanonicalNode["writes"],
): T {
  const nextWrites = writes
    .map((binding) => ({
      state: String(binding.state ?? "").trim(),
      mode: "replace" as const,
    }))
    .filter((binding) => binding.state.length > 0);
  const graphWithStates = ensureCanonicalStateKeys(graph, nextWrites.map((binding) => binding.state));
  return updateCanonicalNode(graphWithStates, nodeId, (node) => {
    if (serializeNode(node.writes) === serializeNode(nextWrites)) {
      return node;
    }

    return {
      ...node,
      writes: nextWrites,
    };
  });
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
    const mergedNode = derivedNode
      ? ({
          ...derivedNode,
          ...currentNode,
          ui: derivedNode.ui,
        } as T["nodes"][string])
      : (currentNode as T["nodes"][string]);

    if (mergedNode.kind === "input") {
      const boundStateKey = mergedNode.writes[0]?.state;
      const boundState = boundStateKey ? current.state_schema[boundStateKey] : null;
      mergedNodes[nodeId] = {
        ...mergedNode,
        config: {
          ...mergedNode.config,
          value: boundState?.value ?? mergedNode.config.value,
        },
      } as T["nodes"][string];
      continue;
    }

    mergedNodes[nodeId] = mergedNode;
  }

  return {
    ...current,
    nodes: mergedNodes as T["nodes"],
    edges: projection.edges as T["edges"],
    conditional_edges: projection.conditional_edges as T["conditional_edges"],
  };
}

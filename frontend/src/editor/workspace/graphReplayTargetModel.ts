import type {
  AgentNode,
  GraphDocument,
  GraphNode,
  GraphPayload,
  StateDefinition,
} from "../../types/node-system.ts";
import type {
  GraphEditCreateNodeIntent,
  GraphEditCreateStateIntent,
  GraphEditConnectRouteIntent,
  GraphEditIntent,
  GraphEditNodeType,
} from "./graphEditPlaybackModel.ts";
import {
  resolveNodeCreationGesturePositionForFinalPosition,
  type NodeCreationPlacementContext,
} from "./nodeCreationPlacement.ts";

export type GraphReplayTargetParseResult = {
  graph: GraphPayload | GraphDocument | null;
  issues: string[];
};

export type GraphReplayTargetCompileResult = {
  valid: boolean;
  intentPackage: { operations: GraphEditIntent[] };
  issues: string[];
  warnings: string[];
  summary: {
    states: number;
    nodes: number;
    flowEdges: number;
    playbackIntents: number;
  };
};

type GraphReplayCompileContext = {
  supportedNodeIds: Set<string>;
  stateKeys: Set<string>;
  createdNodeIds: Set<string>;
  createdStateKeys: Set<string>;
  expandedNodeIds: Set<string>;
  emittedBindings: Set<string>;
  emittedEdges: Set<string>;
  writerByState: Map<string, string>;
  outgoingEdgesBySource: Map<string, string[]>;
  incomingEdgeCountByNode: Map<string, number>;
  conditionRoutes: GraphEditConnectRouteIntent[];
  warnings: string[];
};

export function parseGraphReplayTargetJson(source: string): GraphReplayTargetParseResult {
  const text = source.trim();
  if (!text) {
    return { graph: null, issues: ["Paste a Graph JSON payload first."] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { graph: null, issues: [error instanceof Error ? error.message : "Graph JSON could not be parsed."] };
  }
  return graphPayloadFromUnknown(parsed);
}

export function buildGraphReplayIntentsFromTargetGraph(graph: GraphPayload | GraphDocument): GraphReplayTargetCompileResult {
  const issues: string[] = [];
  const context: GraphReplayCompileContext = {
    supportedNodeIds: new Set(),
    stateKeys: new Set(Object.keys(graph.state_schema)),
    createdNodeIds: new Set(),
    createdStateKeys: new Set(),
    expandedNodeIds: new Set(),
    emittedBindings: new Set(),
    emittedEdges: new Set(),
    writerByState: new Map(),
    outgoingEdgesBySource: new Map(),
    incomingEdgeCountByNode: new Map(),
    conditionRoutes: [],
    warnings: [],
  };
  const operations: GraphEditIntent[] = [];

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    const nodeType = graphEditNodeType(node);
    if (!nodeType) {
      context.warnings.push(`node is not replayable yet: ${nodeId}.`);
      continue;
    }
    context.supportedNodeIds.add(nodeId);
    for (const binding of node.writes) {
      if (context.stateKeys.has(binding.state) && !context.writerByState.has(binding.state)) {
        context.writerByState.set(binding.state, nodeId);
      }
    }
  }

  for (const edge of graph.edges) {
    if (!context.supportedNodeIds.has(edge.source) || !context.supportedNodeIds.has(edge.target)) {
      context.warnings.push(`flow edge skipped because it references an unsupported node: ${edge.source} -> ${edge.target}.`);
      continue;
    }
    context.outgoingEdgesBySource.set(edge.source, [...(context.outgoingEdgesBySource.get(edge.source) ?? []), edge.target]);
    context.incomingEdgeCountByNode.set(edge.target, (context.incomingEdgeCountByNode.get(edge.target) ?? 0) + 1);
  }

  for (const conditionalEdge of graph.conditional_edges) {
    const sourceNode = graph.nodes[conditionalEdge.source];
    if (!context.supportedNodeIds.has(conditionalEdge.source) || sourceNode?.kind !== "condition") {
      context.warnings.push(`condition route skipped because source is not a replayable condition node: ${conditionalEdge.source}.`);
      continue;
    }
    for (const [branchKey, targetNodeId] of Object.entries(conditionalEdge.branches)) {
      if (!sourceNode.config.branches.includes(branchKey)) {
        context.warnings.push(`condition route skipped because branch is not declared on ${conditionalEdge.source}: ${branchKey}.`);
        continue;
      }
      if (!context.supportedNodeIds.has(targetNodeId)) {
        context.warnings.push(`condition route skipped because it references an unsupported node: ${conditionalEdge.source}.${branchKey} -> ${targetNodeId}.`);
        continue;
      }
      context.conditionRoutes.push({
        kind: "connect_route",
        sourceRef: conditionalEdge.source,
        branchKey,
        targetRef: targetNodeId,
      });
      context.incomingEdgeCountByNode.set(targetNodeId, (context.incomingEdgeCountByNode.get(targetNodeId) ?? 0) + 1);
    }
  }

  const rootNodeIds = Object.keys(graph.nodes)
    .filter((nodeId) => context.supportedNodeIds.has(nodeId) && (context.incomingEdgeCountByNode.get(nodeId) ?? 0) === 0)
    .sort((left, right) => compareNodePosition(graph.nodes[left], graph.nodes[right]) || left.localeCompare(right));

  for (const rootNodeId of rootNodeIds) {
    appendNodeAndDescendants(graph, rootNodeId, null, context, operations);
  }

  for (const nodeId of Object.keys(graph.nodes)) {
    if (context.supportedNodeIds.has(nodeId) && !context.createdNodeIds.has(nodeId)) {
      appendNodeAndDescendants(graph, nodeId, null, context, operations);
    }
  }

  for (const [stateKey, definition] of Object.entries(graph.state_schema)) {
    if (!context.createdStateKeys.has(stateKey)) {
      operations.push(buildCreateStateIntent(stateKey, definition));
      context.createdStateKeys.add(stateKey);
    }
  }

  for (const route of context.conditionRoutes) {
    emitConditionRoute(route, context, operations);
  }

  return {
    valid: issues.length === 0,
    intentPackage: { operations: issues.length === 0 ? operations : [] },
    issues,
    warnings: context.warnings,
    summary: {
      states: Object.keys(graph.state_schema).length,
      nodes: context.supportedNodeIds.size,
      flowEdges: graph.edges.length + context.conditionRoutes.length,
      playbackIntents: issues.length === 0 ? operations.length : 0,
    },
  };
}

function appendNodeAndDescendants(
  graph: GraphPayload | GraphDocument,
  nodeId: string,
  creationSource: GraphEditCreateNodeIntent["creationSource"] | null,
  context: GraphReplayCompileContext,
  operations: GraphEditIntent[],
) {
  ensureNodeLocalOperations(graph, nodeId, creationSource, context, operations);
  if (context.expandedNodeIds.has(nodeId)) {
    return;
  }
  context.expandedNodeIds.add(nodeId);
  for (const targetNodeId of context.outgoingEdgesBySource.get(nodeId) ?? []) {
    const targetCreationSource = resolveTargetCreationSource(graph, nodeId, targetNodeId, context);
    ensureNodeLocalOperations(graph, targetNodeId, targetCreationSource, context, operations);
    emitFlowEdge(nodeId, targetNodeId, context, operations);
    appendNodeAndDescendants(graph, targetNodeId, targetCreationSource, context, operations);
  }
}

function ensureNodeLocalOperations(
  graph: GraphPayload | GraphDocument,
  nodeId: string,
  creationSource: GraphEditCreateNodeIntent["creationSource"] | null,
  context: GraphReplayCompileContext,
  operations: GraphEditIntent[],
) {
  if (context.createdNodeIds.has(nodeId)) {
    return;
  }
  const node = graph.nodes[nodeId];
  if (!node) {
    return;
  }
  const nodeType = graphEditNodeType(node);
  if (!nodeType) {
    return;
  }

  context.createdNodeIds.add(nodeId);
  operations.push(buildCreateNodeIntent(nodeId, node, nodeType, creationSource));

  for (const binding of node.writes) {
    if (!context.stateKeys.has(binding.state)) {
      context.warnings.push(`write binding skipped because state is missing: ${nodeId}.${binding.state}.`);
      continue;
    }
    if (!context.createdStateKeys.has(binding.state)) {
      operations.push(buildCreateStateIntent(binding.state, graph.state_schema[binding.state], nodeId, "write"));
      context.createdStateKeys.add(binding.state);
    }
    emitStateBinding(nodeId, binding.state, "write", context, operations, {
      writeMode: binding.mode,
    });
  }

  for (const binding of node.reads) {
    if (!context.stateKeys.has(binding.state)) {
      context.warnings.push(`read binding skipped because state is missing: ${nodeId}.${binding.state}.`);
      continue;
    }
    if (!context.createdStateKeys.has(binding.state)) {
      operations.push(buildCreateStateIntent(binding.state, graph.state_schema[binding.state]));
      context.createdStateKeys.add(binding.state);
    }
    emitStateBinding(nodeId, binding.state, "read", context, operations, {
      required: binding.required === true,
      sourceNodeRef: context.writerByState.get(binding.state),
    });
  }
}

function emitStateBinding(
  nodeId: string,
  stateKey: string,
  mode: "read" | "write",
  context: GraphReplayCompileContext,
  operations: GraphEditIntent[],
  options: { required?: boolean; writeMode?: "replace" | "append"; sourceNodeRef?: string } = {},
) {
  const bindingKey = `${nodeId}:${stateKey}:${mode}`;
  if (context.emittedBindings.has(bindingKey)) {
    return;
  }
  context.emittedBindings.add(bindingKey);
  operations.push({
    kind: "bind_state",
    nodeRef: nodeId,
    stateRef: stateKey,
    mode,
    required: options.required,
    writeMode: options.writeMode,
    sourceNodeRef: options.sourceNodeRef,
  });
}

function emitFlowEdge(sourceNodeId: string, targetNodeId: string, context: GraphReplayCompileContext, operations: GraphEditIntent[]) {
  const edgeKey = `${sourceNodeId}->${targetNodeId}`;
  if (context.emittedEdges.has(edgeKey)) {
    return;
  }
  context.emittedEdges.add(edgeKey);
  operations.push({
    kind: "connect_nodes",
    sourceRef: sourceNodeId,
    targetRef: targetNodeId,
  });
}

function emitConditionRoute(route: GraphEditConnectRouteIntent, context: GraphReplayCompileContext, operations: GraphEditIntent[]) {
  const edgeKey = `${route.sourceRef}:${route.branchKey}->${route.targetRef}`;
  if (context.emittedEdges.has(edgeKey)) {
    return;
  }
  context.emittedEdges.add(edgeKey);
  operations.push(route);
}

function resolveTargetCreationSource(
  graph: GraphPayload | GraphDocument,
  sourceNodeId: string,
  targetNodeId: string,
  context: GraphReplayCompileContext,
): GraphEditCreateNodeIntent["creationSource"] {
  const sourceNode = graph.nodes[sourceNodeId];
  const targetNode = graph.nodes[targetNodeId];
  const sourceWriteStates = new Set(sourceNode?.writes.map((binding) => binding.state) ?? []);
  const sharedState = targetNode?.reads.find((binding) => sourceWriteStates.has(binding.state) || context.writerByState.get(binding.state) === sourceNodeId)?.state;
  return sharedState
    ? { kind: "state", sourceNodeRef: sourceNodeId, stateRef: sharedState }
    : { kind: "flow", sourceNodeRef: sourceNodeId };
}

function compareNodePosition(left: GraphNode | undefined, right: GraphNode | undefined) {
  const leftPosition = left?.ui.position ?? { x: 0, y: 0 };
  const rightPosition = right?.ui.position ?? { x: 0, y: 0 };
  return leftPosition.x - rightPosition.x || leftPosition.y - rightPosition.y;
}

function buildCreateStateIntent(
  stateKey: string,
  definition: StateDefinition,
  nodeRef?: string,
  bindingMode?: GraphEditCreateStateIntent["bindingMode"],
): GraphEditCreateStateIntent {
  const intent: GraphEditCreateStateIntent = {
    kind: "create_state",
    ref: stateKey,
    stateKey,
    name: definition.name,
    description: definition.description,
    valueType: definition.type,
    color: definition.color,
    nodeRef,
    bindingMode,
  };
  if ("value" in definition) {
    intent.value = definition.value;
  }
  return intent;
}

function buildCreateNodeIntent(
  nodeId: string,
  node: GraphNode,
  nodeType: GraphEditNodeType,
  creationSource: GraphEditCreateNodeIntent["creationSource"] | null = null,
): GraphEditCreateNodeIntent {
  const position = resolveNodeCreationGesturePositionForFinalPosition({
    nodeId,
    node,
    finalPosition: node.ui.position,
    context: placementContextFromCreationSource(creationSource),
  });
  return {
    kind: "create_node",
    ref: nodeId,
    nodeId,
    nodeType,
    title: node.name,
    description: node.description,
    taskInstruction: node.kind === "agent" ? agentTaskInstruction(node) : "",
    ...(node.kind === "subgraph" ? { subgraphGraph: node.config.graph } : {}),
    position,
    creationSource: creationSource ?? undefined,
  };
}

function placementContextFromCreationSource(
  creationSource: GraphEditCreateNodeIntent["creationSource"] | null,
): NodeCreationPlacementContext {
  if (creationSource?.kind === "state") {
    return {
      sourceAnchorKind: "state-out",
      sourceStateKey: creationSource.stateRef,
    };
  }
  if (creationSource?.kind === "flow") {
    return {
      sourceAnchorKind: "flow-out",
    };
  }
  return {};
}

function graphEditNodeType(node: GraphNode): GraphEditNodeType | null {
  return node.kind === "input" || node.kind === "agent" || node.kind === "output" || node.kind === "condition" || node.kind === "subgraph"
    ? node.kind
    : null;
}

function agentTaskInstruction(node: AgentNode): string {
  return typeof node.config.taskInstruction === "string" ? node.config.taskInstruction : "";
}

function graphPayloadFromUnknown(value: unknown): GraphReplayTargetParseResult {
  if (!isPlainRecord(value)) {
    return { graph: null, issues: ["Graph JSON must be an object."] };
  }
  const issues: string[] = [];
  if (typeof value.name !== "string") {
    issues.push("Graph JSON requires string field: name.");
  }
  if (!isPlainRecord(value.state_schema)) {
    issues.push("Graph JSON requires object field: state_schema.");
  }
  if (!isPlainRecord(value.nodes)) {
    issues.push("Graph JSON requires object field: nodes.");
  }
  if (!Array.isArray(value.edges)) {
    issues.push("Graph JSON requires array field: edges.");
  }
  if (!Array.isArray(value.conditional_edges)) {
    issues.push("Graph JSON requires array field: conditional_edges.");
  }
  if (!isPlainRecord(value.metadata)) {
    issues.push("Graph JSON requires object field: metadata.");
  }
  if (issues.length > 0) {
    return { graph: null, issues };
  }
  return {
    graph: JSON.parse(JSON.stringify(value)) as GraphPayload | GraphDocument,
    issues: [],
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
  GraphEditIntent,
  GraphEditNodeType,
} from "./graphEditPlaybackModel.ts";

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
    warnings: [],
  };
  const operations: GraphEditIntent[] = [];

  for (const [stateKey, definition] of Object.entries(graph.state_schema)) {
    operations.push(buildCreateStateIntent(stateKey, definition));
  }

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    const nodeType = graphEditNodeType(node);
    if (!nodeType) {
      context.warnings.push(`subgraph nodes are not replayable yet: ${nodeId}.`);
      continue;
    }
    context.supportedNodeIds.add(nodeId);
    operations.push(buildCreateNodeIntent(nodeId, node, nodeType));
  }

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (!context.supportedNodeIds.has(nodeId)) {
      continue;
    }
    operations.push(...buildStateBindingIntents(nodeId, node, context));
  }

  for (const edge of graph.edges) {
    if (!context.supportedNodeIds.has(edge.source) || !context.supportedNodeIds.has(edge.target)) {
      context.warnings.push(`flow edge skipped because it references an unsupported node: ${edge.source} -> ${edge.target}.`);
      continue;
    }
    operations.push({
      kind: "connect_nodes",
      sourceRef: edge.source,
      targetRef: edge.target,
    });
  }

  if (graph.conditional_edges.length > 0) {
    context.warnings.push(`conditional edges are not replayable yet: ${graph.conditional_edges.length}.`);
  }

  return {
    valid: issues.length === 0,
    intentPackage: { operations: issues.length === 0 ? operations : [] },
    issues,
    warnings: context.warnings,
    summary: {
      states: Object.keys(graph.state_schema).length,
      nodes: context.supportedNodeIds.size,
      flowEdges: graph.edges.length,
      playbackIntents: issues.length === 0 ? operations.length : 0,
    },
  };
}

function buildCreateStateIntent(stateKey: string, definition: StateDefinition): GraphEditCreateStateIntent {
  const intent: GraphEditCreateStateIntent = {
    kind: "create_state",
    ref: stateKey,
    stateKey,
    name: definition.name,
    description: definition.description,
    valueType: definition.type,
    color: definition.color,
  };
  if ("value" in definition) {
    intent.value = definition.value;
  }
  return intent;
}

function buildCreateNodeIntent(nodeId: string, node: GraphNode, nodeType: GraphEditNodeType): GraphEditCreateNodeIntent {
  return {
    kind: "create_node",
    ref: nodeId,
    nodeId,
    nodeType,
    title: node.name,
    description: node.description,
    taskInstruction: node.kind === "agent" ? agentTaskInstruction(node) : "",
    position: node.ui.position,
  };
}

function buildStateBindingIntents(nodeId: string, node: GraphNode, context: GraphReplayCompileContext): GraphEditIntent[] {
  const operations: GraphEditIntent[] = [];
  for (const binding of node.reads) {
    if (!context.stateKeys.has(binding.state)) {
      context.warnings.push(`read binding skipped because state is missing: ${nodeId}.${binding.state}.`);
      continue;
    }
    operations.push({
      kind: "bind_state",
      nodeRef: nodeId,
      stateRef: binding.state,
      mode: "read",
      required: binding.required === true,
    });
  }
  for (const binding of node.writes) {
    if (!context.stateKeys.has(binding.state)) {
      context.warnings.push(`write binding skipped because state is missing: ${nodeId}.${binding.state}.`);
      continue;
    }
    operations.push({
      kind: "bind_state",
      nodeRef: nodeId,
      stateRef: binding.state,
      mode: "write",
      writeMode: binding.mode,
    });
  }
  return operations;
}

function graphEditNodeType(node: GraphNode): GraphEditNodeType | null {
  return node.kind === "input" || node.kind === "agent" || node.kind === "output" || node.kind === "condition"
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

import { cloneGraphDocument, clonePlainValue, reconcileAgentCapabilityInputBindingsInPlace } from "./graph-document.ts";
import { buildNextDefaultStateField, rememberDefaultStateKeyIndex, resolveDefaultStateColor } from "../editor/workspace/statePanelFields.ts";
import { isCreateAgentInputStateKey, isVirtualAnyInputStateKey, isVirtualAnyOutputStateKey } from "./virtual-any-input.ts";
import { canConnectStateInputSource, filterReplacedStateInputSourceEdges } from "./graph-connections.ts";
import { resolveInputNodeVirtualOutputType } from "./input-boundary.ts";

import type {
  GraphDocument,
  GraphCorePayload,
  GraphNode,
  GraphPayload,
  GraphPosition,
  InputNode,
  NodeCreationContext,
  OutputNode,
  PresetDocument,
  StateDefinition,
  SubgraphNode,
} from "../types/node-system.ts";

type CreatedNodeResult = {
  id: string;
  node: GraphNode;
  state_schema: Record<string, StateDefinition>;
};

type ApplyNodeCreationResultInput = {
  createdNodeId: string;
  createdNode: GraphNode;
  mergedStateSchema?: Record<string, StateDefinition>;
  context?: NodeCreationContext | null;
};

type ConnectStateInputSourceToTargetInput = {
  sourceNodeId: string;
  targetNodeId: string;
  targetStateKey: string;
  targetValueType?: string | null;
};

type ApplyNodeCreationResultOutput<T extends GraphPayload | GraphDocument> = {
  document: T;
  createdNodeId: string;
  createdStateKey: string | null;
};

type ConnectStateInputSourceToTargetOutput<T extends GraphPayload | GraphDocument> = {
  document: T;
  sourceNodeId: string;
  targetNodeId: string;
  createdStateKey: string | null;
};

function defaultStateDefinitionForType(stateKey: string, type: string): StateDefinition {
  return {
    name: stateKey,
    description: "",
    type,
    value: defaultValueForStateType(type),
    color: resolveDefaultStateColor(stateKey),
  };
}

function defaultValueForStateType(type: string): unknown {
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "json":
      return {};
    case "capability":
      return { kind: "none" };
    default:
      return "";
  }
}

function normalizeCreatedNodeUi(position: GraphPosition) {
  return {
    position,
    collapsed: false,
  };
}

function buildTextInputNode(position: GraphPosition): InputNode {
  return {
    kind: "input",
    name: "",
    description: "",
    ui: normalizeCreatedNodeUi(position),
    reads: [],
    writes: [],
    config: {
      value: "",
    },
  };
}

function buildOutputNode(position: GraphPosition): OutputNode {
  return {
    kind: "output",
    name: "",
    description: "",
    ui: normalizeCreatedNodeUi(position),
    reads: [],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };
}

export function buildGenericInputNode(params: { id: string; position: GraphPosition }): CreatedNodeResult {
  return {
    id: params.id,
    node: buildTextInputNode(params.position),
    state_schema: {},
  };
}

export function buildGenericOutputNode(params: { id: string; position: GraphPosition }): CreatedNodeResult {
  return {
    id: params.id,
    node: buildOutputNode(params.position),
    state_schema: {},
  };
}

export function buildNodeFromPreset(preset: PresetDocument, params: { id: string; position: GraphPosition }): CreatedNodeResult {
  return {
    id: params.id,
    node: {
      ...preset.definition.node,
      ui: normalizeCreatedNodeUi(params.position),
    } as GraphNode,
    state_schema: preset.definition.state_schema,
  };
}

function listSubgraphInputBoundaries(graph: GraphCorePayload) {
  return Object.entries(graph.nodes)
    .filter(([, node]) => node.kind === "input" && node.writes.length > 0)
    .map(([nodeId, node]) => ({
      nodeId,
      stateKey: node.writes[0].state,
      definition: graph.state_schema[node.writes[0].state],
    }));
}

function listSubgraphOutputBoundaries(graph: GraphCorePayload) {
  return Object.entries(graph.nodes)
    .filter(([, node]) => node.kind === "output" && node.reads.length > 0)
    .map(([nodeId, node]) => ({
      nodeId,
      stateKey: node.reads[0].state,
      definition: graph.state_schema[node.reads[0].state],
    }));
}

function cloneGraphCoreForSubgraph(sourceGraph: GraphPayload | GraphDocument): GraphCorePayload {
  const graph = clonePlainValue({
    state_schema: sourceGraph.state_schema,
    nodes: sourceGraph.nodes,
    edges: sourceGraph.edges,
    conditional_edges: sourceGraph.conditional_edges,
    metadata: {
      ...sourceGraph.metadata,
      sourceGraphId: sourceGraph.graph_id ?? null,
      sourceGraphName: sourceGraph.name,
    },
  });
  for (const boundary of listSubgraphInputBoundaries(graph)) {
    const definition = graph.state_schema[boundary.stateKey];
    if (definition) {
      definition.value = defaultValueForStateType(definition.type);
    }
    const inputNode = graph.nodes[boundary.nodeId];
    if (inputNode.kind === "input") {
      inputNode.config.value = definition?.value ?? "";
    }
  }
  return graph;
}

function createSubgraphPortState(
  targetDocument: GraphPayload | GraphDocument,
  stateSchema: Record<string, StateDefinition>,
  definition: StateDefinition | undefined,
) {
  const nextField = buildNextDefaultStateField(targetDocument, {
    name: definition?.name?.trim() || "",
    description: definition?.description?.trim() || "",
    type: definition?.type?.trim() || "text",
    value: defaultValueForStateType(definition?.type?.trim() || "text"),
    color: definition?.color?.trim() || undefined,
  });
  targetDocument.state_schema[nextField.key] = nextField.definition;
  stateSchema[nextField.key] = nextField.definition;
  rememberDefaultStateKeyIndex(targetDocument, nextField.key);
  return nextField.key;
}

export function buildSubgraphNodeFromGraph(
  sourceGraph: GraphPayload | GraphDocument,
  params: { id: string; position: GraphPosition; targetDocument: GraphPayload | GraphDocument },
): CreatedNodeResult {
  const graph = cloneGraphCoreForSubgraph(sourceGraph);
  const workingDocument = cloneGraphDocument(params.targetDocument);
  const state_schema: Record<string, StateDefinition> = {};
  const reads = listSubgraphInputBoundaries(graph).map((boundary) => ({
    state: createSubgraphPortState(workingDocument, state_schema, boundary.definition),
    required: true,
  }));
  const writes = listSubgraphOutputBoundaries(graph).map((boundary) => ({
    state: createSubgraphPortState(workingDocument, state_schema, boundary.definition),
    mode: "replace" as const,
  }));
  const node: SubgraphNode = {
    kind: "subgraph",
    name: `${sourceGraph.name.trim() || "Graph"} Subgraph`,
    description: "Embedded graph instance. Double-click to edit this copy.",
    ui: normalizeCreatedNodeUi(params.position),
    reads,
    writes,
    config: {
      graph,
    },
  };
  return {
    id: params.id,
    node,
    state_schema,
  };
}

export function buildInputNodeFromFile(params: {
  id: string;
  position: GraphPosition;
  stateKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  detectedType: string;
  localPath: string;
  contentType: string;
  textPreview?: string;
  encoding: "local_path";
}): CreatedNodeResult {
  const stateKey = params.stateKey;
  const uploadedValue = params.localPath;
  return {
    id: params.id,
    node: {
      kind: "input",
      name: `${params.fileName} Input`,
      description: `Uploaded asset from ${params.fileName}.`,
      ui: normalizeCreatedNodeUi(params.position),
      reads: [],
      writes: [{ state: stateKey, mode: "replace" }],
      config: {
        value: uploadedValue,
      },
    },
    state_schema: {
      [stateKey]: {
        ...defaultStateDefinitionForType(stateKey, params.detectedType),
        name: params.fileName,
        value: uploadedValue,
      },
    },
  };
}

function ensureStateDefinitionForCreation<T extends GraphPayload | GraphDocument>(document: T, stateKey: string, stateType: string) {
  if (document.state_schema[stateKey]) {
    return document;
  }
  document.state_schema[stateKey] = defaultStateDefinitionForType(stateKey, stateType);
  return document;
}

function bindCreatedStateToNode(node: GraphNode, stateKey: string) {
  if (node.kind === "output") {
    node.reads = [{ state: stateKey, required: true }];
    return;
  }

  if (node.kind === "condition") {
    node.reads = [{ state: stateKey, required: true }];
    node.config.rule.source = stateKey;
    return;
  }

  if (node.kind === "agent") {
    if (!node.reads.some((binding) => binding.state === stateKey)) {
      node.reads = [...node.reads, { state: stateKey, required: true }];
    }
    return;
  }

  if (node.kind === "subgraph") {
    if (node.reads.length > 0) {
      node.reads = [{ ...node.reads[0], state: stateKey, required: true }, ...node.reads.slice(1)];
      return;
    }
    node.reads = [{ state: stateKey, required: true }];
  }
}

function bindCreatedStateToSourceNode(node: GraphNode | undefined, stateKey: string) {
  if (!node) {
    return;
  }
  if (node.kind === "input") {
    node.writes = [{ state: stateKey, mode: "replace" }];
    return;
  }
  if (node.kind === "subgraph") {
    if (node.writes.length > 0) {
      node.writes = [{ ...node.writes[0], state: stateKey, mode: "replace" }, ...node.writes.slice(1)];
      return;
    }
    node.writes = [{ state: stateKey, mode: "replace" }];
    return;
  }
  if (node.kind !== "agent") {
    return;
  }
  if (!node.writes.some((binding) => binding.state === stateKey)) {
    node.writes = [...node.writes, { state: stateKey, mode: "replace" }];
  }
}

function applyStateNameToCreatedOutputNode(
  node: GraphNode,
  stateKey: string,
  stateSchema: Record<string, StateDefinition>,
) {
  if (node.kind !== "output") {
    return;
  }
  node.name = stateSchema[stateKey]?.name?.trim() || stateKey;
}

function buildCreationFlowEdge<T extends GraphPayload | GraphDocument>(
  document: T,
  sourceNodeId: string,
  targetNodeId: string,
  context?: NodeCreationContext | null,
) {
  if (context?.sourceAnchorKind === "route-out" && context.sourceBranchKey) {
    const existingConditionalEdge = document.conditional_edges.find((edge) => edge.source === sourceNodeId);
    if (existingConditionalEdge) {
      existingConditionalEdge.branches[context.sourceBranchKey] = targetNodeId;
    } else {
      document.conditional_edges = [
        ...document.conditional_edges,
        {
          source: sourceNodeId,
          branches: {
            [context.sourceBranchKey]: targetNodeId,
          },
        },
      ];
    }
    return;
  }

  if (!document.edges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId)) {
    document.edges = [...document.edges, { source: sourceNodeId, target: targetNodeId }];
  }
}

function buildNextVirtualStateField(document: GraphPayload | GraphDocument, stateType: string) {
  const stateField = buildNextDefaultStateField(document, {
    type: stateType,
  });
  return {
    ...stateField,
    definition: {
      ...stateField.definition,
      name: stateField.key,
    },
  };
}

function applyStateInputSourceConnection<T extends GraphPayload | GraphDocument>(
  document: T,
  input: ConnectStateInputSourceToTargetInput,
) {
  const rawTargetStateKey = input.targetStateKey.trim();
  const targetValueType = input.targetValueType?.trim() || "text";
  let targetStateKey = rawTargetStateKey;
  let createdStateKey: string | null = null;

  if (isVirtualAnyInputStateKey(rawTargetStateKey) || isCreateAgentInputStateKey(rawTargetStateKey)) {
    const targetStateField = buildNextVirtualStateField(document, targetValueType);
    document.state_schema[targetStateField.key] = targetStateField.definition;
    rememberDefaultStateKeyIndex(document, targetStateField.key);
    targetStateKey = targetStateField.key;
    createdStateKey = targetStateField.key;
  } else {
    ensureStateDefinitionForCreation(document, targetStateKey, targetValueType);
  }

  bindCreatedStateToSourceNode(document.nodes[input.sourceNodeId], targetStateKey);
  bindCreatedStateToNode(document.nodes[input.targetNodeId], targetStateKey);
  if (!isVirtualAnyInputStateKey(rawTargetStateKey) && !isCreateAgentInputStateKey(rawTargetStateKey)) {
    document.edges = filterReplacedStateInputSourceEdges(document, {
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      previousStateKey: rawTargetStateKey,
      nextStateKey: targetStateKey,
    });
  }
  buildCreationFlowEdge(document, input.sourceNodeId, input.targetNodeId, null);
  return createdStateKey;
}

export function connectStateInputSourceToTarget<T extends GraphPayload | GraphDocument>(
  document: T,
  input: ConnectStateInputSourceToTargetInput,
): ConnectStateInputSourceToTargetOutput<T> {
  if (!canConnectStateInputSource(document, input.sourceNodeId, input.targetNodeId, input.targetStateKey)) {
    return {
      document,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      createdStateKey: null,
    };
  }

  const nextDocument = cloneGraphDocument(document);
  const createdStateKey = applyStateInputSourceConnection(nextDocument, input);
  return {
    document: nextDocument,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    createdStateKey,
  };
}

export function applyNodeCreationResult<T extends GraphPayload | GraphDocument>(
  document: T,
  input: ApplyNodeCreationResultInput,
): ApplyNodeCreationResultOutput<T> {
  const nextDocument = cloneGraphDocument(document);
  nextDocument.nodes[input.createdNodeId] = input.createdNode;

  const addedMergedStateKeys = new Set<string>();
  for (const [stateKey, definition] of Object.entries(input.mergedStateSchema ?? {})) {
    if (!nextDocument.state_schema[stateKey]) {
      nextDocument.state_schema[stateKey] = definition;
      addedMergedStateKeys.add(stateKey);
      rememberDefaultStateKeyIndex(nextDocument, stateKey);
    }
  }

  const rawSourceStateKey = input.context?.sourceStateKey?.trim();
  const sourceValueType = input.context?.sourceValueType?.trim() || null;
  const rawTargetStateKey = input.context?.targetStateKey?.trim();
  const targetValueType = input.context?.targetValueType?.trim() || "text";
  let sourceStateKey = rawSourceStateKey;
  let createdStateKey: string | null = null;

  if (input.context?.targetNodeId && input.context.targetAnchorKind === "state-in" && rawTargetStateKey) {
    createdStateKey = applyStateInputSourceConnection(nextDocument, {
      sourceNodeId: input.createdNodeId,
      targetNodeId: input.context.targetNodeId,
      targetStateKey: rawTargetStateKey,
      targetValueType,
    });

    return {
      document: nextDocument,
      createdNodeId: input.createdNodeId,
      createdStateKey,
    };
  }

  if (isVirtualAnyOutputStateKey(rawSourceStateKey)) {
    const reusableSubgraphInputState = resolveReusableSubgraphInputState(input.createdNode);
    if (reusableSubgraphInputState) {
      sourceStateKey = reusableSubgraphInputState;
      createdStateKey = reusableSubgraphInputState;
    } else {
      const sourceStateField = buildNextVirtualStateField(
        nextDocument,
        input.context?.sourceNodeId
          ? sourceValueType || resolveInputNodeVirtualOutputType(nextDocument.nodes[input.context.sourceNodeId]) || "text"
          : sourceValueType || "text",
      );
      nextDocument.state_schema[sourceStateField.key] = sourceStateField.definition;
      rememberDefaultStateKeyIndex(nextDocument, sourceStateField.key);
      sourceStateKey = sourceStateField.key;
      createdStateKey = sourceStateField.key;
    }
    bindCreatedStateToSourceNode(
      input.context?.sourceNodeId ? nextDocument.nodes[input.context.sourceNodeId] : undefined,
      sourceStateKey,
    );
  }

  if (
    sourceStateKey &&
    (input.createdNode.kind === "output" ||
      input.createdNode.kind === "agent" ||
      input.createdNode.kind === "condition" ||
      input.createdNode.kind === "subgraph")
  ) {
    ensureStateDefinitionForCreation(nextDocument, sourceStateKey, sourceValueType || "text");
    bindCreatedStateToNode(nextDocument.nodes[input.createdNodeId], sourceStateKey);
    if (nextDocument.nodes[input.createdNodeId]?.kind === "agent") {
      reconcileAgentCapabilityInputBindingsInPlace(nextDocument, input.createdNodeId);
    }
    applyStateNameToCreatedOutputNode(nextDocument.nodes[input.createdNodeId], sourceStateKey, nextDocument.state_schema);
  }

  removeUnreferencedAddedStateKeys(nextDocument, addedMergedStateKeys);

  if (input.context?.sourceNodeId) {
    buildCreationFlowEdge(nextDocument, input.context.sourceNodeId, input.createdNodeId, input.context);
  }

  return {
    document: nextDocument,
    createdNodeId: input.createdNodeId,
    createdStateKey,
  };
}

function resolveReusableSubgraphInputState(node: GraphNode) {
  return node.kind === "subgraph" ? node.reads[0]?.state ?? null : null;
}

function removeUnreferencedAddedStateKeys(document: GraphPayload | GraphDocument, stateKeys: Set<string>) {
  if (stateKeys.size === 0) {
    return;
  }
  const referencedStateKeys = new Set<string>();
  for (const node of Object.values(document.nodes)) {
    for (const binding of node.reads) {
      referencedStateKeys.add(binding.state);
    }
    for (const binding of node.writes) {
      referencedStateKeys.add(binding.state);
    }
    if (node.kind === "condition" && node.config.rule.source) {
      referencedStateKeys.add(node.config.rule.source);
    }
  }
  for (const stateKey of stateKeys) {
    if (!referencedStateKeys.has(stateKey)) {
      delete document.state_schema[stateKey];
    }
  }
}

export type { CreatedNodeResult };

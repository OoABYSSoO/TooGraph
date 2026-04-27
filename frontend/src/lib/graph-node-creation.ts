import { cloneGraphDocument } from "./graph-document.ts";

import type {
  AgentNode,
  ConditionNode,
  GraphDocument,
  GraphNode,
  GraphPayload,
  GraphPosition,
  InputNode,
  NodeCreationContext,
  OutputNode,
  PresetDocument,
  StateDefinition,
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

function defaultStateDefinitionForType(stateKey: string, type: string): StateDefinition {
  return {
    name: stateKey,
    description: "",
    type,
    value: defaultValueForStateType(type),
    color: "",
  };
}

function defaultValueForStateType(type: string): unknown {
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

function normalizeCreatedNodeUi(position: GraphPosition) {
  return {
    position,
    collapsed: false,
  };
}

function buildTextInputStateKey(id: string) {
  return `${id}_value`;
}

function buildTextInputNode(id: string, position: GraphPosition, stateKey = buildTextInputStateKey(id)): InputNode {
  return {
    kind: "input",
    name: "Input",
    description: "Provide a value to the current workflow.",
    ui: normalizeCreatedNodeUi(position),
    reads: [],
    writes: [{ state: stateKey, mode: "replace" }],
    config: {
      value: "",
    },
  };
}

function buildOutputNode(id: string, position: GraphPosition): OutputNode {
  return {
    kind: "output",
    name: "Output",
    description: "Preview or persist the current workflow result.",
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

export function buildGenericInputNode(params: { id: string; position: GraphPosition; stateKey?: string }): CreatedNodeResult {
  const stateKey = params.stateKey ?? buildTextInputStateKey(params.id);
  return {
    id: params.id,
    node: buildTextInputNode(params.id, params.position, stateKey),
    state_schema: {
      [stateKey]: {
        ...defaultStateDefinitionForType(stateKey, "text"),
        name: "Input",
      },
    },
  };
}

export function buildGenericOutputNode(params: { id: string; position: GraphPosition }): CreatedNodeResult {
  return {
    id: params.id,
    node: buildOutputNode(params.id, params.position),
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

export function buildInputNodeFromFile(params: {
  id: string;
  position: GraphPosition;
  stateKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  content: string;
  detectedType: string;
  encoding: "text" | "data_url";
}): CreatedNodeResult {
  const stateKey = params.stateKey;
  const uploadedValue = JSON.stringify({
    kind: "uploaded_file",
    name: params.fileName,
    mimeType: params.mimeType || "application/octet-stream",
    size: params.size,
    detectedType: params.detectedType,
    content: params.content,
    encoding: params.encoding,
  });
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

  if (node.kind === "agent" || node.kind === "condition") {
    if (!node.reads.some((binding) => binding.state === stateKey)) {
      node.reads = [...node.reads, { state: stateKey, required: true }];
    }
    if (node.kind === "condition" && !node.config.rule.source.trim()) {
      node.config.rule.source = stateKey;
    }
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

export function applyNodeCreationResult<T extends GraphPayload | GraphDocument>(
  document: T,
  input: ApplyNodeCreationResultInput,
): { document: T; createdNodeId: string } {
  const nextDocument = cloneGraphDocument(document);
  nextDocument.nodes[input.createdNodeId] = input.createdNode;

  for (const [stateKey, definition] of Object.entries(input.mergedStateSchema ?? {})) {
    if (!nextDocument.state_schema[stateKey]) {
      nextDocument.state_schema[stateKey] = definition;
    }
  }

  const sourceStateKey = input.context?.sourceStateKey?.trim();
  const sourceValueType = input.context?.sourceValueType?.trim() || "text";
  if (sourceStateKey && (input.createdNode.kind === "output" || input.createdNode.kind === "agent" || input.createdNode.kind === "condition")) {
    ensureStateDefinitionForCreation(nextDocument, sourceStateKey, sourceValueType);
    bindCreatedStateToNode(nextDocument.nodes[input.createdNodeId], sourceStateKey);
    applyStateNameToCreatedOutputNode(nextDocument.nodes[input.createdNodeId], sourceStateKey, nextDocument.state_schema);
  }

  if (input.context?.sourceNodeId) {
    buildCreationFlowEdge(nextDocument, input.context.sourceNodeId, input.createdNodeId, input.context);
  }

  return {
    document: nextDocument,
    createdNodeId: input.createdNodeId,
  };
}

export type { CreatedNodeResult };

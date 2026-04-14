import type {
  AgentNode,
  ConditionNode,
  GraphPosition,
  InputBoundaryNode,
  NodePresetDefinition,
  NodeSystemGraphNode,
  NodeSystemGraphPayload,
  NodeViewportSize,
  OutputBoundaryNode,
  StateField,
  StateFieldType,
} from "@/lib/node-system-schema";

export type CanonicalStateType =
  | "text"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "markdown"
  | "json"
  | "file_list"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "knowledge_base";

export type CanonicalStateDefinition = {
  description: string;
  type: CanonicalStateType;
  value?: unknown;
  color: string;
};

export type CanonicalReadBinding = {
  state: string;
  required?: boolean;
};

export type CanonicalWriteBinding = {
  state: string;
  mode?: "replace";
};

export type CanonicalNodeUi = {
  position: GraphPosition;
  collapsed?: boolean;
  expandedSize?: NodeViewportSize | null;
  collapsedSize?: NodeViewportSize | null;
};

export type CanonicalInputNode = {
  kind: "input";
  name: string;
  description: string;
  ui: CanonicalNodeUi;
  reads: CanonicalReadBinding[];
  writes: CanonicalWriteBinding[];
  config: {
    value: unknown;
  };
};

export type CanonicalAgentNode = {
  kind: "agent";
  name: string;
  description: string;
  ui: CanonicalNodeUi;
  reads: CanonicalReadBinding[];
  writes: CanonicalWriteBinding[];
  config: {
    skills: string[];
    systemInstruction: string;
    taskInstruction: string;
    modelSource: "global" | "override";
    model: string;
    thinkingMode: "off" | "on";
    temperature: number;
  };
};

export type CanonicalConditionNode = {
  kind: "condition";
  name: string;
  description: string;
  ui: CanonicalNodeUi;
  reads: CanonicalReadBinding[];
  writes: CanonicalWriteBinding[];
  config: {
    branches: string[];
    conditionMode: "rule" | "cycle";
    branchMapping: Record<string, string>;
    rule: ConditionNode["rule"];
  };
};

export type CanonicalOutputNode = {
  kind: "output";
  name: string;
  description: string;
  ui: CanonicalNodeUi;
  reads: CanonicalReadBinding[];
  writes: CanonicalWriteBinding[];
  config: {
    displayMode: "auto" | "plain" | "markdown" | "json";
    persistEnabled: boolean;
    persistFormat: "txt" | "md" | "json" | "auto";
    fileNameTemplate: string;
  };
};

export type CanonicalNode =
  | CanonicalInputNode
  | CanonicalAgentNode
  | CanonicalConditionNode
  | CanonicalOutputNode;

export type CanonicalEdge = {
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
};

export type CanonicalConditionalEdge = {
  source: string;
  branches: Record<string, string>;
};

export type CanonicalGraphPayload = {
  graph_family: "node_system";
  graph_id?: string | null;
  name: string;
  state_schema: Record<string, CanonicalStateDefinition>;
  nodes: Record<string, CanonicalNode>;
  edges: CanonicalEdge[];
  conditional_edges: CanonicalConditionalEdge[];
  metadata: Record<string, unknown>;
};

const LEGACY_GENERIC_PORT_KEYS = new Set(["value", "input", "output", "result", "text"]);

function stripString(value: unknown): string {
  return String(value ?? "").trim();
}

function canonicalStateTypeFromLegacy(stateType: StateFieldType | string | undefined): CanonicalStateType {
  switch (stateType) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    case "array":
      return "array";
    case "markdown":
      return "markdown";
    case "json":
      return "json";
    case "file_list":
      return "file_list";
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
    case "string":
    case "text":
    default:
      return "text";
  }
}

function canonicalStateTypeFromValueType(valueType: string | undefined): CanonicalStateType {
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

function ensureStateDefinition(
  stateSchema: Record<string, CanonicalStateDefinition>,
  stateKey: string,
  preferredType?: CanonicalStateType,
): void {
  if (!stateSchema[stateKey]) {
    stateSchema[stateKey] = {
      description: "",
      type: preferredType ?? "text",
      value: preferredType === "number" ? 0 : preferredType === "boolean" ? false : preferredType === "json" || preferredType === "object" ? {} : preferredType === "array" || preferredType === "file_list" ? [] : "",
      color: "",
    };
    return;
  }

  if (
    preferredType &&
    stateSchema[stateKey].type === "text" &&
    preferredType !== "text"
  ) {
    stateSchema[stateKey] = {
      ...stateSchema[stateKey],
      type: preferredType,
    };
  }
}

function chooseConnectedStateName(sourceState: string, targetState: string): string {
  if (sourceState === targetState) return sourceState;
  const sourceGeneric = LEGACY_GENERIC_PORT_KEYS.has(sourceState);
  const targetGeneric = LEGACY_GENERIC_PORT_KEYS.has(targetState);
  if (sourceGeneric && !targetGeneric) return targetState;
  if (targetGeneric && !sourceGeneric) return sourceState;
  return sourceState;
}

function getPortKeyFromHandle(handleId?: string | null): string {
  if (!handleId) return "";
  const [, key] = handleId.split(":", 2);
  return stripString(key);
}

function extractLegacyStateReads(config: NodePresetDefinition): Record<string, { stateKey: string; required?: boolean }> {
  const result: Record<string, { stateKey: string; required?: boolean }> = {};
  for (const binding of config.stateReads ?? []) {
    result[binding.inputKey] = {
      stateKey: binding.stateKey,
      required: binding.required,
    };
  }

  if (config.family === "agent" || config.family === "condition") {
    for (const input of config.inputs) {
      if (!result[input.key]) {
        result[input.key] = {
          stateKey: input.key,
          required: input.required,
        };
      }
    }
  } else if (config.family === "output") {
    result[config.input.key] = result[config.input.key] ?? {
      stateKey: config.input.key,
      required: config.input.required,
    };
  }

  return result;
}

function extractLegacyStateWrites(config: NodePresetDefinition): Record<string, { stateKey: string }> {
  const result: Record<string, { stateKey: string }> = {};
  for (const binding of config.stateWrites ?? []) {
    result[binding.outputKey] = {
      stateKey: binding.stateKey,
    };
  }

  if (config.family === "agent") {
    for (const output of config.outputs) {
      if (!result[output.key]) {
        result[output.key] = { stateKey: output.key };
      }
    }
  } else if (config.family === "input") {
    result[config.output.key] = result[config.output.key] ?? { stateKey: config.output.key };
  }

  return result;
}

function toCanonicalNode(node: NodeSystemGraphNode): CanonicalNode {
  const config = node.data.config;
  const readsByPort = extractLegacyStateReads(config);
  const writesByPort = extractLegacyStateWrites(config);
  const ui: CanonicalNodeUi = {
    position: node.position,
    collapsed: config.family === "input" ? false : !Boolean(node.data.isExpanded),
    expandedSize: node.data.expandedSize ?? null,
    collapsedSize: node.data.collapsedSize ?? null,
  };
  const name =
    stripString((config as { name?: string }).name) ||
    stripString((config as { label?: string }).label) ||
    node.id;
  const description = stripString((config as { description?: string }).description);

  if (config.family === "input") {
    const legacyConfig = config as InputBoundaryNode & { defaultValue?: unknown };
    return {
      kind: "input",
      name,
      description,
      ui,
      reads: [],
      writes: Object.values(writesByPort).map((binding) => ({ state: binding.stateKey, mode: "replace" })),
      config: {
        value: legacyConfig.value ?? legacyConfig.defaultValue,
      },
    };
  }

  if (config.family === "agent") {
    return {
      kind: "agent",
      name,
      description,
      ui,
      reads: Object.values(readsByPort).map((binding) => ({ state: binding.stateKey, required: binding.required })),
      writes: Object.values(writesByPort).map((binding) => ({ state: binding.stateKey, mode: "replace" })),
      config: {
        skills: config.skills.map((skill) => skill.skillKey),
        systemInstruction: config.systemInstruction,
        taskInstruction: config.taskInstruction,
        modelSource: config.modelSource ?? "global",
        model: config.model ?? "",
        thinkingMode: config.thinkingMode ?? "on",
        temperature: typeof config.temperature === "number" ? config.temperature : 0.2,
      },
    };
  }

  if (config.family === "condition") {
    return {
      kind: "condition",
      name,
      description,
      ui,
      reads: Object.values(readsByPort).map((binding) => ({ state: binding.stateKey, required: binding.required })),
      writes: Object.values(writesByPort).map((binding) => ({ state: binding.stateKey, mode: "replace" })),
      config: {
        branches: config.branches.map((branch) => branch.key),
        conditionMode: config.conditionMode,
        branchMapping: config.branchMapping,
        rule: config.rule,
      },
    };
  }

  const outputConfig = config as OutputBoundaryNode;
  return {
    kind: "output",
    name,
    description,
    ui,
    reads: Object.values(readsByPort).map((binding) => ({ state: binding.stateKey, required: binding.required })),
    writes: [],
    config: {
      displayMode: outputConfig.displayMode,
      persistEnabled: outputConfig.persistEnabled,
      persistFormat: outputConfig.persistFormat,
      fileNameTemplate: outputConfig.fileNameTemplate,
    },
  };
}

export function buildCanonicalGraphFromLegacyGraph(graph: NodeSystemGraphPayload): CanonicalGraphPayload {
  const stateSchema: Record<string, CanonicalStateDefinition> = {};
  for (const field of graph.state_schema) {
    const legacyField = field as StateField & { defaultValue?: unknown };
    stateSchema[field.key] = {
      description: field.description,
      type: canonicalStateTypeFromLegacy(field.type),
      value: legacyField.value ?? legacyField.defaultValue,
      color: field.ui?.color ?? "",
    };
  }

  const nodes = Object.fromEntries(
    graph.nodes.map((node) => [node.id, toCanonicalNode(node)]),
  );
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const conditionalEdgesBySource: Record<string, Record<string, string>> = {};
  const edges: CanonicalEdge[] = [];

  for (const edge of graph.edges) {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourceConfig = sourceNode.data.config;
    const targetConfig = targetNode.data.config;
    const sourcePortKey = getPortKeyFromHandle(edge.sourceHandle);
    const targetPortKey = getPortKeyFromHandle(edge.targetHandle);

    if (sourceConfig.family === "condition") {
      if (sourcePortKey) {
        conditionalEdgesBySource[edge.source] = {
          ...(conditionalEdgesBySource[edge.source] ?? {}),
          [sourcePortKey]: edge.target,
        };
      }
      continue;
    }

    if (!sourcePortKey || !targetPortKey) continue;

    const sourceBindings = extractLegacyStateWrites(sourceConfig);
    const targetBindings = extractLegacyStateReads(targetConfig);
    const sourceState = sourceBindings[sourcePortKey]?.stateKey ?? sourcePortKey;
    const targetState = targetBindings[targetPortKey]?.stateKey ?? targetPortKey;
    const stateKey = chooseConnectedStateName(sourceState, targetState);

    const sourcePreferredType =
      sourceConfig.family === "input"
        ? canonicalStateTypeFromValueType(sourceConfig.output.valueType)
        : sourceConfig.family === "agent"
          ? canonicalStateTypeFromValueType(sourceConfig.outputs.find((item) => item.key === sourcePortKey)?.valueType)
          : "text";
    const targetPreferredType =
      targetConfig.family === "output"
        ? canonicalStateTypeFromValueType(targetConfig.input.valueType)
        : targetConfig.family === "agent" || targetConfig.family === "condition"
          ? canonicalStateTypeFromValueType(targetConfig.inputs.find((item) => item.key === targetPortKey)?.valueType)
          : "text";
    ensureStateDefinition(stateSchema, stateKey, sourcePreferredType);
    ensureStateDefinition(stateSchema, stateKey, targetPreferredType);

    edges.push({
      source: edge.source,
      target: edge.target,
      sourceHandle: `write:${stateKey}`,
      targetHandle: `read:${stateKey}`,
    });
  }

  return {
    graph_family: "node_system",
    graph_id: graph.graph_id ?? null,
    name: graph.name,
    state_schema: stateSchema,
    nodes,
    edges,
    conditional_edges: Object.entries(conditionalEdgesBySource).map(([source, branches]) => ({
      source,
      branches,
    })),
    metadata: graph.metadata,
  };
}

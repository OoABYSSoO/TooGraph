import type {
  AgentNode,
  BranchDefinition,
  ConditionNode,
  GraphPosition,
  InputBoundaryNode,
  NodePresetDefinition,
  NodeSystemGraphNode,
  NodeViewportSize,
  OutputBoundaryNode,
  PortDefinition,
  StateField,
  StateFieldType,
  ValueType,
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
  name: string;
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
  graph_id?: string | null;
  name: string;
  state_schema: Record<string, CanonicalStateDefinition>;
  nodes: Record<string, CanonicalNode>;
  edges: CanonicalEdge[];
  conditional_edges: CanonicalConditionalEdge[];
  metadata: Record<string, unknown>;
};

export type CanonicalTemplateRecord = {
  template_id: string;
  label: string;
  description: string;
  default_graph_name: string;
  state_schema: Record<string, CanonicalStateDefinition>;
  nodes: Record<string, CanonicalNode>;
  edges: CanonicalEdge[];
  conditional_edges: CanonicalConditionalEdge[];
  metadata: Record<string, unknown>;
};

export type CanonicalPresetDefinition = {
  label: string;
  description: string;
  state_schema: Record<string, CanonicalStateDefinition>;
  node: CanonicalNode;
};

export type CanonicalPresetDocument = {
  presetId: string;
  sourcePresetId?: string | null;
  definition: CanonicalPresetDefinition;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type EditorPresetRecord = {
  presetId: string;
  sourcePresetId?: string | null;
  definition: NodePresetDefinition;
  stateSchema: StateField[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

function stripString(value: unknown): string {
  return String(value ?? "").trim();
}

function legacyStateTypeFromCanonical(stateType: CanonicalStateType): StateFieldType {
  return stateType === "text" ? "string" : stateType;
}

function valueTypeFromCanonicalState(stateType: CanonicalStateType): ValueType {
  switch (stateType) {
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
    default:
      return "text";
  }
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

export function buildCanonicalNodeFromLegacyNode(node: NodeSystemGraphNode): CanonicalNode {
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

export function buildEditorStateFieldsFromCanonicalGraph(graph: CanonicalGraphPayload): StateField[] {
  return Object.entries(graph.state_schema).map(([key, definition]) => ({
    key,
    name: stripString(definition.name) || key,
    description: definition.description,
    type: legacyStateTypeFromCanonical(definition.type),
    value: definition.value,
    ui: {
      color: definition.color,
    },
  }));
}

function buildEditorPort(
  stateKey: string,
  stateSchema: Record<string, CanonicalStateDefinition>,
  required = false,
): PortDefinition {
  const definition = stateSchema[stateKey];
  const label = stripString(definition?.name) || stateKey;
  return {
    key: stateKey,
    label,
    valueType: valueTypeFromCanonicalState(definition?.type ?? "text"),
    required,
  };
}

function buildEditorConditionBranches(branches: string[]): BranchDefinition[] {
  return branches.map((branch) => ({
    key: branch,
    label: "",
  }));
}

function createEditorSkillAttachment(skillKey: string) {
  return {
    name: skillKey,
    skillKey,
    inputMapping: {},
    contextBinding: {},
    usage: "optional" as const,
  };
}

export function buildEditorNodeConfigFromCanonicalNode(
  nodeId: string,
  node: CanonicalNode,
  stateSchema: Record<string, CanonicalStateDefinition>,
): NodePresetDefinition {
  if (node.kind === "input") {
    const outputState = node.writes[0]?.state ?? "value";
    const outputPort = buildEditorPort(outputState, stateSchema, false);
    return {
      presetId: `node.input.${nodeId}`,
      name: stripString(node.name) || nodeId,
      description: node.description ?? "",
      family: "input",
      valueType: outputPort.valueType,
      output: outputPort,
      value: String(node.config.value ?? ""),
      stateReads: [],
        stateWrites: node.writes.map((binding) => ({
          stateKey: binding.state,
          outputKey: binding.state,
          mode: binding.mode,
        })),
    } satisfies InputBoundaryNode;
  }

  if (node.kind === "agent") {
    return {
      presetId: `node.agent.${nodeId}`,
      name: stripString(node.name) || nodeId,
      description: node.description ?? "",
      family: "agent",
      inputs: node.reads.map((binding) => buildEditorPort(binding.state, stateSchema, binding.required)),
      outputs: node.writes.map((binding) => buildEditorPort(binding.state, stateSchema, false)),
      systemInstruction: node.config.systemInstruction,
      taskInstruction: node.config.taskInstruction,
      skills: node.config.skills.map((skillKey) => createEditorSkillAttachment(skillKey)),
      outputBinding: {},
      modelSource: node.config.modelSource,
      model: node.config.model,
      thinkingMode: node.config.thinkingMode,
      temperature: node.config.temperature,
      stateReads: node.reads.map((binding) => ({
        stateKey: binding.state,
        inputKey: binding.state,
        required: binding.required,
      })),
        stateWrites: node.writes.map((binding) => ({
          stateKey: binding.state,
          outputKey: binding.state,
          mode: binding.mode,
        })),
    } satisfies AgentNode;
  }

  if (node.kind === "condition") {
    return {
      presetId: `node.condition.${nodeId}`,
      name: stripString(node.name) || nodeId,
      description: node.description ?? "",
      family: "condition",
      inputs: node.reads.map((binding) => buildEditorPort(binding.state, stateSchema, binding.required)),
      branches: buildEditorConditionBranches(node.config.branches),
      conditionMode: node.config.conditionMode,
      rule: node.config.rule,
      branchMapping: node.config.branchMapping,
      stateReads: node.reads.map((binding) => ({
        stateKey: binding.state,
        inputKey: binding.state,
        required: binding.required,
      })),
        stateWrites: node.writes.map((binding) => ({
          stateKey: binding.state,
          outputKey: binding.state,
          mode: binding.mode,
        })),
    } satisfies ConditionNode;
  }

  const inputState = node.reads[0]?.state ?? "value";
  return {
    presetId: `node.output.${nodeId}`,
    name: stripString(node.name) || nodeId,
    description: node.description ?? "",
    family: "output",
    input: buildEditorPort(inputState, stateSchema, node.reads[0]?.required ?? true),
    displayMode: node.config.displayMode,
    persistEnabled: node.config.persistEnabled,
    persistFormat: node.config.persistFormat,
    fileNameTemplate: node.config.fileNameTemplate,
    stateReads: node.reads.map((binding) => ({
      stateKey: binding.state,
      inputKey: binding.state,
      required: binding.required,
      })),
    stateWrites: [],
  } satisfies OutputBoundaryNode;
}

export function buildEditorPresetRecordFromCanonicalPreset(preset: CanonicalPresetDocument): EditorPresetRecord {
  const nodeId = "preset_node";
  const presetNode = {
    ...preset.definition.node,
    ui: {
      ...preset.definition.node.ui,
      position: preset.definition.node.ui.position ?? { x: 0, y: 0 },
    },
  } satisfies CanonicalNode;
  return {
    presetId: preset.presetId,
    sourcePresetId: preset.sourcePresetId ?? null,
    definition: {
      ...buildEditorNodeConfigFromCanonicalNode(nodeId, presetNode, preset.definition.state_schema),
      presetId: preset.presetId,
      name: preset.definition.node.name || nodeId,
      description: preset.definition.description || preset.definition.node.description,
    },
    stateSchema: buildEditorStateFieldsFromCanonicalGraph({
      graph_id: null,
      name: preset.definition.label || preset.definition.node.name || preset.presetId,
      state_schema: preset.definition.state_schema,
      nodes: {
        [nodeId]: presetNode,
      },
      edges: [],
      conditional_edges: [],
      metadata: {},
    }),
    createdAt: preset.createdAt ?? null,
    updatedAt: preset.updatedAt ?? null,
  };
}

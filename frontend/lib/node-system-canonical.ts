import type {
  AgentNode,
  BranchDefinition,
  ConditionNode,
  GraphPosition,
  InputBoundaryNode,
  NodePresetDefinition,
  NodeViewportSize,
  OutputBoundaryNode,
  PortDefinition,
  StateField,
  StateFieldType,
  ValueType,
} from "@/lib/node-system-schema";
import { buildConditionRuleSourceOptions } from "./node-system-condition-rule.ts";

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
    loopLimit: number;
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

function stripString(value: unknown): string {
  return String(value ?? "").trim();
}

function stateFieldTypeFromCanonicalState(stateType: CanonicalStateType): StateFieldType {
  return stateType;
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

function isValueTypeCompatible(source: ValueType, target: ValueType) {
  return source === "any" || target === "any" || source === target;
}

function collectStateReadsByPort(config: NodePresetDefinition): Record<string, { stateKey: string; required?: boolean }> {
  if (config.family === "agent" || config.family === "condition") {
    return Object.fromEntries(
      config.inputs.map((input) => [
        input.key,
        {
          stateKey: input.key,
          required: input.required,
        },
      ]),
    );
  }

  if (config.family === "output") {
    return {
      [config.input.key]: {
        stateKey: config.input.key,
        required: config.input.required,
      },
    };
  }

  return {};
}

function collectStateWritesByPort(config: NodePresetDefinition): Record<string, { stateKey: string }> {
  if (config.family === "agent") {
    return Object.fromEntries(
      config.outputs.map((output) => [
        output.key,
        {
          stateKey: output.key,
        },
      ]),
    );
  }

  if (config.family === "input") {
    return {
      [config.output.key]: {
        stateKey: config.output.key,
      },
    };
  }

  return {};
}

export function buildCanonicalNodeFromEditorConfig(params: {
  nodeId: string;
  position: GraphPosition;
  isExpanded: boolean;
  collapsedSize?: NodeViewportSize | null;
  expandedSize?: NodeViewportSize | null;
  config: NodePresetDefinition;
}): CanonicalNode {
  const { nodeId, position, isExpanded, collapsedSize, expandedSize } = params;
  const config = params.config;
  const readsByPort = collectStateReadsByPort(config);
  const writesByPort = collectStateWritesByPort(config);
  const ui: CanonicalNodeUi = {
    position,
    collapsed: config.family === "input" ? false : !isExpanded,
    expandedSize: expandedSize ?? null,
    collapsedSize: collapsedSize ?? null,
  };
  const name = stripString((config as { name?: string }).name) || nodeId;
  const description = stripString((config as { description?: string }).description);

  if (config.family === "input") {
    return {
      kind: "input",
      name,
      description,
      ui,
      reads: [],
      writes: Object.values(writesByPort).map((binding) => ({ state: binding.stateKey, mode: "replace" })),
      config: {
        value: config.value,
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
        skills: [...config.skills],
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
        loopLimit: typeof config.loopLimit === "number" ? config.loopLimit : -1,
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

export function buildEditorStateFieldsFromCanonicalStateSchema(
  stateSchema: Record<string, CanonicalStateDefinition>,
): StateField[] {
  return Object.entries(stateSchema).map(([key, definition]) => ({
    key,
    name: stripString(definition.name) || key,
    description: definition.description,
    type: stateFieldTypeFromCanonicalState(definition.type),
    value: definition.value,
    ui: {
      color: definition.color,
    },
  }));
}

export function buildEditorStateFieldsFromCanonicalGraph(graph: CanonicalGraphPayload): StateField[] {
  return buildEditorStateFieldsFromCanonicalStateSchema(graph.state_schema);
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

export function getCanonicalNodeDisplayName(nodeId: string, node: CanonicalNode): string {
  return stripString(node.name) || nodeId;
}

export function listEditorInputPortsFromCanonicalNode(
  node: CanonicalNode,
  stateSchema: Record<string, CanonicalStateDefinition>,
): PortDefinition[] {
  if (node.kind === "agent" || node.kind === "condition") {
    return node.reads.map((binding) => buildEditorPort(binding.state, stateSchema, binding.required));
  }
  if (node.kind === "output") {
    const inputState = node.reads[0]?.state ?? "value";
    return [buildEditorPort(inputState, stateSchema, node.reads[0]?.required ?? true)];
  }
  return [];
}

export function listEditorOutputPortsFromCanonicalNode(
  node: CanonicalNode,
  stateSchema: Record<string, CanonicalStateDefinition>,
): PortDefinition[] {
  if (node.kind === "agent") {
    return node.writes.map((binding) => buildEditorPort(binding.state, stateSchema, false));
  }
  if (node.kind === "input") {
    const outputState = node.writes[0]?.state ?? "value";
    return [buildEditorPort(outputState, stateSchema, false)];
  }
  if (node.kind === "condition") {
    return buildEditorConditionBranches(node.config.branches).map((branch) => ({
      key: branch.key,
      label: branch.label,
      valueType: "any",
    }));
  }
  return [];
}

export function getEditorPortValueTypeFromCanonicalHandle(
  node: CanonicalNode,
  stateSchema: Record<string, CanonicalStateDefinition>,
  handleId?: string | null,
  createInputPortKey = "__create__",
): ValueType | null {
  if (!handleId) return null;
  const [side, key] = handleId.split(":");
  if (!key) return null;

  if (node.kind === "agent") {
    if (side === "input" && key === createInputPortKey) return "any";
    if (side === "input") return listEditorInputPortsFromCanonicalNode(node, stateSchema).find((port) => port.key === key)?.valueType ?? null;
    if (side === "output") return listEditorOutputPortsFromCanonicalNode(node, stateSchema).find((port) => port.key === key)?.valueType ?? null;
  }

  if (node.kind === "condition") {
    if (side === "input" && key === createInputPortKey) return "any";
    if (side === "input") return listEditorInputPortsFromCanonicalNode(node, stateSchema).find((port) => port.key === key)?.valueType ?? null;
    if (side === "output") return "any";
  }

  if (node.kind === "input" && side === "output") {
    return listEditorOutputPortsFromCanonicalNode(node, stateSchema).find((port) => port.key === key)?.valueType ?? null;
  }

  if (node.kind === "output" && side === "input") {
    return listEditorInputPortsFromCanonicalNode(node, stateSchema).find((port) => port.key === key)?.valueType ?? null;
  }

  return null;
}

export function findFirstCompatibleInputHandleFromCanonicalNode(
  node: CanonicalNode,
  stateSchema: Record<string, CanonicalStateDefinition>,
  sourceType: ValueType,
  createInputPortKey = "__create__",
): string | null {
  const inputPort = listEditorInputPortsFromCanonicalNode(node, stateSchema).find((port) =>
    isValueTypeCompatible(sourceType, port.valueType),
  );
  if (inputPort) {
    return `input:${inputPort.key}`;
  }
  if (node.kind === "agent" || node.kind === "condition") {
    return `input:${createInputPortKey}`;
  }
  return null;
}

function isKnowledgeBaseSkill(skillKey: string) {
  return skillKey === "search_knowledge_base";
}

function areSkillKeyListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((skillKey, index) => skillKey === right[index]);
}

function pickCanonicalAgentKnowledgeQueryInputKey(
  node: CanonicalAgentNode,
  stateSchema: Record<string, CanonicalStateDefinition>,
  knowledgeBaseInputKey: string,
) {
  const candidateInputs = listEditorInputPortsFromCanonicalNode(node, stateSchema).filter(
    (port) => port.key !== knowledgeBaseInputKey && port.valueType !== "knowledge_base",
  );
  const preferredKeys = ["question", "query", "input"];
  for (const key of preferredKeys) {
    const matched = candidateInputs.find((port) => port.key === key);
    if (matched) {
      return matched.key;
    }
  }

  const preferredTextInput =
    candidateInputs.find((port) => port.required && (port.valueType === "text" || port.valueType === "any")) ??
    candidateInputs.find((port) => port.valueType === "text" || port.valueType === "any");
  return preferredTextInput?.key ?? null;
}

export function syncKnowledgeBaseSkillOnCanonicalAgentNode(
  node: CanonicalAgentNode,
  stateSchema: Record<string, CanonicalStateDefinition>,
  knowledgeBaseInputKeys: string[],
): CanonicalAgentNode {
  const skillsWithoutKnowledgeBase = node.config.skills.filter((skillKey) => !isKnowledgeBaseSkill(skillKey));

  if (knowledgeBaseInputKeys.length !== 1) {
    return areSkillKeyListsEqual(skillsWithoutKnowledgeBase, node.config.skills)
      ? node
      : {
          ...node,
          config: {
            ...node.config,
            skills: skillsWithoutKnowledgeBase,
          },
        };
  }

  const knowledgeBaseInputKey = knowledgeBaseInputKeys[0];
  const queryInputKey = pickCanonicalAgentKnowledgeQueryInputKey(node, stateSchema, knowledgeBaseInputKey);
  if (!queryInputKey) {
    return areSkillKeyListsEqual(skillsWithoutKnowledgeBase, node.config.skills)
      ? node
      : {
          ...node,
          config: {
            ...node.config,
            skills: skillsWithoutKnowledgeBase,
          },
        };
  }

  void knowledgeBaseInputKey;
  void queryInputKey;
  const nextSkills = [...skillsWithoutKnowledgeBase, "search_knowledge_base"];
  return areSkillKeyListsEqual(nextSkills, node.config.skills)
    ? node
    : {
        ...node,
        config: {
          ...node.config,
          skills: nextSkills,
        },
      };
}

function buildEditorConditionBranches(branches: string[]): BranchDefinition[] {
  return branches.map((branch) => ({
    key: branch,
    label: branch,
  }));
}

export function buildEditorNodeConfigFromCanonicalNode(
  nodeId: string,
  node: CanonicalNode,
  stateSchema: Record<string, CanonicalStateDefinition>,
): NodePresetDefinition {
  if (node.kind === "input") {
    const outputState = node.writes[0]?.state ?? "value";
    const outputPort = buildEditorPort(outputState, stateSchema, false);
    const stateDefinition = stateSchema[outputState];
    return {
      presetId: `node.input.${nodeId}`,
      name: stripString(node.name) || nodeId,
      description: node.description ?? "",
      family: "input",
      valueType: outputPort.valueType,
      output: outputPort,
      value: String(stateDefinition?.value ?? node.config.value ?? ""),
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
      skills: [...node.config.skills],
      modelSource: node.config.modelSource,
      model: node.config.model,
      thinkingMode: node.config.thinkingMode,
      temperature: node.config.temperature,
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
      loopLimit: typeof node.config.loopLimit === "number" ? node.config.loopLimit : -1,
      rule: node.config.rule,
      branchMapping: node.config.branchMapping,
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
  } satisfies OutputBoundaryNode;
}

export function buildEditorNodeConfigFromCanonicalPreset(preset: CanonicalPresetDocument): NodePresetDefinition {
  const nodeId = "preset_node";
  const presetNode = {
    ...preset.definition.node,
    ui: {
      ...preset.definition.node.ui,
      position: preset.definition.node.ui.position ?? { x: 0, y: 0 },
    },
  } satisfies CanonicalNode;
  return {
    ...buildEditorNodeConfigFromCanonicalNode(nodeId, presetNode, preset.definition.state_schema),
    presetId: preset.presetId,
    name: preset.definition.node.name || nodeId,
    description: preset.definition.description || preset.definition.node.description,
  };
}

export function listConditionRuleSourceOptions(
  node: Pick<CanonicalConditionNode, "reads">,
  stateSchema: Record<string, CanonicalStateDefinition>,
) {
  return buildConditionRuleSourceOptions(node.reads, stateSchema);
}

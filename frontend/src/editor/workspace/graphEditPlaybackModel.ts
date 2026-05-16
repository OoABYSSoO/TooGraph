import {
  cloneGraphDocument,
  connectFlowNodesInDocument,
  updateAgentNodeConfigInDocument,
  updateNodeMetadataInDocument,
} from "../../lib/graph-document.ts";
import { addStateBindingToDocument } from "./statePanelBindings.ts";
import {
  buildNextDefaultStateField,
  insertStateFieldIntoDocument,
} from "./statePanelFields.ts";

import type {
  AgentNode,
  ConditionNode,
  GraphDocument,
  GraphNode,
  GraphPayload,
  GraphPosition,
  InputNode,
  OutputNode,
  StateDefinition,
} from "../../types/node-system.ts";

export const GRAPH_EDIT_PLAYBACK_CAPABILITY_MANUAL = [
  "Graph Edit Playback capability:",
  "- LLM 输出产品语义，不输出浏览器实现细节或 UI 点击手法。",
  "- 支持 create_node: 创建 input、agent、output、condition 节点，并提供 title、description、taskInstruction、positionHint。",
  "- 支持 create_state: 创建 state，并提供 name、description、valueType、value。",
  "- 支持 bind_state: 把 state 绑定到节点 read/write 端口。",
  "- 支持 connect_nodes: 连接两个节点的流程边。",
  "- 支持 update_node: 修改已有节点标题、简介或 Agent 任务说明。",
  "- 执行器会把语义命令编译成可见 UI playback 和可审计 graph commands。",
].join("\n");

export type GraphEditNodeType = "input" | "agent" | "output" | "condition";
export type GraphEditStateBindingMode = "read" | "write";

export type GraphEditCreateNodeIntent = {
  kind: "create_node";
  ref: string;
  nodeType: GraphEditNodeType;
  title?: string;
  description?: string;
  taskInstruction?: string;
  position?: Partial<GraphPosition> | null;
  positionHint?: string;
};

export type GraphEditUpdateNodeIntent = {
  kind: "update_node";
  nodeRef: string;
  title?: string;
  description?: string;
  taskInstruction?: string;
};

export type GraphEditCreateStateIntent = {
  kind: "create_state";
  ref: string;
  name?: string;
  description?: string;
  valueType?: string;
  value?: unknown;
  color?: string;
};

export type GraphEditBindStateIntent = {
  kind: "bind_state";
  nodeRef: string;
  stateRef: string;
  mode: GraphEditStateBindingMode;
  required?: boolean;
};

export type GraphEditConnectNodesIntent = {
  kind: "connect_nodes";
  sourceRef: string;
  targetRef: string;
};

export type GraphEditIntent =
  | GraphEditCreateNodeIntent
  | GraphEditUpdateNodeIntent
  | GraphEditCreateStateIntent
  | GraphEditBindStateIntent
  | GraphEditConnectNodesIntent;

export type GraphEditIntentPackage = {
  operations: GraphEditIntent[];
};

type GraphEditCommandBase = {
  commandId: string;
  summary: string;
};

export type GraphEditCreateNodeCommand = GraphEditCommandBase & {
  kind: "create_node";
  nodeRef: string;
  nodeId: string;
  nodeType: GraphEditNodeType;
  title: string;
  description: string;
  taskInstruction: string;
  position: GraphPosition;
  positionHint: string;
};

export type GraphEditUpdateNodeCommand = GraphEditCommandBase & {
  kind: "update_node";
  nodeRef: string;
  nodeId: string;
  title: string | null;
  description: string | null;
  taskInstruction: string | null;
};

export type GraphEditCreateStateCommand = GraphEditCommandBase & {
  kind: "create_state";
  stateRef: string;
  stateKey: string;
  name: string;
  description: string;
  valueType: string;
  value?: unknown;
  color?: string;
};

export type GraphEditBindStateCommand = GraphEditCommandBase & {
  kind: "bind_state";
  nodeRef: string;
  nodeId: string;
  stateRef: string;
  stateKey: string;
  mode: GraphEditStateBindingMode;
  required: boolean;
};

export type GraphEditConnectNodesCommand = GraphEditCommandBase & {
  kind: "connect_nodes";
  sourceRef: string;
  sourceNodeId: string;
  targetRef: string;
  targetNodeId: string;
};

export type GraphEditCommand =
  | GraphEditCreateNodeCommand
  | GraphEditUpdateNodeCommand
  | GraphEditCreateStateCommand
  | GraphEditBindStateCommand
  | GraphEditConnectNodesCommand;

export type GraphEditPlaybackStep = {
  kind:
    | "move_virtual_cursor"
    | "open_node_creation_menu"
    | "choose_node_type"
    | "focus_node_field"
    | "type_node_field"
    | "open_state_panel"
    | "highlight_state_field"
    | "highlight_node_port"
    | "draw_flow_edge"
    | "apply_graph_command";
  target: string;
  label: string;
  commandId?: string;
  value?: string;
};

export type GraphEditPlaybackPlan = {
  valid: boolean;
  issues: string[];
  graphCommands: GraphEditCommand[];
  playbackSteps: GraphEditPlaybackStep[];
  resolvedRefs: {
    nodes: Record<string, string>;
    states: Record<string, string>;
  };
};

export type ApplyGraphEditPlaybackResult<T extends GraphPayload | GraphDocument> = {
  applied: boolean;
  document: T;
  appliedCommands: GraphEditCommand[];
  issues: string[];
};

type CompilerContext = {
  document: GraphPayload | GraphDocument;
  nodeRefs: Record<string, string>;
  stateRefs: Record<string, string>;
  nodeIds: Set<string>;
  stateKeys: Set<string>;
  nextPositionIndex: number;
};

export function buildGraphEditPlaybackPlan(
  document: GraphPayload | GraphDocument,
  intentPackage: GraphEditIntentPackage,
): GraphEditPlaybackPlan {
  const context: CompilerContext = {
    document,
    nodeRefs: {},
    stateRefs: {},
    nodeIds: new Set(Object.keys(document.nodes)),
    stateKeys: new Set(Object.keys(document.state_schema)),
    nextPositionIndex: Object.keys(document.nodes).length,
  };
  const issues: string[] = [];
  const graphCommands: GraphEditCommand[] = [];
  const playbackSteps: GraphEditPlaybackStep[] = [];

  for (const [index, operation] of intentPackage.operations.entries()) {
    const command = compileGraphEditIntent(operation, index, context, issues);
    if (!command) {
      continue;
    }
    graphCommands.push(command);
    playbackSteps.push(...buildPlaybackStepsForCommand(command));
  }

  return {
    valid: issues.length === 0,
    issues,
    graphCommands: issues.length === 0 ? graphCommands : [],
    playbackSteps: issues.length === 0 ? playbackSteps : [],
    resolvedRefs: {
      nodes: { ...context.nodeRefs },
      states: { ...context.stateRefs },
    },
  };
}

export function applyGraphEditPlaybackPlan<T extends GraphPayload | GraphDocument>(
  document: T,
  plan: GraphEditPlaybackPlan,
): ApplyGraphEditPlaybackResult<T> {
  if (!plan.valid) {
    return {
      applied: false,
      document,
      appliedCommands: [],
      issues: plan.issues,
    };
  }

  let nextDocument = cloneGraphDocument(document);
  const appliedCommands: GraphEditCommand[] = [];
  const issues: string[] = [];
  for (const command of plan.graphCommands) {
    const updatedDocument = applyGraphEditCommand(nextDocument, command);
    if (updatedDocument === nextDocument) {
      issues.push(`Command ${command.commandId} did not change the graph: ${command.summary}`);
      continue;
    }
    nextDocument = updatedDocument;
    appliedCommands.push(command);
  }

  return {
    applied: appliedCommands.length > 0 && issues.length === 0,
    document: nextDocument,
    appliedCommands,
    issues,
  };
}

export function applyGraphEditCommandToDocument<T extends GraphPayload | GraphDocument>(document: T, command: GraphEditCommand): T {
  return applyGraphEditCommand(document, command);
}

function compileGraphEditIntent(
  operation: GraphEditIntent,
  index: number,
  context: CompilerContext,
  issues: string[],
): GraphEditCommand | null {
  switch (operation.kind) {
    case "create_node":
      return compileCreateNodeCommand(operation, index, context, issues);
    case "update_node":
      return compileUpdateNodeCommand(operation, index, context, issues);
    case "create_state":
      return compileCreateStateCommand(operation, index, context, issues);
    case "bind_state":
      return compileBindStateCommand(operation, index, context, issues);
    case "connect_nodes":
      return compileConnectNodesCommand(operation, index, context, issues);
  }
}

function compileCreateNodeCommand(
  operation: GraphEditCreateNodeIntent,
  index: number,
  context: CompilerContext,
  issues: string[],
): GraphEditCreateNodeCommand | null {
  const nodeRef = compactText(operation.ref);
  if (!nodeRef) {
    issues.push(`operations[${index}] create_node requires ref.`);
    return null;
  }
  if (context.nodeRefs[nodeRef] || context.document.nodes[nodeRef]) {
    issues.push(`operations[${index}] create_node ref already exists: ${nodeRef}.`);
    return null;
  }
  const nodeId = reserveUniqueId(context.nodeIds, `${operation.nodeType}_${slugFromText(nodeRef)}`);
  context.nodeRefs[nodeRef] = nodeId;
  const positionIndex = context.nextPositionIndex;
  context.nextPositionIndex += 1;
  const title = compactText(operation.title) || defaultNodeTitle(operation.nodeType);
  return {
    kind: "create_node",
    commandId: `graph-command-${index + 1}`,
    nodeRef,
    nodeId,
    nodeType: operation.nodeType,
    title,
    description: compactText(operation.description),
    taskInstruction: compactText(operation.taskInstruction),
    position: normalizePosition(operation.position, positionIndex),
    positionHint: compactText(operation.positionHint),
    summary: `Create ${operation.nodeType} node ${title}.`,
  };
}

function compileUpdateNodeCommand(
  operation: GraphEditUpdateNodeIntent,
  index: number,
  context: CompilerContext,
  issues: string[],
): GraphEditUpdateNodeCommand | null {
  const nodeRef = compactText(operation.nodeRef);
  const nodeId = resolveNodeRef(context, nodeRef);
  if (!nodeId) {
    issues.push(`operations[${index}] update_node references unknown node: ${nodeRef}.`);
    return null;
  }
  return {
    kind: "update_node",
    commandId: `graph-command-${index + 1}`,
    nodeRef,
    nodeId,
    title: nullableText(operation.title),
    description: nullableText(operation.description),
    taskInstruction: nullableText(operation.taskInstruction),
    summary: `Update node ${nodeId}.`,
  };
}

function compileCreateStateCommand(
  operation: GraphEditCreateStateIntent,
  index: number,
  context: CompilerContext,
  issues: string[],
): GraphEditCreateStateCommand | null {
  const stateRef = compactText(operation.ref);
  if (!stateRef) {
    issues.push(`operations[${index}] create_state requires ref.`);
    return null;
  }
  if (context.stateRefs[stateRef] || context.document.state_schema[stateRef]) {
    issues.push(`operations[${index}] create_state ref already exists: ${stateRef}.`);
    return null;
  }
  const stateKey = reserveUniqueId(context.stateKeys, `state_${slugFromText(stateRef)}`);
  context.stateRefs[stateRef] = stateKey;
  const name = compactText(operation.name) || stateRef;
  const valueType = compactText(operation.valueType) || "text";
  return {
    kind: "create_state",
    commandId: `graph-command-${index + 1}`,
    stateRef,
    stateKey,
    name,
    description: compactText(operation.description),
    valueType,
    value: operation.value,
    color: compactText(operation.color),
    summary: `Create state ${name}.`,
  };
}

function compileBindStateCommand(
  operation: GraphEditBindStateIntent,
  index: number,
  context: CompilerContext,
  issues: string[],
): GraphEditBindStateCommand | null {
  const nodeRef = compactText(operation.nodeRef);
  const stateRef = compactText(operation.stateRef);
  const nodeId = resolveNodeRef(context, nodeRef);
  const stateKey = resolveStateRef(context, stateRef);
  if (!nodeId) {
    issues.push(`operations[${index}] bind_state references unknown node: ${nodeRef}.`);
  }
  if (!stateKey) {
    issues.push(`operations[${index}] bind_state references unknown state: ${stateRef}.`);
  }
  if (!nodeId || !stateKey) {
    return null;
  }
  return {
    kind: "bind_state",
    commandId: `graph-command-${index + 1}`,
    nodeRef,
    nodeId,
    stateRef,
    stateKey,
    mode: operation.mode,
    required: operation.required === true,
    summary: `${operation.mode === "read" ? "Read" : "Write"} ${stateKey} on ${nodeId}.`,
  };
}

function compileConnectNodesCommand(
  operation: GraphEditConnectNodesIntent,
  index: number,
  context: CompilerContext,
  issues: string[],
): GraphEditConnectNodesCommand | null {
  const sourceRef = compactText(operation.sourceRef);
  const targetRef = compactText(operation.targetRef);
  const sourceNodeId = resolveNodeRef(context, sourceRef);
  const targetNodeId = resolveNodeRef(context, targetRef);
  if (!sourceNodeId) {
    issues.push(`operations[${index}] connect_nodes references unknown source node: ${sourceRef}.`);
  }
  if (!targetNodeId) {
    issues.push(`operations[${index}] connect_nodes references unknown target node: ${targetRef}.`);
  }
  if (!sourceNodeId || !targetNodeId) {
    return null;
  }
  return {
    kind: "connect_nodes",
    commandId: `graph-command-${index + 1}`,
    sourceRef,
    sourceNodeId,
    targetRef,
    targetNodeId,
    summary: `Connect ${sourceNodeId} to ${targetNodeId}.`,
  };
}

function buildPlaybackStepsForCommand(command: GraphEditCommand): GraphEditPlaybackStep[] {
  switch (command.kind) {
    case "create_node":
      return [
        {
          kind: "move_virtual_cursor",
          target: "editor.canvas.surface",
          label: command.positionHint || "Move to the intended canvas area.",
        },
        {
          kind: "open_node_creation_menu",
          target: "editor.canvas.surface",
          label: "Open the node creation menu.",
        },
        {
          kind: "choose_node_type",
          target: `editor.nodeType.${command.nodeType}`,
          label: `Choose ${command.nodeType} node.`,
        },
        {
          kind: "apply_graph_command",
          target: command.nodeId,
          label: command.summary,
          commandId: command.commandId,
        },
        ...nodeTextPlaybackSteps(command),
      ];
    case "update_node":
      return [
        ...nodeTextPlaybackSteps(command),
        {
          kind: "apply_graph_command",
          target: command.nodeId,
          label: command.summary,
          commandId: command.commandId,
        },
      ];
    case "create_state":
      return [
        {
          kind: "open_state_panel",
          target: "editor.statePanel",
          label: "Open the state panel.",
        },
        {
          kind: "apply_graph_command",
          target: command.stateKey,
          label: command.summary,
          commandId: command.commandId,
        },
        {
          kind: "highlight_state_field",
          target: command.stateKey,
          label: `Highlight state ${command.name}.`,
        },
      ];
    case "bind_state":
      return [
        {
          kind: "apply_graph_command",
          target: `${command.nodeId}.${command.stateKey}`,
          label: command.summary,
          commandId: command.commandId,
        },
        {
          kind: "highlight_node_port",
          target: `${command.nodeId}.${command.mode}`,
          label: `Show ${command.stateKey} on the ${command.mode} port.`,
        },
      ];
    case "connect_nodes":
      return [
        {
          kind: "draw_flow_edge",
          target: `${command.sourceNodeId}->${command.targetNodeId}`,
          label: command.summary,
        },
        {
          kind: "apply_graph_command",
          target: `${command.sourceNodeId}->${command.targetNodeId}`,
          label: command.summary,
          commandId: command.commandId,
        },
      ];
  }
}

function nodeTextPlaybackSteps(command: GraphEditCreateNodeCommand | GraphEditUpdateNodeCommand): GraphEditPlaybackStep[] {
  const steps: GraphEditPlaybackStep[] = [];
  if (command.title) {
    steps.push(
      {
        kind: "focus_node_field",
        target: `${command.nodeId}.title`,
        label: "Focus the node title field.",
      },
      {
        kind: "type_node_field",
        target: `${command.nodeId}.title`,
        label: "Type the node title.",
        value: command.title,
      },
    );
  }
  if (command.description) {
    steps.push(
      {
        kind: "focus_node_field",
        target: `${command.nodeId}.description`,
        label: "Focus the node description field.",
      },
      {
        kind: "type_node_field",
        target: `${command.nodeId}.description`,
        label: "Type the node description.",
        value: command.description,
      },
    );
  }
  if (command.taskInstruction) {
    steps.push(
      {
        kind: "focus_node_field",
        target: `${command.nodeId}.taskInstruction`,
        label: "Focus the Agent task instruction field.",
      },
      {
        kind: "type_node_field",
        target: `${command.nodeId}.taskInstruction`,
        label: "Type the Agent task instruction.",
        value: command.taskInstruction,
      },
    );
  }
  return steps;
}

function applyGraphEditCommand<T extends GraphPayload | GraphDocument>(document: T, command: GraphEditCommand): T {
  switch (command.kind) {
    case "create_node":
      return createNodeInDocument(document, command);
    case "update_node":
      return updateNodeInDocument(document, command);
    case "create_state":
      return createStateInDocument(document, command);
    case "bind_state":
      return addStateBindingToDocument(document, command.stateKey, command.nodeId, command.mode);
    case "connect_nodes":
      return connectFlowNodesInDocument(document, command.sourceNodeId, command.targetNodeId);
  }
}

function createNodeInDocument<T extends GraphPayload | GraphDocument>(document: T, command: GraphEditCreateNodeCommand): T {
  if (document.nodes[command.nodeId]) {
    return document;
  }
  const nextDocument = cloneGraphDocument(document);
  nextDocument.nodes[command.nodeId] = buildGraphNodeFromCommand(command);
  return nextDocument;
}

function updateNodeInDocument<T extends GraphPayload | GraphDocument>(document: T, command: GraphEditUpdateNodeCommand): T {
  let nextDocument = document;
  if (command.title !== null || command.description !== null) {
    nextDocument = updateNodeMetadataInDocument(nextDocument, command.nodeId, (current) => ({
      name: command.title ?? current.name,
      description: command.description ?? current.description,
    }));
  }
  if (command.taskInstruction !== null) {
    nextDocument = updateAgentNodeConfigInDocument(nextDocument, command.nodeId, (current) => ({
      ...current,
      taskInstruction: command.taskInstruction ?? current.taskInstruction,
    }));
  }
  return nextDocument;
}

function createStateInDocument<T extends GraphPayload | GraphDocument>(document: T, command: GraphEditCreateStateCommand): T {
  if (document.state_schema[command.stateKey]) {
    return document;
  }
  const definitionPatch: Partial<StateDefinition> = {
    name: command.name,
    description: command.description,
    type: command.valueType,
  };
  if ("value" in command) {
    definitionPatch.value = command.value;
  }
  if (command.color) {
    definitionPatch.color = command.color;
  }
  const field = buildNextDefaultStateField(document, definitionPatch);
  return insertStateFieldIntoDocument(document, {
    key: command.stateKey,
    definition: field.definition,
  });
}

function buildGraphNodeFromCommand(command: GraphEditCreateNodeCommand): GraphNode {
  switch (command.nodeType) {
    case "input":
      return {
        kind: "input",
        name: command.title,
        description: command.description || "Workflow input boundary.",
        ui: { position: command.position, collapsed: false },
        reads: [],
        writes: [],
        config: { value: "" },
      } satisfies InputNode;
    case "output":
      return {
        kind: "output",
        name: command.title,
        description: command.description || "Workflow output preview.",
        ui: { position: command.position, collapsed: false },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      } satisfies OutputNode;
    case "condition":
      return {
        kind: "condition",
        name: command.title,
        description: command.description || "Branch based on graph state.",
        ui: { position: command.position, collapsed: false },
        reads: [],
        writes: [],
        config: {
          branches: ["true", "false"],
          loopLimit: 1,
          branchMapping: { true: "true", false: "false" },
          rule: { source: "", operator: "exists", value: null },
        },
      } satisfies ConditionNode;
    case "agent":
      return {
        kind: "agent",
        name: command.title,
        description: command.description || "One-turn LLM node.",
        ui: { position: command.position, collapsed: false },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: command.taskInstruction,
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      } satisfies AgentNode;
  }
}

function resolveNodeRef(context: CompilerContext, ref: string): string {
  return context.nodeRefs[ref] ?? (context.document.nodes[ref] ? ref : "");
}

function resolveStateRef(context: CompilerContext, ref: string): string {
  return context.stateRefs[ref] ?? (context.document.state_schema[ref] ? ref : "");
}

function reserveUniqueId(existingIds: Set<string>, baseId: string): string {
  const fallback = baseId || "item";
  let candidate = fallback;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${fallback}_${suffix}`;
    suffix += 1;
  }
  existingIds.add(candidate);
  return candidate;
}

function normalizePosition(position: Partial<GraphPosition> | null | undefined, index: number): GraphPosition {
  const x = typeof position?.x === "number" && Number.isFinite(position.x) ? position.x : 160 + index * 220;
  const y = typeof position?.y === "number" && Number.isFinite(position.y) ? position.y : 120 + (index % 3) * 140;
  return { x, y };
}

function defaultNodeTitle(nodeType: GraphEditNodeType): string {
  switch (nodeType) {
    case "input":
      return "Input";
    case "agent":
      return "Agent";
    case "output":
      return "Output";
    case "condition":
      return "Condition";
  }
}

function slugFromText(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (ascii) {
    return ascii;
  }
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `item_${hash.toString(36)}`;
}

function compactText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function nullableText(value: unknown): string | null {
  const text = compactText(value);
  return text ? text : null;
}

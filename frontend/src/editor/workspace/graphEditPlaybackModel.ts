import {
  cloneGraphDocument,
  connectFlowNodesInDocument,
  updateAgentNodeConfigInDocument,
  updateNodeMetadataInDocument,
} from "../../lib/graph-document.ts";
import { buildFixedConditionConfig } from "../../lib/condition-protocol.ts";
import { addStateBindingToDocument } from "./statePanelBindings.ts";
import {
  buildNextDefaultStateField,
  insertStateFieldIntoDocument,
} from "./statePanelFields.ts";
import {
  resolveNodeCreationFinalPositionFromGesture,
  resolveNodeCreationGesturePositionForFinalPosition,
  type NodeCreationPlacementContext,
} from "./nodeCreationPlacement.ts";

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
export type GraphEditWriteBindingMode = "replace" | "append";
export type GraphEditNodeCreationSource =
  | {
      kind: "state";
      sourceNodeRef: string;
      stateRef: string;
    }
  | {
      kind: "flow";
      sourceNodeRef: string;
    };

export type GraphEditNodeCreationSourceCommand =
  | {
      kind: "state";
      sourceNodeRef: string;
      sourceNodeId: string;
      stateRef: string;
      stateKey: string;
    }
  | {
      kind: "flow";
      sourceNodeRef: string;
      sourceNodeId: string;
    };

export type GraphEditCreateNodeIntent = {
  kind: "create_node";
  ref: string;
  nodeId?: string;
  nodeType: GraphEditNodeType;
  title?: string;
  description?: string;
  taskInstruction?: string;
  position?: Partial<GraphPosition> | null;
  positionHint?: string;
  creationSource?: GraphEditNodeCreationSource;
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
  stateKey?: string;
  name?: string;
  description?: string;
  valueType?: string;
  value?: unknown;
  color?: string;
  nodeRef?: string;
  bindingMode?: GraphEditStateBindingMode;
};

export type GraphEditBindStateIntent = {
  kind: "bind_state";
  nodeRef: string;
  stateRef: string;
  mode: GraphEditStateBindingMode;
  required?: boolean;
  writeMode?: GraphEditWriteBindingMode;
  sourceNodeRef?: string;
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
  menuTarget: string;
  creationSource: GraphEditNodeCreationSourceCommand | null;
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
  targetNodeRef?: string;
  targetNodeId?: string;
  bindingMode?: GraphEditStateBindingMode;
};

export type GraphEditBindStateCommand = GraphEditCommandBase & {
  kind: "bind_state";
  nodeRef: string;
  nodeId: string;
  stateRef: string;
  stateKey: string;
  mode: GraphEditStateBindingMode;
  required: boolean;
  writeMode: GraphEditWriteBindingMode;
  sourceNodeRef?: string;
  sourceNodeId?: string;
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
    | "type_state_field"
    | "commit_state_field"
    | "highlight_state_field"
    | "highlight_node_port"
    | "drag_state_edge_to_canvas"
    | "drag_state_edge_to_node"
    | "draw_flow_edge"
    | "apply_graph_command";
  target: string;
  endTarget?: string;
  label: string;
  commandId?: string;
  commandIds?: string[];
  value?: string;
  position?: GraphPosition;
  nodeId?: string;
  stateKey?: string;
  bindingMode?: GraphEditStateBindingMode;
  nodeType?: GraphEditNodeType;
  sourceNodeId?: string;
  sourceStateKey?: string;
  sourceAnchorKind?: "state-out" | "flow-out";
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
  }
  playbackSteps.push(...buildPlaybackStepsForCommands(graphCommands));

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

function resolveNodeCreationSource(
  source: GraphEditNodeCreationSource | null,
  index: number,
  context: CompilerContext,
  issues: string[],
): GraphEditNodeCreationSourceCommand | null {
  if (!source) {
    return null;
  }
  const sourceNodeRef = compactText(source.sourceNodeRef);
  const sourceNodeId = resolveNodeRef(context, sourceNodeRef);
  if (!sourceNodeId) {
    issues.push(`operations[${index}] create_node references unknown source node: ${sourceNodeRef}.`);
    return null;
  }
  if (source.kind === "flow") {
    return {
      kind: "flow",
      sourceNodeRef,
      sourceNodeId,
    };
  }
  const stateRef = compactText(source.stateRef);
  const stateKey = resolveStateRef(context, stateRef);
  if (!stateKey) {
    issues.push(`operations[${index}] create_node references unknown source state: ${stateRef}.`);
    return null;
  }
  return {
    kind: "state",
    sourceNodeRef,
    sourceNodeId,
    stateRef,
    stateKey,
  };
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
  const creationSource = resolveNodeCreationSource(operation.creationSource ?? null, index, context, issues);
  if (operation.creationSource && !creationSource) {
    return null;
  }
  const isFirstNode = context.nextPositionIndex === 0 && Object.keys(context.document.nodes).length === 0;
  const nodeId = reserveUniqueId(context.nodeIds, compactText(operation.nodeId) || `${operation.nodeType}_${slugFromText(nodeRef)}`);
  context.nodeRefs[nodeRef] = nodeId;
  const positionIndex = context.nextPositionIndex;
  context.nextPositionIndex += 1;
  const title = compactText(operation.title) || defaultNodeTitle(operation.nodeType);
  const defaultPosition = normalizePosition(operation.position, positionIndex);
  const position = hasExplicitPosition(operation.position)
    ? defaultPosition
    : resolveDefaultNodeCreationGesturePosition({
        nodeId,
        nodeType: operation.nodeType,
        title,
        description: compactText(operation.description),
        taskInstruction: compactText(operation.taskInstruction),
        finalPosition: defaultPosition,
        creationSource,
      });
  return {
    kind: "create_node",
    commandId: `graph-command-${index + 1}`,
    nodeRef,
    nodeId,
    nodeType: operation.nodeType,
    title,
    description: compactText(operation.description),
    taskInstruction: compactText(operation.taskInstruction),
    position,
    positionHint: compactText(operation.positionHint),
    menuTarget: creationSource ? "editor.canvas.surface" : isFirstNode ? "editor.canvas.empty.createFirstNode" : "editor.canvas.surface",
    creationSource,
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
  const targetNodeRef = compactText(operation.nodeRef);
  const targetNodeId = targetNodeRef ? resolveNodeRef(context, targetNodeRef) : "";
  if (targetNodeRef && !targetNodeId) {
    issues.push(`operations[${index}] create_state references unknown node: ${targetNodeRef}.`);
    return null;
  }
  const stateKey = reserveUniqueId(context.stateKeys, compactText(operation.stateKey) || `state_${slugFromText(stateRef)}`);
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
    targetNodeRef: targetNodeRef || undefined,
    targetNodeId: targetNodeId || undefined,
    bindingMode: operation.bindingMode,
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
  const sourceNodeRef = compactText(operation.sourceNodeRef);
  const sourceNodeId = sourceNodeRef ? resolveNodeRef(context, sourceNodeRef) : "";
  if (sourceNodeRef && !sourceNodeId) {
    issues.push(`operations[${index}] bind_state references unknown source node: ${sourceNodeRef}.`);
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
    writeMode: operation.writeMode === "append" ? "append" : "replace",
    sourceNodeRef: sourceNodeRef || undefined,
    sourceNodeId: sourceNodeId || undefined,
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

function buildPlaybackStepsForCommands(commands: GraphEditCommand[]): GraphEditPlaybackStep[] {
  const steps: GraphEditPlaybackStep[] = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    if (command.kind === "create_node") {
      const nextCommand = commands[index + 1];
      const pairedCommand = resolveCreationSourceStateBinding(command, nextCommand) ?? resolveCreationSourceFlowConnection(command, nextCommand);
      steps.push(...buildCreateNodePlaybackSteps(command, { includeTextSteps: false, pairedCommand }));
      if (pairedCommand?.kind === "bind_state") {
        steps.push(...buildCreationSourceBindingHighlightSteps(pairedCommand));
        index += 1;
      } else if (pairedCommand?.kind === "connect_nodes") {
        index += 1;
      }
      steps.push(...nodeTextPlaybackSteps(command));
      continue;
    }
    if (command.kind === "create_state") {
      const nextCommand = commands[index + 1];
      const pairedCommand = resolveCreatedStatePortBinding(command, nextCommand);
      steps.push(...buildCreateStatePlaybackSteps(command, pairedCommand));
      if (pairedCommand) {
        index += 1;
      }
      continue;
    }
    steps.push(...buildPlaybackStepsForCommand(command));
  }
  return steps;
}

function resolveCreationSourceStateBinding(command: GraphEditCreateNodeCommand, nextCommand: GraphEditCommand | undefined) {
  if (
    command.creationSource?.kind !== "state" ||
    nextCommand?.kind !== "bind_state" ||
    nextCommand.mode !== "read" ||
    nextCommand.nodeId !== command.nodeId ||
    nextCommand.sourceNodeId !== command.creationSource.sourceNodeId ||
    nextCommand.stateKey !== command.creationSource.stateKey
  ) {
    return null;
  }
  return nextCommand;
}

function resolveCreationSourceFlowConnection(command: GraphEditCreateNodeCommand, nextCommand: GraphEditCommand | undefined) {
  if (
    command.creationSource?.kind !== "flow" ||
    nextCommand?.kind !== "connect_nodes" ||
    nextCommand.sourceNodeId !== command.creationSource.sourceNodeId ||
    nextCommand.targetNodeId !== command.nodeId
  ) {
    return null;
  }
  return nextCommand;
}

function resolveCreatedStatePortBinding(command: GraphEditCreateStateCommand, nextCommand: GraphEditCommand | undefined) {
  if (
    !command.targetNodeId ||
    !command.bindingMode ||
    nextCommand?.kind !== "bind_state" ||
    nextCommand.nodeId !== command.targetNodeId ||
    nextCommand.stateKey !== command.stateKey ||
    nextCommand.mode !== command.bindingMode
  ) {
    return null;
  }
  return nextCommand;
}

function buildCreationSourceBindingHighlightSteps(command: GraphEditBindStateCommand): GraphEditPlaybackStep[] {
  return [
    {
      kind: "highlight_node_port",
      target: nodePortTarget(command.nodeId, command.mode, command.stateKey),
      label: `Show ${command.stateKey} on the ${command.mode} port.`,
    },
  ];
}

function buildPlaybackStepsForCommand(command: GraphEditCommand): GraphEditPlaybackStep[] {
  switch (command.kind) {
    case "create_node":
      return buildCreateNodePlaybackSteps(command, { includeTextSteps: true, pairedCommand: null });
    case "update_node":
      return nodeTextPlaybackSteps(command);
    case "create_state":
      return buildCreateStatePlaybackSteps(command, null);
    case "bind_state":
      return [
        ...stateBindingGestureSteps(command),
        {
          kind: "highlight_node_port",
          target: nodePortTarget(command.nodeId, command.mode, command.stateKey),
          label: `Show ${command.stateKey} on the ${command.mode} port.`,
        },
      ];
    case "connect_nodes":
      return [
        {
          kind: "draw_flow_edge",
          target: flowAnchorTarget(command.sourceNodeId),
          endTarget: flowInputAnchorTarget(command.targetNodeId),
          label: command.summary,
          sourceNodeId: command.sourceNodeId,
          nodeId: command.targetNodeId,
        },
      ];
  }
}

function buildCreateStatePlaybackSteps(command: GraphEditCreateStateCommand, pairedCommand: GraphEditBindStateCommand | null): GraphEditPlaybackStep[] {
  if (!command.targetNodeId || !command.bindingMode) {
    return [
      {
        kind: "open_state_panel",
        target: createStateTarget(command),
        label: "Open the state panel.",
      },
      {
        kind: "apply_graph_command",
        target: createStateTarget(command),
        label: command.summary,
        commandId: command.commandId,
      },
      {
        kind: "highlight_state_field",
        target: stateFieldTarget(command),
        label: `Highlight state ${command.name}.`,
        stateKey: command.stateKey,
      },
    ];
  }

  const createTarget = createStateTarget(command);
  const commandIds = pairedCommand ? [command.commandId, pairedCommand.commandId] : [command.commandId];
  const steps: GraphEditPlaybackStep[] = [
    {
      kind: "open_state_panel",
      target: createTarget,
      label: `Open the ${command.bindingMode === "read" ? "input" : "output"} state editor.`,
      nodeId: command.targetNodeId,
      stateKey: command.stateKey,
      bindingMode: command.bindingMode,
    },
    {
      kind: "type_state_field",
      target: `${createTarget}.name`,
      label: `Type state ${command.name}.`,
      value: command.name,
      nodeId: command.targetNodeId,
      stateKey: command.stateKey,
      bindingMode: command.bindingMode,
    },
  ];
  if (command.description) {
    steps.push({
      kind: "type_state_field",
      target: `${createTarget}.description`,
      label: `Type state ${command.name} description.`,
      value: command.description,
      nodeId: command.targetNodeId,
      stateKey: command.stateKey,
      bindingMode: command.bindingMode,
    });
  }
  steps.push(
    {
      kind: "commit_state_field",
      target: `${createTarget}.create`,
      label: command.summary,
      commandId: command.commandId,
      commandIds,
      nodeId: command.targetNodeId,
      stateKey: command.stateKey,
      bindingMode: command.bindingMode,
    },
    {
      kind: "highlight_node_port",
      target: nodePortTarget(command.targetNodeId, command.bindingMode, command.stateKey),
      label: `Show ${command.stateKey} on the ${command.bindingMode} port.`,
      stateKey: command.stateKey,
      nodeId: command.targetNodeId,
      bindingMode: command.bindingMode,
    },
  );
  return steps;
}

function nodeCreationGestureSteps(command: GraphEditCreateNodeCommand): GraphEditPlaybackStep[] {
  if (command.creationSource?.kind === "state") {
    return [
      {
        kind: "drag_state_edge_to_canvas",
        target: stateAnchorTarget(command.creationSource.sourceNodeId, "out", command.creationSource.stateKey),
        endTarget: command.menuTarget,
        label: `Drag state ${command.creationSource.stateKey} from ${command.creationSource.sourceNodeId} to an empty canvas area.`,
        position: command.position,
        sourceNodeId: command.creationSource.sourceNodeId,
        sourceStateKey: command.creationSource.stateKey,
        sourceAnchorKind: "state-out",
      },
      openNodeCreationMenuStep(command, "Choose the next node from the state connection menu."),
    ];
  }
  if (command.creationSource?.kind === "flow") {
    return [
      {
        kind: "draw_flow_edge",
        target: flowAnchorTarget(command.creationSource.sourceNodeId),
        endTarget: command.menuTarget,
        label: `Drag a flow edge from ${command.creationSource.sourceNodeId} to an empty canvas area.`,
        position: command.position,
        sourceNodeId: command.creationSource.sourceNodeId,
        sourceAnchorKind: "flow-out",
      },
      openNodeCreationMenuStep(command, "Choose the next node from the flow connection menu."),
    ];
  }
  return [
    {
      kind: "move_virtual_cursor",
      target: command.menuTarget,
      label: command.positionHint || "Move to the intended canvas area.",
      position: command.position,
    },
    openNodeCreationMenuStep(command, command.menuTarget === "editor.canvas.empty.createFirstNode" ? "Double-click the empty canvas prompt." : "Double-click the canvas."),
  ];
}

function buildCreateNodePlaybackSteps(
  command: GraphEditCreateNodeCommand,
  options: { includeTextSteps: boolean; pairedCommand: GraphEditBindStateCommand | GraphEditConnectNodesCommand | null },
): GraphEditPlaybackStep[] {
  const commandIds = options.pairedCommand ? [command.commandId, options.pairedCommand.commandId] : [command.commandId];
  const steps: GraphEditPlaybackStep[] = [
    ...nodeCreationGestureSteps(command),
    {
      kind: "choose_node_type",
      target: `editor.nodeType.${command.nodeType}`,
      label: `Choose ${command.nodeType} node.`,
      commandId: command.commandId,
      commandIds,
      nodeId: command.nodeId,
    },
  ];
  if (options.includeTextSteps) {
    steps.push(...nodeTextPlaybackSteps(command));
  }
  return steps;
}

function openNodeCreationMenuStep(command: GraphEditCreateNodeCommand, label: string): GraphEditPlaybackStep {
  const source = command.creationSource;
  return {
    kind: "open_node_creation_menu",
    target: command.menuTarget,
    label,
    position: command.position,
    nodeType: command.nodeType,
    sourceNodeId: source?.sourceNodeId,
    sourceStateKey: source?.kind === "state" ? source.stateKey : undefined,
    sourceAnchorKind: source?.kind === "state" ? "state-out" : source?.kind === "flow" ? "flow-out" : undefined,
  };
}

function stateBindingGestureSteps(command: GraphEditBindStateCommand): GraphEditPlaybackStep[] {
  if (command.mode !== "read" || !command.sourceNodeId) {
    return [];
  }
  return [
    {
      kind: "drag_state_edge_to_node",
      target: stateAnchorTarget(command.sourceNodeId, "out", command.stateKey),
      endTarget: canvasNodeTarget(command.nodeId),
      label: `Drag state ${command.stateKey} into ${command.nodeId}.`,
      nodeId: command.nodeId,
      stateKey: command.stateKey,
      sourceNodeId: command.sourceNodeId,
      sourceStateKey: command.stateKey,
      sourceAnchorKind: "state-out",
    },
  ];
}

function nodeTextPlaybackSteps(command: GraphEditCreateNodeCommand | GraphEditUpdateNodeCommand): GraphEditPlaybackStep[] {
  const steps: GraphEditPlaybackStep[] = [];
  if (command.title) {
    steps.push(
      {
        kind: "focus_node_field",
        target: nodeFieldTarget(command.nodeId, "title"),
        label: "Focus the node title field.",
      },
      {
        kind: "type_node_field",
        target: nodeFieldTarget(command.nodeId, "title"),
        label: "Type the node title.",
        value: command.title,
      },
    );
  }
  if (command.description) {
    steps.push(
      {
        kind: "focus_node_field",
        target: nodeFieldTarget(command.nodeId, "description"),
        label: "Focus the node description field.",
      },
      {
        kind: "type_node_field",
        target: nodeFieldTarget(command.nodeId, "description"),
        label: "Type the node description.",
        value: command.description,
      },
    );
  }
  if (command.taskInstruction) {
    steps.push(
      {
        kind: "focus_node_field",
        target: nodeFieldTarget(command.nodeId, "taskInstruction"),
        label: "Focus the Agent task instruction field.",
      },
      {
        kind: "type_node_field",
        target: nodeFieldTarget(command.nodeId, "taskInstruction"),
        label: "Type the Agent task instruction.",
        value: command.taskInstruction,
      },
    );
  }
  return steps;
}

function canvasNodeTarget(nodeId: string) {
  return `editor.canvas.node.${nodeId}`;
}

function nodeFieldTarget(nodeId: string, field: "title" | "description" | "taskInstruction") {
  return `${canvasNodeTarget(nodeId)}.${field}`;
}

function nodePortTarget(nodeId: string, mode: GraphEditStateBindingMode, stateKey: string) {
  return `${canvasNodeTarget(nodeId)}.port.${mode === "read" ? "input" : "output"}.${stateKey}`;
}

function nodePortCreateTarget(nodeId: string, mode: GraphEditStateBindingMode) {
  return `${canvasNodeTarget(nodeId)}.port.${mode === "read" ? "input" : "output"}.create`;
}

function flowAnchorTarget(nodeId: string) {
  return `editor.canvas.anchor.${nodeId}:flow-out`;
}

function flowInputAnchorTarget(nodeId: string) {
  return `editor.canvas.anchor.${nodeId}:flow-in`;
}

function stateAnchorTarget(nodeId: string, direction: "in" | "out", stateKey: string) {
  return `editor.canvas.anchor.${nodeId}:state-${direction}:${stateKey}`;
}

function createStateTarget(command: GraphEditCreateStateCommand) {
  return command.targetNodeId && command.bindingMode
    ? nodePortCreateTarget(command.targetNodeId, command.bindingMode)
    : "editor.statePanel";
}

function stateFieldTarget(command: GraphEditCreateStateCommand) {
  return command.targetNodeId && command.bindingMode
    ? nodePortTarget(command.targetNodeId, command.bindingMode, command.stateKey)
    : command.stateKey;
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
      return bindStateInDocument(document, command);
    case "connect_nodes":
      return connectFlowNodesInDocument(document, command.sourceNodeId, command.targetNodeId);
  }
}

function bindStateInDocument<T extends GraphPayload | GraphDocument>(document: T, command: GraphEditBindStateCommand): T {
  const nextDocument = addStateBindingToDocument(document, command.stateKey, command.nodeId, command.mode);
  if (nextDocument === document) {
    return document;
  }
  const node = nextDocument.nodes[command.nodeId];
  if (!node) {
    return nextDocument;
  }
  if (command.mode === "read" && command.required) {
    const readIndex = node.reads.findIndex((binding) => binding.state === command.stateKey);
    if (readIndex >= 0) {
      node.reads[readIndex] = { ...node.reads[readIndex], required: true };
    }
  }
  if (command.mode === "write" && command.writeMode === "append") {
    const writeIndex = node.writes.findIndex((binding) => binding.state === command.stateKey);
    if (writeIndex >= 0) {
      node.writes[writeIndex] = { ...node.writes[writeIndex], mode: "append" };
    }
  }
  return nextDocument;
}

function createNodeInDocument<T extends GraphPayload | GraphDocument>(document: T, command: GraphEditCreateNodeCommand): T {
  if (document.nodes[command.nodeId]) {
    return document;
  }
  const nextDocument = cloneGraphDocument(document);
  const node = buildGraphNodeFromCommand(command);
  nextDocument.nodes[command.nodeId] = {
    ...node,
    ui: {
      ...node.ui,
      position: resolveNodeCreationFinalPositionFromGesture({
        nodeId: command.nodeId,
        node,
        context: placementContextFromCreateNodeCommand(command),
      }),
    },
  };
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
  return buildGraphNodeFromCreationFields({
    nodeType: command.nodeType,
    title: command.title,
    description: command.description,
    taskInstruction: command.taskInstruction,
    position: command.position,
  });
}

function buildGraphNodeFromCreationFields(input: {
  nodeType: GraphEditNodeType;
  title: string;
  description: string;
  taskInstruction: string;
  position: GraphPosition;
}): GraphNode {
  switch (input.nodeType) {
    case "input":
      return {
        kind: "input",
        name: input.title,
        description: input.description || "Workflow input boundary.",
        ui: { position: input.position, collapsed: false },
        reads: [],
        writes: [],
        config: { value: "" },
      } satisfies InputNode;
    case "output":
      return {
        kind: "output",
        name: input.title,
        description: input.description || "Workflow output preview.",
        ui: { position: input.position, collapsed: false },
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
        name: input.title,
        description: input.description || "Branch based on graph state.",
        ui: { position: input.position, collapsed: false },
        reads: [],
        writes: [],
        config: buildFixedConditionConfig({ source: "", operator: "exists", value: null }),
      } satisfies ConditionNode;
    case "agent":
      return {
        kind: "agent",
        name: input.title,
        description: input.description || "One-turn LLM node.",
        ui: { position: input.position, collapsed: false },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: input.taskInstruction,
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

function hasExplicitPosition(position: Partial<GraphPosition> | null | undefined) {
  return (
    (typeof position?.x === "number" && Number.isFinite(position.x)) ||
    (typeof position?.y === "number" && Number.isFinite(position.y))
  );
}

function resolveDefaultNodeCreationGesturePosition(input: {
  nodeId: string;
  nodeType: GraphEditNodeType;
  title: string;
  description: string;
  taskInstruction: string;
  finalPosition: GraphPosition;
  creationSource: GraphEditNodeCreationSourceCommand | null;
}): GraphPosition {
  const node = buildGraphNodeFromCreationFields({
    nodeType: input.nodeType,
    title: input.title,
    description: input.description,
    taskInstruction: input.taskInstruction,
    position: input.finalPosition,
  });
  return resolveNodeCreationGesturePositionForFinalPosition({
    nodeId: input.nodeId,
    node,
    finalPosition: input.finalPosition,
    context: placementContextFromCreationSource(input.creationSource),
  });
}

function placementContextFromCreateNodeCommand(command: GraphEditCreateNodeCommand): NodeCreationPlacementContext {
  return {
    ...placementContextFromCreationSource(command.creationSource),
    position: command.position,
  };
}

function placementContextFromCreationSource(
  creationSource: GraphEditNodeCreationSourceCommand | null,
): NodeCreationPlacementContext {
  if (creationSource?.kind === "state") {
    return {
      sourceAnchorKind: "state-out",
      sourceStateKey: creationSource.stateKey,
    };
  }
  if (creationSource?.kind === "flow") {
    return {
      sourceAnchorKind: "flow-out",
    };
  }
  return {};
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

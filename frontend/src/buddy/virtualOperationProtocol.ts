import type { GraphEditIntent } from "../editor/workspace/graphEditPlaybackModel.ts";

export type BuddyVirtualOperationCursorLifecycle = "keep" | "return_after_step" | "return_at_end";

export type BuddyVirtualClickOperation = {
  kind: "click";
  targetId: string;
};

export type BuddyVirtualFocusOperation = {
  kind: "focus";
  targetId: string;
};

export type BuddyVirtualClearOperation = {
  kind: "clear";
  targetId: string;
};

export type BuddyVirtualTypeOperation = {
  kind: "type";
  targetId: string;
  text: string;
};

export type BuddyVirtualPressOperation = {
  kind: "press";
  targetId: string;
  key: string;
};

export type BuddyVirtualWaitOperation = {
  kind: "wait";
  option: string;
};

export type BuddyVirtualGraphEditOperation = {
  kind: "graph_edit";
  targetId: string;
  graphEditIntents: GraphEditIntent[];
};

export type BuddyVirtualOperation =
  | BuddyVirtualClickOperation
  | BuddyVirtualFocusOperation
  | BuddyVirtualClearOperation
  | BuddyVirtualTypeOperation
  | BuddyVirtualPressOperation
  | BuddyVirtualWaitOperation
  | BuddyVirtualGraphEditOperation;

export type BuddyVirtualOperationPlan = {
  version: 1;
  operationRequestId?: string;
  runId?: string;
  nodeId?: string;
  subgraphNodeId?: string;
  subgraphPath?: string[];
  commands: string[];
  operations: BuddyVirtualOperation[];
  cursorLifecycle: BuddyVirtualOperationCursorLifecycle;
  expectedContinuation?: BuddyVirtualOperationExpectedContinuation;
  reason: string;
};

export type BuddyVirtualOperationExpectedContinuation = {
  mode: "auto_resume_after_ui_operation";
  operationRequestId: string;
  resumeStateKeys: string[];
};

export function resolveBuddyVirtualOperationPlanFromActivityEvent(payload: Record<string, unknown>): BuddyVirtualOperationPlan | null {
  if (normalizeText(payload.kind) !== "virtual_ui_operation") {
    return null;
  }
  const detail = recordFromUnknown(payload.detail);
  if (!detail) {
    return null;
  }
  const operationRequest = recordFromUnknown(detail.operation_request ?? detail.operationRequest);
  if (!operationRequest) {
    return null;
  }
  if (operationRequest.version !== 1) {
    return null;
  }

  const operationRequestId = normalizeText(
    operationRequest.operation_request_id
      ?? operationRequest.operationRequestId
      ?? detail.operation_request_id
      ?? detail.operationRequestId,
  );
  if (!operationRequestId) {
    return null;
  }
  const expectedContinuation = normalizeExpectedContinuation(
    detail.expected_continuation ?? detail.expectedContinuation,
    operationRequestId,
  );
  if (!expectedContinuation) {
    return null;
  }

  const commands = listText(operationRequest.commands);
  const operations = listOperations(operationRequest.operations);
  if (commands.length === 0 || operations.length === 0) {
    return null;
  }
  if (commands.some((command) => isBuddySelfCommand(command))) {
    return null;
  }

  const plan: BuddyVirtualOperationPlan = {
    version: 1,
    operationRequestId,
    commands,
    operations,
    cursorLifecycle: normalizeCursorLifecycle(operationRequest.cursor_lifecycle ?? operationRequest.cursorLifecycle),
    expectedContinuation,
    reason: normalizeText(operationRequest.reason),
  };
  const runId = normalizeText(detail.run_id ?? detail.runId);
  const nodeId = normalizeText(detail.node_id ?? detail.nodeId);
  const subgraphNodeId = normalizeText(detail.subgraph_node_id ?? detail.subgraphNodeId);
  const subgraphPath = listText(detail.subgraph_path ?? detail.subgraphPath);
  if (runId) {
    plan.runId = runId;
  }
  if (nodeId) {
    plan.nodeId = nodeId;
  }
  if (subgraphNodeId) {
    plan.subgraphNodeId = subgraphNodeId;
  }
  if (subgraphPath.length > 0) {
    plan.subgraphPath = subgraphPath;
  }
  return plan;
}

export function normalizeCursorLifecycle(value: unknown): BuddyVirtualOperationCursorLifecycle {
  const normalized = normalizeText(value).toLowerCase().replace(/-/g, "_");
  if (normalized === "keep" || normalized === "return_after_step" || normalized === "return_at_end") {
    return normalized;
  }
  return "return_after_step";
}

function listOperations(value: unknown): BuddyVirtualOperation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const operations: BuddyVirtualOperation[] = [];
  for (const item of value) {
    const record = recordFromUnknown(item);
    if (!record) {
      continue;
    }
    const kind = normalizeText(record.kind).toLowerCase();
    const targetId = normalizeText(record.target_id ?? record.targetId);
    if (kind === "wait") {
      operations.push({ kind: "wait", option: normalizeText(record.option) });
      continue;
    }
    if (!targetId || isBuddySelfTarget(targetId)) {
      return [];
    }
    if (kind === "graph_edit") {
      const graphEditIntents = listGraphEditIntents(record.graph_edit_intents ?? record.graphEditIntents);
      if (graphEditIntents.length === 0) {
        return [];
      }
      operations.push({ kind: "graph_edit", targetId, graphEditIntents });
      continue;
    }
    if (kind === "click" || kind === "focus" || kind === "clear") {
      operations.push({ kind, targetId });
      continue;
    }
    if (kind === "type") {
      operations.push({ kind: "type", targetId, text: normalizeText(record.text) });
      continue;
    }
    if (kind === "press") {
      operations.push({ kind: "press", targetId, key: normalizeText(record.key) });
      continue;
    }
    return [];
  }
  return operations;
}

function normalizeExpectedContinuation(value: unknown, operationRequestId: string): BuddyVirtualOperationExpectedContinuation | null {
  const record = recordFromUnknown(value);
  if (!record) {
    return null;
  }
  if (normalizeText(record.mode) !== "auto_resume_after_ui_operation") {
    return null;
  }
  const continuationRequestId = normalizeText(record.operation_request_id ?? record.operationRequestId) || operationRequestId;
  if (continuationRequestId !== operationRequestId) {
    return null;
  }
  const resumeStateKeys = listText(record.resume_state_keys ?? record.resumeStateKeys);
  const requiredKeys = ["page_operation_context", "page_context", "operation_result"];
  if (!requiredKeys.every((key) => resumeStateKeys.includes(key))) {
    return null;
  }
  return {
    mode: "auto_resume_after_ui_operation",
    operationRequestId,
    resumeStateKeys,
  };
}

function listGraphEditIntents(value: unknown): GraphEditIntent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const intents: GraphEditIntent[] = [];
  for (const item of value) {
    const record = recordFromUnknown(item);
    if (!record) {
      continue;
    }
    const intent = normalizeGraphEditIntent(record);
    if (intent) {
      intents.push(intent);
    }
  }
  return intents;
}

function normalizeGraphEditIntent(record: Record<string, unknown>): GraphEditIntent | null {
  const kind = normalizeText(record.kind);
  if (kind === "create_node") {
    const nodeType = normalizeText(record.nodeType ?? record.node_type);
    const ref = normalizeText(record.ref);
    if (!ref || !isGraphEditNodeType(nodeType)) {
      return null;
    }
    const intent: GraphEditIntent = {
      kind: "create_node",
      ref,
      nodeType,
    };
    assignOptionalText(intent, "title", record.title);
    assignOptionalText(intent, "description", record.description);
    assignOptionalText(intent, "taskInstruction", record.taskInstruction);
    assignOptionalText(intent, "positionHint", record.positionHint);
    const position = normalizeGraphEditPosition(record.position);
    if (position) {
      intent.position = position;
    }
    return intent;
  }
  if (kind === "update_node") {
    const nodeRef = normalizeText(record.nodeRef ?? record.node_ref);
    if (!nodeRef) {
      return null;
    }
    const intent: GraphEditIntent = {
      kind: "update_node",
      nodeRef,
    };
    assignOptionalText(intent, "title", record.title);
    assignOptionalText(intent, "description", record.description);
    assignOptionalText(intent, "taskInstruction", record.taskInstruction);
    return intent;
  }
  if (kind === "create_state") {
    const ref = normalizeText(record.ref);
    if (!ref) {
      return null;
    }
    const intent: GraphEditIntent = {
      kind: "create_state",
      ref,
    };
    assignOptionalText(intent, "name", record.name);
    assignOptionalText(intent, "description", record.description);
    assignOptionalText(intent, "valueType", record.valueType ?? record.value_type);
    assignOptionalText(intent, "color", record.color);
    if ("value" in record) {
      intent.value = record.value;
    }
    return intent;
  }
  if (kind === "bind_state") {
    const nodeRef = normalizeText(record.nodeRef ?? record.node_ref);
    const stateRef = normalizeText(record.stateRef ?? record.state_ref);
    const mode = normalizeText(record.mode);
    if (!nodeRef || !stateRef || (mode !== "read" && mode !== "write")) {
      return null;
    }
    return {
      kind: "bind_state",
      nodeRef,
      stateRef,
      mode,
      ...(record.required === true ? { required: true } : {}),
    };
  }
  if (kind === "connect_nodes") {
    const sourceRef = normalizeText(record.sourceRef ?? record.source_ref);
    const targetRef = normalizeText(record.targetRef ?? record.target_ref);
    if (!sourceRef || !targetRef) {
      return null;
    }
    return {
      kind: "connect_nodes",
      sourceRef,
      targetRef,
    };
  }
  return null;
}

function isGraphEditNodeType(value: string): value is "input" | "agent" | "output" | "condition" {
  return value === "input" || value === "agent" || value === "output" || value === "condition";
}

function normalizeGraphEditPosition(value: unknown) {
  const record = recordFromUnknown(value);
  if (!record) {
    return null;
  }
  const position: { x?: number; y?: number } = {};
  if (typeof record.x === "number" && Number.isFinite(record.x)) {
    position.x = record.x;
  }
  if (typeof record.y === "number" && Number.isFinite(record.y)) {
    position.y = record.y;
  }
  return Object.keys(position).length > 0 ? position : null;
}

function assignOptionalText(target: object, key: string, value: unknown) {
  const text = normalizeText(value);
  if (text) {
    (target as Record<string, unknown>)[key] = text;
  }
}

function listText(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function isBuddySelfCommand(command: string): boolean {
  const [, targetId = ""] = command.trim().split(/\s+/, 2);
  return isBuddySelfTarget(targetId);
}

function isBuddySelfTarget(targetId: string): boolean {
  const normalized = targetId.trim().toLowerCase();
  return (
    normalized.startsWith("buddy.")
    || normalized === "app.nav.buddy"
    || normalized.includes("mascot")
    || normalized.includes("debug")
    || normalized.includes("伙伴")
    || normalized.includes("调试")
  );
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

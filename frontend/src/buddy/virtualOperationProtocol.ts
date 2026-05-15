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

export type BuddyVirtualOperation =
  | BuddyVirtualClickOperation
  | BuddyVirtualFocusOperation
  | BuddyVirtualClearOperation
  | BuddyVirtualTypeOperation
  | BuddyVirtualPressOperation
  | BuddyVirtualWaitOperation;

export type BuddyVirtualOperationPlan = {
  version: 1;
  commands: string[];
  operations: BuddyVirtualOperation[];
  cursorLifecycle: BuddyVirtualOperationCursorLifecycle;
  nextPagePath: string;
  reason: string;
};

export function resolveBuddyVirtualOperationPlanFromActivityEvent(payload: Record<string, unknown>): BuddyVirtualOperationPlan | null {
  if (normalizeText(payload.kind) !== "virtual_ui_operation") {
    return null;
  }
  const detail = recordFromUnknown(payload.detail);
  const operationRequest = recordFromUnknown(detail?.operation_request ?? detail?.operationRequest);
  if (!operationRequest) {
    return null;
  }
  if (operationRequest.version !== 1) {
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

  return {
    version: 1,
    commands,
    operations,
    cursorLifecycle: normalizeCursorLifecycle(operationRequest.cursor_lifecycle ?? operationRequest.cursorLifecycle),
    nextPagePath: normalizeText(operationRequest.next_page_path ?? operationRequest.nextPagePath),
    reason: normalizeText(operationRequest.reason),
  };
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

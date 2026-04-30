export type BuddyVirtualOperationUserActionSource =
  | "avatar_click"
  | "canvas_pointer"
  | "stop_button"
  | "virtual_cursor_pointer";

export type BuddyVirtualOperationUserAction = {
  interruptOperation: boolean;
  allowDefaultAction: boolean;
};

export function resolveBuddyVirtualOperationUserAction(input: {
  isOperationRunning: boolean;
  source: BuddyVirtualOperationUserActionSource;
}): BuddyVirtualOperationUserAction {
  if (!input.isOperationRunning) {
    return {
      interruptOperation: false,
      allowDefaultAction: true,
    };
  }

  if (input.source === "stop_button") {
    return {
      interruptOperation: true,
      allowDefaultAction: false,
    };
  }

  if (input.source === "canvas_pointer") {
    return {
      interruptOperation: false,
      allowDefaultAction: true,
    };
  }

  return {
    interruptOperation: false,
    allowDefaultAction: false,
  };
}

export function shouldHandleVirtualCursorPointerDown(input: {
  isOperationRunning: boolean;
  phase: string;
}) {
  return !input.isOperationRunning && input.phase === "active";
}

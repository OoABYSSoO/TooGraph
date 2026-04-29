export type LockedCanvasInteractionGuardAction =
  | { type: "allow-interaction" }
  | {
      type: "block-locked-interaction";
      clearCanvasTransientState: true;
      clearPendingConnection: true;
      clearSelectedEdge: true;
      emitLockedEditAttempt: true;
    };

export type LockedNodePointerCaptureAction =
  | { type: "ignore-unlocked" }
  | {
      type: "capture-locked-node";
      emitLockedEditAttempt: boolean;
      preventDefault: true;
      stopPropagation: true;
      focusCanvas: true;
      clearCanvasTransientState: true;
      clearPendingConnection: true;
      clearSelectedEdge: true;
      selectNodeId: string;
    };

export function resolveLockedCanvasInteractionGuardAction(input: {
  interactionLocked: boolean;
}): LockedCanvasInteractionGuardAction {
  if (!input.interactionLocked) {
    return { type: "allow-interaction" };
  }

  return {
    type: "block-locked-interaction",
    clearCanvasTransientState: true,
    clearPendingConnection: true,
    clearSelectedEdge: true,
    emitLockedEditAttempt: true,
  };
}

export function resolveLockedNodePointerCaptureAction(input: {
  interactionLocked: boolean;
  nodeId: string;
  shouldNotifyLockedAttempt: boolean;
}): LockedNodePointerCaptureAction {
  if (!input.interactionLocked) {
    return { type: "ignore-unlocked" };
  }

  return {
    type: "capture-locked-node",
    emitLockedEditAttempt: input.shouldNotifyLockedAttempt,
    preventDefault: true,
    stopPropagation: true,
    focusCanvas: true,
    clearCanvasTransientState: true,
    clearPendingConnection: true,
    clearSelectedEdge: true,
    selectNodeId: input.nodeId,
  };
}

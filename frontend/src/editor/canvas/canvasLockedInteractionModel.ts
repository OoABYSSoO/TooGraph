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

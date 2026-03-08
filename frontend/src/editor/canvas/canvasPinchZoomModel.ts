export type CanvasPointerSnapshot = {
  clientX: number;
  clientY: number;
  pointerType: string;
};

export type CanvasPinchZoomStart = {
  pointerIds: [number, number];
  startDistance: number;
  startScale: number;
  centerClientX: number;
  centerClientY: number;
};

export type CanvasPinchZoomUpdateRequest = {
  clientX: number;
  clientY: number;
  canvasLeft: number;
  canvasTop: number;
  nextScale: number;
};

export type CanvasPinchZoomUpdateAction =
  | { type: "ignore-missing-pinch" }
  | { type: "clear-pinch-zoom" }
  | { type: "ignore-non-positive-distance" }
  | { type: "zoom-at"; request: CanvasPinchZoomUpdateRequest };

export type CanvasPinchPointerReleaseAction =
  | { type: "end-pinch-zoom" }
  | { type: "continue-pointer-up" };

export type CanvasTouchPointerMoveAction =
  | { type: "continue-pointer-move" }
  | {
      type: "track-touch-pointer";
      preventDefault: boolean;
      schedulePinchZoomUpdate: boolean;
      stopPointerMove: boolean;
    };

type CanvasPointerDownSetupPolicy = {
  focusCanvas?: true;
  preventDefault: true;
  removeWindowSelection: true;
  setPointerCapture?: true;
  cancelScheduledDragFrame?: true;
  clearCanvasTransientState: true;
  clearPendingConnection: true;
  clearSelectedEdge: true;
  clearSelection: true;
  beginPan?: true;
};

export type CanvasPointerDownAction =
  | ({ type: "start-pinch-zoom" } & CanvasPointerDownSetupPolicy)
  | ({ type: "start-pan" } & CanvasPointerDownSetupPolicy);

export function resolvePointerDistance(left: Pick<CanvasPointerSnapshot, "clientX" | "clientY">, right: Pick<CanvasPointerSnapshot, "clientX" | "clientY">) {
  return Math.hypot(right.clientX - left.clientX, right.clientY - left.clientY);
}

export function resolvePointerCenter(left: Pick<CanvasPointerSnapshot, "clientX" | "clientY">, right: Pick<CanvasPointerSnapshot, "clientX" | "clientY">) {
  return {
    clientX: (left.clientX + right.clientX) / 2,
    clientY: (left.clientY + right.clientY) / 2,
  };
}

export function resolveCanvasPointerDownAction(input: { startedPinchZoom: boolean }): CanvasPointerDownAction {
  const sharedSetup = {
    preventDefault: true,
    removeWindowSelection: true,
    clearCanvasTransientState: true,
    clearPendingConnection: true,
    clearSelectedEdge: true,
    clearSelection: true,
  } as const;

  if (input.startedPinchZoom) {
    return {
      type: "start-pinch-zoom",
      ...sharedSetup,
    };
  }

  return {
    type: "start-pan",
    focusCanvas: true,
    ...sharedSetup,
    setPointerCapture: true,
    cancelScheduledDragFrame: true,
    beginPan: true,
  };
}

export function buildPinchZoomStart(input: {
  pointers: readonly [number, CanvasPointerSnapshot][];
  currentScale: number;
}): CanvasPinchZoomStart | null {
  const touchPointers = input.pointers.filter(([, pointer]) => pointer.pointerType === "touch");
  if (touchPointers.length < 2) {
    return null;
  }

  const [leftEntry, rightEntry] = touchPointers;
  if (!leftEntry || !rightEntry) {
    return null;
  }

  const [, leftPointer] = leftEntry;
  const [, rightPointer] = rightEntry;
  const startDistance = resolvePointerDistance(leftPointer, rightPointer);
  if (startDistance <= 0) {
    return null;
  }

  const center = resolvePointerCenter(leftPointer, rightPointer);
  return {
    pointerIds: [leftEntry[0], rightEntry[0]],
    startDistance,
    startScale: input.currentScale,
    centerClientX: center.clientX,
    centerClientY: center.clientY,
  };
}

export function resolveCanvasPinchZoomUpdateAction(input: {
  pinch: CanvasPinchZoomStart | null;
  leftPointer: Pick<CanvasPointerSnapshot, "clientX" | "clientY"> | null;
  rightPointer: Pick<CanvasPointerSnapshot, "clientX" | "clientY"> | null;
  canvasRect: { left: number; top: number } | null;
}): CanvasPinchZoomUpdateAction {
  if (!input.pinch) {
    return { type: "ignore-missing-pinch" };
  }
  if (!input.leftPointer || !input.rightPointer || !input.canvasRect) {
    return { type: "clear-pinch-zoom" };
  }

  const nextDistance = resolvePointerDistance(input.leftPointer, input.rightPointer);
  if (nextDistance <= 0) {
    return { type: "ignore-non-positive-distance" };
  }

  const center = resolvePointerCenter(input.leftPointer, input.rightPointer);
  return {
    type: "zoom-at",
    request: {
      clientX: center.clientX,
      clientY: center.clientY,
      canvasLeft: input.canvasRect.left,
      canvasTop: input.canvasRect.top,
      nextScale: input.pinch.startScale * (nextDistance / input.pinch.startDistance),
    },
  };
}

export function resolveCanvasPinchPointerReleaseAction(input: {
  pinch: Pick<CanvasPinchZoomStart, "pointerIds"> | null;
  pointerId: number;
}): CanvasPinchPointerReleaseAction {
  if (input.pinch?.pointerIds.includes(input.pointerId)) {
    return { type: "end-pinch-zoom" };
  }

  return { type: "continue-pointer-up" };
}

export function resolveCanvasTouchPointerMoveAction(input: {
  pointerType: string;
  isTrackedPointer: boolean;
  hasPinchZoom: boolean;
}): CanvasTouchPointerMoveAction {
  if (input.pointerType !== "touch" || !input.isTrackedPointer) {
    return { type: "continue-pointer-move" };
  }

  return {
    type: "track-touch-pointer",
    preventDefault: input.hasPinchZoom,
    schedulePinchZoomUpdate: input.hasPinchZoom,
    stopPointerMove: input.hasPinchZoom,
  };
}

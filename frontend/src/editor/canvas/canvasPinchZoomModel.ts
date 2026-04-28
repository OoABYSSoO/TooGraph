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

export function resolvePointerDistance(left: Pick<CanvasPointerSnapshot, "clientX" | "clientY">, right: Pick<CanvasPointerSnapshot, "clientX" | "clientY">) {
  return Math.hypot(right.clientX - left.clientX, right.clientY - left.clientY);
}

export function resolvePointerCenter(left: Pick<CanvasPointerSnapshot, "clientX" | "clientY">, right: Pick<CanvasPointerSnapshot, "clientX" | "clientY">) {
  return {
    clientX: (left.clientX + right.clientX) / 2,
    clientY: (left.clientY + right.clientY) / 2,
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

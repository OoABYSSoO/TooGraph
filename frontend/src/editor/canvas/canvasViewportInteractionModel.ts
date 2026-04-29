type CanvasRectSnapshot = {
  left: number;
  top: number;
};

export type CanvasWheelZoomRequest =
  | { type: "ignore" }
  | { type: "set-scale"; nextScale: number }
  | {
      type: "zoom-at";
      clientX: number;
      clientY: number;
      canvasLeft: number;
      canvasTop: number;
      nextScale: number;
    };

export function resolveWheelZoomDelta(deltaY: number) {
  if (deltaY === 0) {
    return 0;
  }
  const direction = deltaY > 0 ? -1 : 1;
  return direction * 0.08;
}

export function resolveCanvasWheelZoomRequest(input: {
  deltaY: number;
  currentScale: number;
  clientX: number;
  clientY: number;
  canvasRect: CanvasRectSnapshot | null;
}): CanvasWheelZoomRequest {
  const wheelZoomDelta = resolveWheelZoomDelta(input.deltaY);
  if (wheelZoomDelta === 0) {
    return { type: "ignore" };
  }

  const nextScale = input.currentScale + wheelZoomDelta;
  if (!input.canvasRect) {
    return { type: "set-scale", nextScale };
  }

  return {
    type: "zoom-at",
    clientX: input.clientX,
    clientY: input.clientY,
    canvasLeft: input.canvasRect.left,
    canvasTop: input.canvasRect.top,
    nextScale,
  };
}

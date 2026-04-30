import {
  clampCanvasViewportScale,
  DEFAULT_CANVAS_VIEWPORT,
  type CanvasViewport,
} from "./canvasViewport.ts";

type CanvasRectSnapshot = {
  left: number;
  top: number;
};

type CanvasWorldPoint = {
  x: number;
  y: number;
};

const CANVAS_ZOOM_BUTTON_SCALE_STEP = 0.1;

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

export type CanvasZoomButtonControl = "zoom-out" | "zoom-in" | "reset";

export type CanvasZoomButtonAction =
  | { type: "zoom-around-center"; nextScale: number }
  | { type: "reset-viewport"; viewport: CanvasViewport };

export type CanvasPanPointerMoveAction =
  | { type: "continue-pointer-move" }
  | { type: "schedule-pan-move" };

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

export function resolveCanvasZoomButtonAction(input: {
  control: CanvasZoomButtonControl;
  currentScale: number;
}): CanvasZoomButtonAction {
  switch (input.control) {
    case "zoom-out":
      return {
        type: "zoom-around-center",
        nextScale: normalizeZoomButtonScale(input.currentScale - CANVAS_ZOOM_BUTTON_SCALE_STEP),
      };
    case "zoom-in":
      return {
        type: "zoom-around-center",
        nextScale: normalizeZoomButtonScale(input.currentScale + CANVAS_ZOOM_BUTTON_SCALE_STEP),
      };
    case "reset":
      return {
        type: "reset-viewport",
        viewport: DEFAULT_CANVAS_VIEWPORT,
      };
  }
}

export function resolveCanvasPanPointerMoveAction(input: { isPanning: boolean }): CanvasPanPointerMoveAction {
  if (input.isPanning) {
    return { type: "schedule-pan-move" };
  }

  return { type: "continue-pointer-move" };
}

export function resolveCanvasWorldPoint(input: {
  clientX: number;
  clientY: number;
  canvasRect: CanvasRectSnapshot | null;
  viewport: CanvasViewport;
  fallbackPoint: CanvasWorldPoint | null;
}): CanvasWorldPoint {
  if (!input.canvasRect) {
    return input.fallbackPoint ?? { x: 0, y: 0 };
  }

  return {
    x: (input.clientX - input.canvasRect.left - input.viewport.x) / input.viewport.scale,
    y: (input.clientY - input.canvasRect.top - input.viewport.y) / input.viewport.scale,
  };
}

function normalizeZoomButtonScale(scale: number) {
  return clampCanvasViewportScale(Number(scale.toFixed(2)));
}

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

type CanvasSizeSnapshot = {
  width: number;
  height: number;
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

export type CanvasSizeUpdateAction =
  | { type: "ignore-missing-element" }
  | { type: "ignore-unchanged-size" }
  | { type: "update-size"; size: CanvasSizeSnapshot };

export type CanvasViewportEnsurePointVisibleAction =
  | { type: "ignore-missing-canvas-size" }
  | { type: "keep-viewport" }
  | { type: "set-viewport"; viewport: CanvasViewport };

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
  isCanvasEmpty?: boolean;
}): CanvasWheelZoomRequest {
  if (input.isCanvasEmpty) {
    return { type: "ignore" };
  }

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

export function resolveCanvasPanPointerMoveAction(input: { isPanning: boolean; isCanvasEmpty?: boolean }): CanvasPanPointerMoveAction {
  if (input.isCanvasEmpty) {
    return { type: "continue-pointer-move" };
  }

  if (input.isPanning) {
    return { type: "schedule-pan-move" };
  }

  return { type: "continue-pointer-move" };
}

export function resolveCanvasSizeUpdateAction(input: {
  currentSize: CanvasSizeSnapshot;
  nextSize: CanvasSizeSnapshot | null;
}): CanvasSizeUpdateAction {
  if (!input.nextSize) {
    return { type: "ignore-missing-element" };
  }

  if (input.currentSize.width === input.nextSize.width && input.currentSize.height === input.nextSize.height) {
    return { type: "ignore-unchanged-size" };
  }

  return { type: "update-size", size: input.nextSize };
}

export function resolveCanvasViewportEnsurePointVisibleAction(input: {
  worldPoint: CanvasWorldPoint | null;
  viewport: CanvasViewport;
  canvasSize: CanvasSizeSnapshot | null;
  margin?: number;
}): CanvasViewportEnsurePointVisibleAction {
  if (!input.worldPoint || !input.canvasSize || input.canvasSize.width <= 0 || input.canvasSize.height <= 0) {
    return { type: "ignore-missing-canvas-size" };
  }

  const scale = input.viewport.scale > 0 ? input.viewport.scale : 1;
  const margin = normalizeVisibleMargin(input.margin ?? 96, input.canvasSize);
  const screenX = input.viewport.x + input.worldPoint.x * scale;
  const screenY = input.viewport.y + input.worldPoint.y * scale;
  const targetX = clampNumber(screenX, margin.x, input.canvasSize.width - margin.x);
  const targetY = clampNumber(screenY, margin.y, input.canvasSize.height - margin.y);
  const deltaX = targetX - screenX;
  const deltaY = targetY - screenY;

  if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
    return { type: "keep-viewport" };
  }

  return {
    type: "set-viewport",
    viewport: {
      x: Math.round(input.viewport.x + deltaX),
      y: Math.round(input.viewport.y + deltaY),
      scale: input.viewport.scale,
    },
  };
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

function normalizeVisibleMargin(margin: number, canvasSize: CanvasSizeSnapshot) {
  const safeMargin = Math.max(0, Number.isFinite(margin) ? margin : 0);
  return {
    x: Math.min(safeMargin, canvasSize.width / 2),
    y: Math.min(safeMargin, canvasSize.height / 2),
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

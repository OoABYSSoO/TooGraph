export type CanvasViewport = {
  x: number;
  y: number;
  scale: number;
};

export const MIN_CANVAS_VIEWPORT_SCALE = 0.4;
export const MAX_CANVAS_VIEWPORT_SCALE = 2.2;
export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = {
  x: 0,
  y: 0,
  scale: 1,
};

export function normalizeCanvasViewport(value: unknown): CanvasViewport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<CanvasViewport>;
  const { x, y, scale } = candidate;
  if (typeof x !== "number" || typeof y !== "number" || typeof scale !== "number") {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale)) {
    return null;
  }
  return {
    x,
    y,
    scale: clampCanvasViewportScale(scale),
  };
}

export function clampCanvasViewportScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_CANVAS_VIEWPORT_SCALE), MAX_CANVAS_VIEWPORT_SCALE);
}

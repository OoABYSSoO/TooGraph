export type ResolveFocusedViewportInput = {
  currentScale: number;
  canvasWidth: number;
  canvasHeight: number;
  nodeX: number;
  nodeY: number;
  nodeWidth: number;
  nodeHeight: number;
};

export type FocusedViewport = {
  x: number;
  y: number;
  scale: number;
};

export function resolveFocusedViewport(input: ResolveFocusedViewportInput): FocusedViewport {
  const scale = Math.max(input.currentScale, 0.95);
  const nodeCenterX = input.nodeX + input.nodeWidth / 2;
  const nodeCenterY = input.nodeY + input.nodeHeight / 2;

  return {
    scale,
    x: input.canvasWidth / 2 - nodeCenterX * scale,
    y: input.canvasHeight / 2 - nodeCenterY * scale,
  };
}

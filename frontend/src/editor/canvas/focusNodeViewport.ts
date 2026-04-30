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

export type FocusedNodeViewportAction =
  | { type: "ignore-missing-target" }
  | { type: "set-viewport"; viewport: FocusedViewport };

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

export function resolveFocusedNodeViewportAction(input: {
  currentScale: number;
  canvasSize: { width: number; height: number } | null;
  nodePosition: { x: number; y: number } | null;
  nodeSize: { width: number; height: number } | null;
}): FocusedNodeViewportAction {
  if (!input.canvasSize || !input.nodePosition || !input.nodeSize) {
    return { type: "ignore-missing-target" };
  }

  return {
    type: "set-viewport",
    viewport: resolveFocusedViewport({
      currentScale: input.currentScale,
      canvasWidth: input.canvasSize.width,
      canvasHeight: input.canvasSize.height,
      nodeX: input.nodePosition.x,
      nodeY: input.nodePosition.y,
      nodeWidth: input.nodeSize.width,
      nodeHeight: input.nodeSize.height,
    }),
  };
}

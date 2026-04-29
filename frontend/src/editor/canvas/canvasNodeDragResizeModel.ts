import { resolveNodeResize, type NodeResizeHandle } from "./nodeResize.ts";
import type { GraphNodeSize, GraphPosition } from "@/types/node-system";

export const NODE_POINTER_ACTIVATION_THRESHOLD = 3;

export type CanvasPointerPosition = {
  clientX: number;
  clientY: number;
};

export type CanvasNodeDragState = {
  nodeId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  captureElement: HTMLElement | null;
  moved: boolean;
};

export type CanvasNodeResizeDragState = {
  nodeId: string;
  pointerId: number;
  handle: NodeResizeHandle;
  startClientX: number;
  startClientY: number;
  originPosition: GraphPosition;
  originSize: GraphNodeSize;
  captureElement: HTMLElement | null;
  moved: boolean;
};

export type CanvasNodeDragMoveResult = {
  drag: CanvasNodeDragState;
  update: { nodeId: string; position: GraphPosition } | null;
  activated: boolean;
};

export type CanvasNodeResizeDragMoveResult = {
  drag: CanvasNodeResizeDragState;
  update: { nodeId: string; position: GraphPosition; size: GraphNodeSize } | null;
  activated: boolean;
};

export function resolveNodeDragMove(input: {
  drag: CanvasNodeDragState;
  pointer: CanvasPointerPosition;
  viewportScale: number;
  activationThreshold?: number;
}): CanvasNodeDragMoveResult {
  const pointerDeltaX = input.pointer.clientX - input.drag.startClientX;
  const pointerDeltaY = input.pointer.clientY - input.drag.startClientY;
  if (isPendingActivation(input.drag, pointerDeltaX, pointerDeltaY, input.activationThreshold)) {
    return {
      drag: input.drag,
      update: null,
      activated: false,
    };
  }

  const drag = input.drag.moved ? input.drag : { ...input.drag, moved: true };
  const scale = resolveViewportScale(input.viewportScale);
  return {
    drag,
    update: {
      nodeId: drag.nodeId,
      position: {
        x: Math.round(drag.originX + pointerDeltaX / scale),
        y: Math.round(drag.originY + pointerDeltaY / scale),
      },
    },
    activated: !input.drag.moved,
  };
}

export function resolveNodeResizeDragMove(input: {
  drag: CanvasNodeResizeDragState;
  pointer: CanvasPointerPosition;
  viewportScale: number;
  activationThreshold?: number;
}): CanvasNodeResizeDragMoveResult {
  const pointerDeltaX = input.pointer.clientX - input.drag.startClientX;
  const pointerDeltaY = input.pointer.clientY - input.drag.startClientY;
  if (isPendingActivation(input.drag, pointerDeltaX, pointerDeltaY, input.activationThreshold)) {
    return {
      drag: input.drag,
      update: null,
      activated: false,
    };
  }

  const drag = input.drag.moved ? input.drag : { ...input.drag, moved: true };
  const scale = resolveViewportScale(input.viewportScale);
  const resizeResult = resolveNodeResize({
    handle: drag.handle,
    originPosition: drag.originPosition,
    originSize: drag.originSize,
    deltaX: pointerDeltaX / scale,
    deltaY: pointerDeltaY / scale,
  });

  return {
    drag,
    update: {
      nodeId: drag.nodeId,
      ...resizeResult,
    },
    activated: !input.drag.moved,
  };
}

function isPendingActivation(
  drag: { moved: boolean },
  pointerDeltaX: number,
  pointerDeltaY: number,
  activationThreshold = NODE_POINTER_ACTIVATION_THRESHOLD,
) {
  return !drag.moved && Math.abs(pointerDeltaX) <= activationThreshold && Math.abs(pointerDeltaY) <= activationThreshold;
}

function resolveViewportScale(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

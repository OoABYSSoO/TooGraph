import { ref } from "vue";

import {
  resolveNodeDragMove,
  resolveNodeResizeDragMove,
  type CanvasNodeDragState,
  type CanvasNodeResizeDragState,
} from "./canvasNodeDragResizeModel.ts";
import type { GraphNodeSize, GraphPosition } from "@/types/node-system";

type TimeoutScheduler = {
  setTimeout?: (callback: () => void, delay: number) => number;
  clearTimeout?: (timeoutId: number) => void;
};

export type CanvasNodeDragResizePointer = {
  pointerId: number;
  clientX: number;
  clientY: number;
};

export type CanvasNodeDragResizeInput = {
  viewportScale: () => number;
  scheduleDragFrame: (callback: () => void) => void;
  emitNodePosition: (payload: { nodeId: string; position: GraphPosition }) => void;
  emitNodeSize: (payload: { nodeId: string; position: GraphPosition; size: GraphNodeSize }) => void;
  timeoutScheduler?: TimeoutScheduler;
};

export function useCanvasNodeDragResize(input: CanvasNodeDragResizeInput) {
  const nodeDrag = ref<CanvasNodeDragState | null>(null);
  const nodeResizeDrag = ref<CanvasNodeResizeDragState | null>(null);
  const suppressedNodeClickId = ref<string | null>(null);
  const suppressedNodeClickTimeoutRef = ref<number | null>(null);

  function startNodeDrag(drag: CanvasNodeDragState) {
    nodeDrag.value = drag;
  }

  function startNodeResizeDrag(drag: CanvasNodeResizeDragState) {
    nodeDrag.value = null;
    nodeResizeDrag.value = drag;
  }

  function clearNodeDragResizeState() {
    nodeDrag.value = null;
    nodeResizeDrag.value = null;
  }

  function handleNodeDragResizePointerMove(pointer: CanvasNodeDragResizePointer) {
    if (nodeResizeDrag.value && nodeResizeDrag.value.pointerId === pointer.pointerId) {
      const resizeResult = resolveNodeResizeDragMove({
        drag: nodeResizeDrag.value,
        pointer,
        viewportScale: input.viewportScale(),
      });
      nodeResizeDrag.value = resizeResult.drag;
      if (!resizeResult.update) {
        return true;
      }
      const resizeUpdate = resizeResult.update;
      if (nodeResizeDrag.value.captureElement && !nodeResizeDrag.value.captureElement.hasPointerCapture(pointer.pointerId)) {
        nodeResizeDrag.value.captureElement.setPointerCapture(pointer.pointerId);
      }
      input.scheduleDragFrame(() => {
        input.emitNodeSize(resizeUpdate);
      });
      return true;
    }

    if (nodeDrag.value && nodeDrag.value.pointerId === pointer.pointerId) {
      const dragResult = resolveNodeDragMove({
        drag: nodeDrag.value,
        pointer,
        viewportScale: input.viewportScale(),
      });
      nodeDrag.value = dragResult.drag;
      if (!dragResult.update) {
        return true;
      }
      const dragUpdate = dragResult.update;
      if (nodeDrag.value.captureElement && !nodeDrag.value.captureElement.hasPointerCapture(pointer.pointerId)) {
        nodeDrag.value.captureElement.setPointerCapture(pointer.pointerId);
      }
      input.scheduleDragFrame(() => {
        input.emitNodePosition(dragUpdate);
      });
      return true;
    }

    return false;
  }

  function releaseNodeDragResizePointerCapture(pointerId: number) {
    if (nodeDrag.value?.captureElement?.hasPointerCapture(pointerId)) {
      nodeDrag.value.captureElement.releasePointerCapture(pointerId);
    }
    if (nodeResizeDrag.value?.captureElement?.hasPointerCapture(pointerId)) {
      nodeResizeDrag.value.captureElement.releasePointerCapture(pointerId);
    }
  }

  function finishNodeDragResizePointer(pointerId: number) {
    if (nodeDrag.value && nodeDrag.value.pointerId === pointerId) {
      if (nodeDrag.value.moved) {
        startSuppressedNodeClickWindow(nodeDrag.value.nodeId);
      }
      nodeDrag.value = null;
    }
    if (nodeResizeDrag.value && nodeResizeDrag.value.pointerId === pointerId) {
      if (nodeResizeDrag.value.moved) {
        startSuppressedNodeClickWindow(nodeResizeDrag.value.nodeId);
      }
      nodeResizeDrag.value = null;
    }
  }

  function clearSuppressedNodeClickWindow() {
    if (suppressedNodeClickTimeoutRef.value !== null) {
      input.timeoutScheduler?.clearTimeout?.(suppressedNodeClickTimeoutRef.value);
      suppressedNodeClickTimeoutRef.value = null;
    }
    suppressedNodeClickId.value = null;
  }

  function startSuppressedNodeClickWindow(nodeId: string) {
    clearSuppressedNodeClickWindow();
    suppressedNodeClickId.value = nodeId;
    suppressedNodeClickTimeoutRef.value = input.timeoutScheduler?.setTimeout
      ? input.timeoutScheduler.setTimeout(() => {
          suppressedNodeClickTimeoutRef.value = null;
          if (suppressedNodeClickId.value === nodeId) {
            suppressedNodeClickId.value = null;
          }
        }, 80)
      : null;
  }

  function consumeSuppressedNodeClick(nodeId: string) {
    if (suppressedNodeClickId.value !== nodeId) {
      return false;
    }
    clearSuppressedNodeClickWindow();
    return true;
  }

  function handleNodeClickCapture(nodeId: string, event: MouseEvent) {
    if (!consumeSuppressedNodeClick(nodeId)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function teardownNodeDragResize() {
    clearNodeDragResizeState();
    clearSuppressedNodeClickWindow();
  }

  return {
    nodeDrag,
    nodeResizeDrag,
    startNodeDrag,
    startNodeResizeDrag,
    clearNodeDragResizeState,
    handleNodeDragResizePointerMove,
    releaseNodeDragResizePointerCapture,
    finishNodeDragResizePointer,
    consumeSuppressedNodeClick,
    handleNodeClickCapture,
    teardownNodeDragResize,
  };
}

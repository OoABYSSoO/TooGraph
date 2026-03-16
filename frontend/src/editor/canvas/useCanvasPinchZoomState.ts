import { ref } from "vue";

import {
  buildPinchZoomStart,
  resolveCanvasPinchPointerReleaseAction,
  resolveCanvasPinchZoomUpdateAction,
  resolveCanvasTouchPointerMoveAction,
  type CanvasPinchPointerReleaseAction,
  type CanvasPinchZoomStart,
  type CanvasPinchZoomUpdateRequest,
  type CanvasPointerSnapshot,
} from "./canvasPinchZoomModel.ts";

type PointerLike = CanvasPointerSnapshot & {
  pointerId: number;
};

type CanvasPinchZoomStateInput = {
  currentScale: () => number;
  getCanvasRect: () => { left: number; top: number } | null;
  scheduleDragFrame: (callback: () => void) => void;
  endPan: () => void;
  zoomAt: (request: CanvasPinchZoomUpdateRequest) => void;
};

export function useCanvasPinchZoomState(input: CanvasPinchZoomStateInput) {
  const activeCanvasPointers = new Map<number, CanvasPointerSnapshot>();
  const pinchZoom = ref<CanvasPinchZoomStart | null>(null);

  function setCanvasPointer(pointer: PointerLike) {
    activeCanvasPointers.set(pointer.pointerId, {
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      pointerType: pointer.pointerType,
    });
  }

  function clearPinchZoom() {
    pinchZoom.value = null;
    activeCanvasPointers.clear();
  }

  function beginPinchZoomIfReady() {
    const nextPinchZoom = buildPinchZoomStart({
      pointers: Array.from(activeCanvasPointers.entries()),
      currentScale: input.currentScale(),
    });
    if (!nextPinchZoom) {
      return false;
    }

    input.endPan();
    pinchZoom.value = nextPinchZoom;
    return true;
  }

  function trackTouchPointerDown(pointer: PointerLike) {
    if (pointer.pointerType !== "touch") {
      return false;
    }
    setCanvasPointer(pointer);
    return beginPinchZoomIfReady();
  }

  function updatePinchZoom() {
    const pinch = pinchZoom.value;
    const leftPointer = pinch ? activeCanvasPointers.get(pinch.pointerIds[0]) ?? null : null;
    const rightPointer = pinch ? activeCanvasPointers.get(pinch.pointerIds[1]) ?? null : null;
    const canvasRect = pinch && leftPointer && rightPointer ? input.getCanvasRect() : null;
    const pinchZoomUpdateAction = resolveCanvasPinchZoomUpdateAction({
      pinch,
      leftPointer,
      rightPointer,
      canvasRect,
    });
    switch (pinchZoomUpdateAction.type) {
      case "ignore-missing-pinch":
      case "ignore-non-positive-distance":
        return;
      case "clear-pinch-zoom":
        clearPinchZoom();
        return;
      case "zoom-at":
        input.zoomAt(pinchZoomUpdateAction.request);
        return;
    }
  }

  function handleTouchPointerMove(pointer: PointerLike, preventDefault: () => void) {
    const touchPointerMoveAction = resolveCanvasTouchPointerMoveAction({
      pointerType: pointer.pointerType,
      isTrackedPointer: activeCanvasPointers.has(pointer.pointerId),
      hasPinchZoom: Boolean(pinchZoom.value),
    });
    switch (touchPointerMoveAction.type) {
      case "continue-pointer-move":
        return false;
      case "track-touch-pointer":
        setCanvasPointer(pointer);
        if (touchPointerMoveAction.preventDefault) {
          preventDefault();
        }
        if (touchPointerMoveAction.schedulePinchZoomUpdate) {
          input.scheduleDragFrame(() => {
            updatePinchZoom();
          });
        }
        return touchPointerMoveAction.stopPointerMove;
    }
  }

  function releaseCanvasPointer(pointerId: number): CanvasPinchPointerReleaseAction {
    activeCanvasPointers.delete(pointerId);
    return resolveCanvasPinchPointerReleaseAction({
      pinch: pinchZoom.value,
      pointerId,
    });
  }

  return {
    clearPinchZoom,
    handleTouchPointerMove,
    pinchZoom,
    releaseCanvasPointer,
    trackTouchPointerDown,
    updatePinchZoom,
  };
}

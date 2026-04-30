import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasPinchZoomUpdateRequest } from "./canvasPinchZoomModel.ts";
import { useCanvasPinchZoomState } from "./useCanvasPinchZoomState.ts";

function createHarness() {
  const scheduledCallbacks: Array<() => void> = [];
  const zoomRequests: CanvasPinchZoomUpdateRequest[] = [];
  let endPanCount = 0;
  const state = useCanvasPinchZoomState({
    currentScale: () => 2,
    getCanvasRect: () => ({ left: 10, top: 20 }),
    scheduleDragFrame: (callback) => {
      scheduledCallbacks.push(callback);
    },
    endPan: () => {
      endPanCount += 1;
    },
    zoomAt: (request) => {
      zoomRequests.push(request);
    },
  });

  return {
    get endPanCount() {
      return endPanCount;
    },
    scheduledCallbacks,
    state,
    zoomRequests,
  };
}

test("useCanvasPinchZoomState starts pinch zoom after two touch pointers", () => {
  const harness = createHarness();

  assert.equal(
    harness.state.trackTouchPointerDown({ pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0 }),
    false,
  );
  assert.equal(
    harness.state.trackTouchPointerDown({ pointerId: 2, pointerType: "touch", clientX: 0, clientY: 100 }),
    true,
  );

  assert.equal(harness.endPanCount, 1);
  assert.deepEqual(harness.state.pinchZoom.value?.pointerIds, [1, 2]);
  assert.equal(harness.state.pinchZoom.value?.startScale, 2);
});

test("useCanvasPinchZoomState tracks touch movement and schedules zoom updates", () => {
  const harness = createHarness();
  harness.state.trackTouchPointerDown({ pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0 });
  harness.state.trackTouchPointerDown({ pointerId: 2, pointerType: "touch", clientX: 0, clientY: 100 });
  let prevented = false;

  const stopPointerMove = harness.state.handleTouchPointerMove(
    { pointerId: 2, pointerType: "touch", clientX: 0, clientY: 200 },
    () => {
      prevented = true;
    },
  );

  assert.equal(stopPointerMove, true);
  assert.equal(prevented, true);
  assert.equal(harness.scheduledCallbacks.length, 1);
  harness.scheduledCallbacks[0]?.();

  assert.equal(harness.zoomRequests.length, 1);
  assert.equal(harness.zoomRequests[0]?.nextScale, 4);
  assert.equal(harness.zoomRequests[0]?.canvasLeft, 10);
  assert.equal(harness.zoomRequests[0]?.canvasTop, 20);
});

test("useCanvasPinchZoomState releases pinch pointers and clears state", () => {
  const harness = createHarness();
  harness.state.trackTouchPointerDown({ pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0 });
  harness.state.trackTouchPointerDown({ pointerId: 2, pointerType: "touch", clientX: 0, clientY: 100 });

  const releaseAction = harness.state.releaseCanvasPointer(1);
  assert.deepEqual(releaseAction, { type: "end-pinch-zoom" });

  harness.state.clearPinchZoom();
  assert.equal(harness.state.pinchZoom.value, null);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPinchZoomStart,
  resolveCanvasPinchPointerReleaseAction,
  resolveCanvasPinchZoomUpdateAction,
  resolveCanvasPointerDownAction,
  resolveCanvasTouchPointerMoveAction,
  resolvePointerCenter,
  resolvePointerDistance,
} from "./canvasPinchZoomModel.ts";

test("canvas pinch zoom model resolves pointer distance and center", () => {
  assert.equal(resolvePointerDistance({ clientX: 10, clientY: 20 }, { clientX: 13, clientY: 24 }), 5);
  assert.deepEqual(resolvePointerCenter({ clientX: 10, clientY: 20 }, { clientX: 14, clientY: 28 }), {
    clientX: 12,
    clientY: 24,
  });
});

test("canvas pinch zoom model starts only with two touch pointers and positive distance", () => {
  assert.deepEqual(
    buildPinchZoomStart({
      pointers: [
        [1, { clientX: 0, clientY: 0, pointerType: "touch" }],
        [2, { clientX: 0, clientY: 10, pointerType: "touch" }],
        [3, { clientX: 50, clientY: 50, pointerType: "mouse" }],
      ],
      currentScale: 1.5,
    }),
    {
      pointerIds: [1, 2],
      startDistance: 10,
      startScale: 1.5,
      centerClientX: 0,
      centerClientY: 5,
    },
  );
  assert.equal(buildPinchZoomStart({ pointers: [[1, { clientX: 0, clientY: 0, pointerType: "touch" }]], currentScale: 1 }), null);
  assert.equal(
    buildPinchZoomStart({
      pointers: [
        [1, { clientX: 0, clientY: 0, pointerType: "touch" }],
        [2, { clientX: 0, clientY: 0, pointerType: "touch" }],
      ],
      currentScale: 1,
    }),
    null,
  );
});

test("canvas pinch zoom model resolves pointer-down pan and pinch setup actions", () => {
  assert.deepEqual(resolveCanvasPointerDownAction({ startedPinchZoom: true }), {
    type: "start-pinch-zoom",
    preventDefault: true,
    removeWindowSelection: true,
    clearCanvasTransientState: true,
    clearPendingConnection: true,
    clearSelectedEdge: true,
    clearSelection: true,
  });
  assert.deepEqual(resolveCanvasPointerDownAction({ startedPinchZoom: false }), {
    type: "start-pan",
    focusCanvas: true,
    preventDefault: true,
    removeWindowSelection: true,
    setPointerCapture: true,
    cancelScheduledDragFrame: true,
    clearCanvasTransientState: true,
    clearPendingConnection: true,
    clearSelectedEdge: true,
    clearSelection: true,
    beginPan: true,
  });
});

test("canvas pinch zoom model resolves update actions", () => {
  const pinch = {
    pointerIds: [1, 2] as [number, number],
    startDistance: 10,
    startScale: 1.25,
    centerClientX: 0,
    centerClientY: 5,
  };

  assert.deepEqual(
    resolveCanvasPinchZoomUpdateAction({
      pinch: null,
      leftPointer: { clientX: 0, clientY: 0 },
      rightPointer: { clientX: 0, clientY: 10 },
      canvasRect: { left: 10, top: 20 },
    }),
    { type: "ignore-missing-pinch" },
  );
  assert.deepEqual(
    resolveCanvasPinchZoomUpdateAction({
      pinch,
      leftPointer: null,
      rightPointer: { clientX: 0, clientY: 10 },
      canvasRect: { left: 10, top: 20 },
    }),
    { type: "clear-pinch-zoom" },
  );
  assert.deepEqual(
    resolveCanvasPinchZoomUpdateAction({
      pinch,
      leftPointer: { clientX: 0, clientY: 0 },
      rightPointer: { clientX: 0, clientY: 10 },
      canvasRect: null,
    }),
    { type: "clear-pinch-zoom" },
  );
  assert.deepEqual(
    resolveCanvasPinchZoomUpdateAction({
      pinch,
      leftPointer: { clientX: 4, clientY: 4 },
      rightPointer: { clientX: 4, clientY: 4 },
      canvasRect: { left: 10, top: 20 },
    }),
    { type: "ignore-non-positive-distance" },
  );
  assert.deepEqual(
    resolveCanvasPinchZoomUpdateAction({
      pinch,
      leftPointer: { clientX: 4, clientY: 8 },
      rightPointer: { clientX: 4, clientY: 28 },
      canvasRect: { left: 10, top: 20 },
    }),
    {
      type: "zoom-at",
      request: {
        clientX: 4,
        clientY: 18,
        canvasLeft: 10,
        canvasTop: 20,
        nextScale: 2.5,
      },
    },
  );
});

test("canvas pinch zoom model resolves pointer release actions", () => {
  const pinch = {
    pointerIds: [1, 2] as [number, number],
    startDistance: 10,
    startScale: 1.25,
    centerClientX: 0,
    centerClientY: 5,
  };

  assert.deepEqual(resolveCanvasPinchPointerReleaseAction({ pinch: null, pointerId: 1 }), {
    type: "continue-pointer-up",
  });
  assert.deepEqual(resolveCanvasPinchPointerReleaseAction({ pinch, pointerId: 1 }), {
    type: "end-pinch-zoom",
  });
  assert.deepEqual(resolveCanvasPinchPointerReleaseAction({ pinch, pointerId: 3 }), {
    type: "continue-pointer-up",
  });
});

test("canvas pinch zoom model resolves touch pointer-move actions", () => {
  assert.deepEqual(
    resolveCanvasTouchPointerMoveAction({
      pointerType: "mouse",
      isTrackedPointer: true,
      hasPinchZoom: true,
    }),
    { type: "continue-pointer-move" },
  );
  assert.deepEqual(
    resolveCanvasTouchPointerMoveAction({
      pointerType: "touch",
      isTrackedPointer: false,
      hasPinchZoom: true,
    }),
    { type: "continue-pointer-move" },
  );
  assert.deepEqual(
    resolveCanvasTouchPointerMoveAction({
      pointerType: "touch",
      isTrackedPointer: true,
      hasPinchZoom: false,
    }),
    {
      type: "track-touch-pointer",
      preventDefault: false,
      schedulePinchZoomUpdate: false,
      stopPointerMove: false,
    },
  );
  assert.deepEqual(
    resolveCanvasTouchPointerMoveAction({
      pointerType: "touch",
      isTrackedPointer: true,
      hasPinchZoom: true,
    }),
    {
      type: "track-touch-pointer",
      preventDefault: true,
      schedulePinchZoomUpdate: true,
      stopPointerMove: true,
    },
  );
});

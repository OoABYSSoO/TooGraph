import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCanvasWheelZoomRequest,
  resolveWheelZoomDelta,
} from "./canvasViewportInteractionModel.ts";

test("canvas viewport interaction model resolves wheel zoom deltas", () => {
  assert.equal(resolveWheelZoomDelta(0), 0);
  assert.equal(resolveWheelZoomDelta(120), -0.08);
  assert.equal(resolveWheelZoomDelta(-120), 0.08);
});

test("canvas viewport interaction model resolves wheel zoom requests", () => {
  assert.deepEqual(
    resolveCanvasWheelZoomRequest({
      deltaY: 0,
      currentScale: 1,
      clientX: 120,
      clientY: 80,
      canvasRect: { left: 10, top: 20 },
    }),
    { type: "ignore" },
  );
  assert.deepEqual(
    resolveCanvasWheelZoomRequest({
      deltaY: -120,
      currentScale: 1,
      clientX: 120,
      clientY: 80,
      canvasRect: { left: 10, top: 20 },
    }),
    {
      type: "zoom-at",
      clientX: 120,
      clientY: 80,
      canvasLeft: 10,
      canvasTop: 20,
      nextScale: 1.08,
    },
  );
  assert.deepEqual(
    resolveCanvasWheelZoomRequest({
      deltaY: 120,
      currentScale: 1,
      clientX: 120,
      clientY: 80,
      canvasRect: null,
    }),
    {
      type: "set-scale",
      nextScale: 0.92,
    },
  );
});

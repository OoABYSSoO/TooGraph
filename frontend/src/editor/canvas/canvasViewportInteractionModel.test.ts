import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCanvasViewportEnsurePointVisibleAction,
  resolveCanvasPanPointerMoveAction,
  resolveCanvasSizeUpdateAction,
  resolveCanvasWheelZoomRequest,
  resolveCanvasWorldPoint,
  resolveCanvasZoomButtonAction,
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
      deltaY: -120,
      currentScale: 1,
      clientX: 120,
      clientY: 80,
      canvasRect: { left: 10, top: 20 },
      isCanvasEmpty: true,
    }),
    { type: "ignore" },
  );
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

test("canvas viewport interaction model resolves zoom button actions", () => {
  assert.deepEqual(resolveCanvasZoomButtonAction({ control: "zoom-out", currentScale: 1 }), {
    type: "zoom-around-center",
    nextScale: 0.9,
  });
  assert.deepEqual(resolveCanvasZoomButtonAction({ control: "zoom-in", currentScale: 1 }), {
    type: "zoom-around-center",
    nextScale: 1.1,
  });
  assert.deepEqual(resolveCanvasZoomButtonAction({ control: "zoom-out", currentScale: 0.42 }), {
    type: "zoom-around-center",
    nextScale: 0.4,
  });
  assert.deepEqual(resolveCanvasZoomButtonAction({ control: "zoom-in", currentScale: 2.16 }), {
    type: "zoom-around-center",
    nextScale: 2.2,
  });
  assert.deepEqual(resolveCanvasZoomButtonAction({ control: "reset", currentScale: 1.4 }), {
    type: "reset-viewport",
    viewport: { x: 0, y: 0, scale: 1 },
  });
});

test("canvas viewport interaction model resolves pan pointer-move actions", () => {
  assert.deepEqual(resolveCanvasPanPointerMoveAction({ isPanning: true, isCanvasEmpty: true }), {
    type: "continue-pointer-move",
  });
  assert.deepEqual(resolveCanvasPanPointerMoveAction({ isPanning: false }), {
    type: "continue-pointer-move",
  });
  assert.deepEqual(resolveCanvasPanPointerMoveAction({ isPanning: true }), {
    type: "schedule-pan-move",
  });
});

test("canvas viewport interaction model resolves canvas size update actions", () => {
  assert.deepEqual(
    resolveCanvasSizeUpdateAction({
      currentSize: { width: 100, height: 80 },
      nextSize: null,
    }),
    { type: "ignore-missing-element" },
  );
  assert.deepEqual(
    resolveCanvasSizeUpdateAction({
      currentSize: { width: 100, height: 80 },
      nextSize: { width: 100, height: 80 },
    }),
    { type: "ignore-unchanged-size" },
  );
  assert.deepEqual(
    resolveCanvasSizeUpdateAction({
      currentSize: { width: 100, height: 80 },
      nextSize: { width: 120, height: 90 },
    }),
    { type: "update-size", size: { width: 120, height: 90 } },
  );
});

test("canvas viewport interaction model keeps playback points inside the visible canvas margin", () => {
  assert.deepEqual(
    resolveCanvasViewportEnsurePointVisibleAction({
      worldPoint: { x: 240, y: 180 },
      viewport: { x: 0, y: 0, scale: 1 },
      canvasSize: { width: 800, height: 600 },
      margin: 96,
    }),
    { type: "keep-viewport" },
  );
  assert.deepEqual(
    resolveCanvasViewportEnsurePointVisibleAction({
      worldPoint: { x: 1200, y: 800 },
      viewport: { x: 0, y: 0, scale: 1 },
      canvasSize: { width: 800, height: 600 },
      margin: 96,
    }),
    {
      type: "set-viewport",
      viewport: { x: -496, y: -296, scale: 1 },
    },
  );
  assert.deepEqual(
    resolveCanvasViewportEnsurePointVisibleAction({
      worldPoint: { x: 100, y: 50 },
      viewport: { x: -500, y: -300, scale: 2 },
      canvasSize: { width: 800, height: 600 },
      margin: 96,
    }),
    {
      type: "set-viewport",
      viewport: { x: -104, y: -4, scale: 2 },
    },
  );
  assert.deepEqual(
    resolveCanvasViewportEnsurePointVisibleAction({
      worldPoint: { x: 100, y: 50 },
      viewport: { x: 0, y: 0, scale: 1 },
      canvasSize: { width: 0, height: 600 },
    }),
    { type: "ignore-missing-canvas-size" },
  );
});

test("canvas viewport interaction model resolves canvas world points", () => {
  assert.deepEqual(
    resolveCanvasWorldPoint({
      clientX: 100,
      clientY: 80,
      canvasRect: null,
      viewport: { x: 20, y: 30, scale: 2 },
      fallbackPoint: { x: 8, y: 9 },
    }),
    { x: 8, y: 9 },
  );
  assert.deepEqual(
    resolveCanvasWorldPoint({
      clientX: 100,
      clientY: 80,
      canvasRect: null,
      viewport: { x: 20, y: 30, scale: 2 },
      fallbackPoint: null,
    }),
    { x: 0, y: 0 },
  );
  assert.deepEqual(
    resolveCanvasWorldPoint({
      clientX: 210,
      clientY: 170,
      canvasRect: { left: 10, top: 20 },
      viewport: { x: 40, y: 30, scale: 2 },
      fallbackPoint: { x: 8, y: 9 },
    }),
    { x: 80, y: 60 },
  );
});

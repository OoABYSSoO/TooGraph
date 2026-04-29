import test from "node:test";
import assert from "node:assert/strict";

import { useCanvasNodeDragResize } from "./useCanvasNodeDragResize.ts";
import type { CanvasNodeDragState, CanvasNodeResizeDragState } from "./canvasNodeDragResizeModel.ts";

test("useCanvasNodeDragResize emits scaled node drag updates through the scheduler", () => {
  const scheduled: Array<() => void> = [];
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const captureElement = createCaptureElement();
  const controller = useCanvasNodeDragResize({
    viewportScale: () => 2,
    scheduleDragFrame: (callback) => scheduled.push(callback),
    emitNodePosition: (payload) => emitted.push({ event: "update:node-position", payload }),
    emitNodeSize: (payload) => emitted.push({ event: "update:node-size", payload }),
    timeoutScheduler: createPausedTimeoutScheduler(),
  });

  controller.startNodeDrag({
    nodeId: "agent",
    pointerId: 5,
    startClientX: 100,
    startClientY: 100,
    originX: 24,
    originY: 48,
    captureElement: captureElement as unknown as HTMLElement,
    moved: false,
  });

  const handled = controller.handleNodeDragResizePointerMove({ pointerId: 5, clientX: 140, clientY: 118 });

  assert.equal(handled, true);
  assert.equal(controller.nodeDrag.value?.moved, true);
  assert.deepEqual(captureElement.setPointerCaptureCalls, [5]);
  assert.deepEqual(emitted, []);

  scheduled[0]();

  assert.deepEqual(emitted, [
    {
      event: "update:node-position",
      payload: {
        nodeId: "agent",
        position: { x: 44, y: 57 },
      },
    },
  ]);
});

test("useCanvasNodeDragResize starts resize drags independently from active node drags", () => {
  const scheduled: Array<() => void> = [];
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const controller = useCanvasNodeDragResize({
    viewportScale: () => 2,
    scheduleDragFrame: (callback) => scheduled.push(callback),
    emitNodePosition: (payload) => emitted.push({ event: "update:node-position", payload }),
    emitNodeSize: (payload) => emitted.push({ event: "update:node-size", payload }),
    timeoutScheduler: createPausedTimeoutScheduler(),
  });

  controller.startNodeDrag(createDragState());
  controller.startNodeResizeDrag(createResizeState());

  assert.equal(controller.nodeDrag.value, null);
  assert.equal(controller.nodeResizeDrag.value?.nodeId, "agent");

  const handled = controller.handleNodeDragResizePointerMove({ pointerId: 7, clientX: 180, clientY: 160 });
  assert.equal(handled, true);

  scheduled[0]();

  assert.deepEqual(emitted, [
    {
      event: "update:node-size",
      payload: {
        nodeId: "agent",
        position: { x: 24, y: 48 },
        size: { width: 500, height: 350 },
      },
    },
  ]);
});

test("useCanvasNodeDragResize releases captures and suppresses residual clicks after moved drags", () => {
  const captureElement = createCaptureElement();
  const controller = useCanvasNodeDragResize({
    viewportScale: () => 1,
    scheduleDragFrame: () => undefined,
    emitNodePosition: () => undefined,
    emitNodeSize: () => undefined,
    timeoutScheduler: createPausedTimeoutScheduler(),
  });

  captureElement.captured.add(5);
  controller.startNodeDrag({
    ...createDragState(),
    captureElement: captureElement as unknown as HTMLElement,
    moved: true,
  });

  controller.releaseNodeDragResizePointerCapture(5);
  controller.finishNodeDragResizePointer(5);

  assert.deepEqual(captureElement.releasePointerCaptureCalls, [5]);
  assert.equal(controller.nodeDrag.value, null);
  assert.equal(controller.consumeSuppressedNodeClick("agent"), true);
  assert.equal(controller.consumeSuppressedNodeClick("agent"), false);
});

function createDragState(): CanvasNodeDragState {
  return {
    nodeId: "agent",
    pointerId: 5,
    startClientX: 100,
    startClientY: 100,
    originX: 24,
    originY: 48,
    captureElement: null,
    moved: false,
  };
}

function createResizeState(): CanvasNodeResizeDragState {
  return {
    nodeId: "agent",
    pointerId: 7,
    handle: "se",
    startClientX: 100,
    startClientY: 100,
    originPosition: { x: 24, y: 48 },
    originSize: { width: 460, height: 320 },
    captureElement: null,
    moved: false,
  };
}

function createCaptureElement() {
  return {
    captured: new Set<number>(),
    setPointerCaptureCalls: [] as number[],
    releasePointerCaptureCalls: [] as number[],
    hasPointerCapture(pointerId: number) {
      return this.captured.has(pointerId);
    },
    setPointerCapture(pointerId: number) {
      this.captured.add(pointerId);
      this.setPointerCaptureCalls.push(pointerId);
    },
    releasePointerCapture(pointerId: number) {
      this.captured.delete(pointerId);
      this.releasePointerCaptureCalls.push(pointerId);
    },
  };
}

function createPausedTimeoutScheduler() {
  return {
    setTimeout: () => 1,
    clearTimeout: () => undefined,
  };
}

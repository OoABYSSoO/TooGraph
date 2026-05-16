import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveNodePointerDownAction,
  resolveNodeResizePointerDownAction,
  resolveNodeDragMove,
  resolveNodeResizeDragMove,
  type CanvasNodeDragState,
  type CanvasNodeResizeDragState,
} from "./canvasNodeDragResizeModel.ts";

test("resolveNodePointerDownAction resolves node drag pointer-down routing", () => {
  const setupPolicy = {
    focusCanvas: true,
    preventDefault: true,
    setPointerCapture: true,
    clearCanvasTransientState: true,
    clearPendingConnection: true,
    cancelScheduledDragFrame: true,
    clearSelectedEdge: true,
    selectNodeId: "node-a",
  } as const;

  assert.deepEqual(
    resolveNodePointerDownAction({
      nodeId: "node-a",
      nodeExists: false,
      interactionLocked: false,
      preserveInlineEditorFocus: false,
    }),
    { type: "ignore-missing-node" },
  );
  assert.deepEqual(
    resolveNodePointerDownAction({
      nodeId: "node-a",
      nodeExists: true,
      interactionLocked: true,
      preserveInlineEditorFocus: false,
    }),
    {
      type: "locked-edit-attempt",
      preventDefault: true,
      focusCanvas: true,
      clearCanvasTransientState: true,
      selectNodeId: "node-a",
    },
  );
  assert.deepEqual(
    resolveNodePointerDownAction({
      nodeId: "node-a",
      nodeExists: true,
      interactionLocked: false,
      preserveInlineEditorFocus: false,
    }),
    {
      type: "start-drag",
      ...setupPolicy,
    },
  );
  assert.deepEqual(
    resolveNodePointerDownAction({
      nodeId: "node-a",
      nodeExists: true,
      interactionLocked: false,
      preserveInlineEditorFocus: true,
    }),
    {
      type: "start-drag",
      ...setupPolicy,
      focusCanvas: false,
      preventDefault: false,
      setPointerCapture: false,
    },
  );
  assert.deepEqual(
    resolveNodePointerDownAction({
      nodeId: "node-a",
      nodeExists: true,
      interactionLocked: false,
      preserveInlineEditorFocus: false,
      graphEditPlaybackRunning: true,
      isVirtualPointerEvent: false,
    }),
    {
      type: "ignore-graph-edit-playback",
      preventDefault: true,
    },
  );
  assert.deepEqual(
    resolveNodePointerDownAction({
      nodeId: "node-a",
      nodeExists: true,
      interactionLocked: false,
      preserveInlineEditorFocus: false,
      graphEditPlaybackRunning: true,
      isVirtualPointerEvent: true,
    }),
    {
      type: "start-drag",
      ...setupPolicy,
    },
  );
});

test("resolveNodeResizePointerDownAction resolves resize pointer-down routing", () => {
  const setupPolicy = {
    focusCanvas: true,
    setPointerCapture: true,
    clearCanvasTransientState: true,
    clearPendingConnection: true,
    cancelScheduledDragFrame: true,
    clearSelectedEdge: true,
    selectNodeId: "node-a",
  } as const;

  assert.deepEqual(
    resolveNodeResizePointerDownAction({
      nodeId: "node-a",
      nodeExists: false,
      interactionLocked: false,
      hasActiveConnection: false,
    }),
    { type: "ignore-missing-node" },
  );
  assert.deepEqual(
    resolveNodeResizePointerDownAction({
      nodeId: "node-a",
      nodeExists: true,
      interactionLocked: true,
      hasActiveConnection: false,
    }),
    {
      type: "locked-edit-attempt",
      preventDefault: true,
    },
  );
  assert.deepEqual(
    resolveNodeResizePointerDownAction({
      nodeId: "node-a",
      nodeExists: true,
      interactionLocked: false,
      hasActiveConnection: true,
    }),
    { type: "ignore-active-connection" },
  );
  assert.deepEqual(
    resolveNodeResizePointerDownAction({
      nodeId: "node-a",
      nodeExists: true,
      interactionLocked: false,
      hasActiveConnection: false,
    }),
    {
      type: "start-resize",
      ...setupPolicy,
    },
  );
  assert.deepEqual(
    resolveNodeResizePointerDownAction({
      nodeId: "node-a",
      nodeExists: true,
      interactionLocked: false,
      hasActiveConnection: false,
      graphEditPlaybackRunning: true,
      isVirtualPointerEvent: false,
    }),
    {
      type: "ignore-graph-edit-playback",
      preventDefault: true,
    },
  );
});

test("resolveNodeDragMove waits for the drag activation threshold", () => {
  const drag: CanvasNodeDragState = {
    nodeId: "node-a",
    pointerId: 7,
    startClientX: 100,
    startClientY: 100,
    originX: 24,
    originY: 48,
    captureElement: null,
    moved: false,
  };

  const result = resolveNodeDragMove({
    drag,
    pointer: { clientX: 102, clientY: 98 },
    viewportScale: 1,
  });

  assert.equal(result.activated, false);
  assert.equal(result.update, null);
  assert.equal(result.drag.moved, false);
});

test("resolveNodeDragMove projects pointer delta through viewport scale", () => {
  const drag: CanvasNodeDragState = {
    nodeId: "node-a",
    pointerId: 7,
    startClientX: 100,
    startClientY: 100,
    originX: 24,
    originY: 48,
    captureElement: null,
    moved: false,
  };

  const result = resolveNodeDragMove({
    drag,
    pointer: { clientX: 132, clientY: 115 },
    viewportScale: 2,
  });

  assert.equal(result.activated, true);
  assert.equal(result.drag.moved, true);
  assert.deepEqual(result.update, {
    nodeId: "node-a",
    position: { x: 40, y: 56 },
  });
});

test("resolveNodeResizeDragMove waits for the resize activation threshold", () => {
  const drag: CanvasNodeResizeDragState = {
    nodeId: "node-a",
    pointerId: 7,
    handle: "se",
    startClientX: 100,
    startClientY: 100,
    originPosition: { x: 24, y: 48 },
    originSize: { width: 460, height: 320 },
    captureElement: null,
    moved: false,
  };

  const result = resolveNodeResizeDragMove({
    drag,
    pointer: { clientX: 103, clientY: 101 },
    viewportScale: 1,
  });

  assert.equal(result.activated, false);
  assert.equal(result.update, null);
  assert.equal(result.drag.moved, false);
});

test("resolveNodeResizeDragMove delegates scaled deltas to node resize projection", () => {
  const drag: CanvasNodeResizeDragState = {
    nodeId: "node-a",
    pointerId: 7,
    handle: "se",
    startClientX: 100,
    startClientY: 100,
    originPosition: { x: 24, y: 48 },
    originSize: { width: 460, height: 320 },
    captureElement: null,
    moved: false,
  };

  const result = resolveNodeResizeDragMove({
    drag,
    pointer: { clientX: 180, clientY: 160 },
    viewportScale: 2,
  });

  assert.equal(result.activated, true);
  assert.equal(result.drag.moved, true);
  assert.deepEqual(result.update, {
    nodeId: "node-a",
    position: { x: 24, y: 48 },
    size: { width: 500, height: 350 },
  });
});

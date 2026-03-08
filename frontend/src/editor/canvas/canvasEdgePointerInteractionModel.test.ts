import test from "node:test";
import assert from "node:assert/strict";

import { resolveCanvasEdgePointerDownAction } from "./canvasEdgePointerInteractionModel.ts";

test("canvas edge pointer interaction model resolves edge pointer-down actions", () => {
  assert.deepEqual(
    resolveCanvasEdgePointerDownAction({
      interactionLocked: true,
      edge: { id: "data-edge", kind: "data" },
      selectedEdgeId: null,
    }),
    { type: "locked-edit-attempt", preventDefault: true },
  );

  assert.deepEqual(
    resolveCanvasEdgePointerDownAction({
      interactionLocked: false,
      edge: { id: "flow-edge", kind: "flow" },
      selectedEdgeId: null,
    }),
    {
      type: "start-flow-edge-delete-confirm",
      focusCanvas: true,
      clearCanvasTransientState: true,
      clearPendingConnection: true,
      clearSelectedEdge: true,
      clearSelection: true,
    },
  );

  assert.deepEqual(
    resolveCanvasEdgePointerDownAction({
      interactionLocked: false,
      edge: { id: "route-edge", kind: "route" },
      selectedEdgeId: null,
    }),
    {
      type: "start-flow-edge-delete-confirm",
      focusCanvas: true,
      clearCanvasTransientState: true,
      clearPendingConnection: true,
      clearSelectedEdge: true,
      clearSelection: true,
    },
  );

  assert.deepEqual(
    resolveCanvasEdgePointerDownAction({
      interactionLocked: false,
      edge: { id: "data-edge", kind: "data" },
      selectedEdgeId: null,
    }),
    {
      type: "start-data-edge-state-confirm",
      focusCanvas: true,
      clearCanvasTransientState: true,
      clearPendingConnection: true,
      clearSelectedEdge: true,
      clearSelection: true,
    },
  );

  assert.deepEqual(
    resolveCanvasEdgePointerDownAction({
      interactionLocked: false,
      edge: { id: "data-edge", kind: "data" },
      selectedEdgeId: "data-edge",
    }),
    {
      type: "start-data-edge-state-confirm",
      focusCanvas: true,
      clearCanvasTransientState: true,
      clearPendingConnection: true,
      clearSelectedEdge: true,
      clearSelection: true,
    },
  );

  assert.deepEqual(
    resolveCanvasEdgePointerDownAction({
      interactionLocked: false,
      edge: { id: "selectable-edge", kind: "auxiliary" },
      selectedEdgeId: "selectable-edge",
    }),
    {
      type: "clear-selected-edge",
      focusCanvas: true,
      clearCanvasTransientState: true,
      clearPendingConnection: true,
      clearSelectedEdge: true,
      clearPendingConnectionPoint: true,
      clearSelection: true,
    },
  );

  assert.deepEqual(
    resolveCanvasEdgePointerDownAction({
      interactionLocked: false,
      edge: { id: "selectable-edge", kind: "auxiliary" },
      selectedEdgeId: "other-edge",
    }),
    {
      type: "select-edge",
      focusCanvas: true,
      clearCanvasTransientState: true,
      clearPendingConnection: true,
      selectEdgeId: "selectable-edge",
      updatePendingConnectionPoint: true,
      clearSelection: true,
    },
  );
});

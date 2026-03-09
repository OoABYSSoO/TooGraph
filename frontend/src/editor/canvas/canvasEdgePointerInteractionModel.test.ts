import test from "node:test";
import assert from "node:assert/strict";

import { resolveCanvasEdgePointerDownAction, resolveCanvasEdgeTargetPoint } from "./canvasEdgePointerInteractionModel.ts";

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

test("canvas edge pointer interaction model resolves edge target points", () => {
  const anchors = [
    { nodeId: "agent-a", kind: "flow-in", x: 10, y: 20 },
    { nodeId: "agent-a", kind: "state-in", stateKey: "draft", x: 30, y: 40 },
    { nodeId: "agent-a", kind: "state-in", stateKey: "final", x: 50, y: 60 },
  ];

  assert.deepEqual(
    resolveCanvasEdgeTargetPoint({
      edge: { kind: "data", target: "agent-a", state: "final" },
      anchors,
    }),
    { x: 50, y: 60 },
  );
  assert.deepEqual(
    resolveCanvasEdgeTargetPoint({
      edge: { kind: "flow", target: "agent-a" },
      anchors,
    }),
    { x: 10, y: 20 },
  );
  assert.deepEqual(
    resolveCanvasEdgeTargetPoint({
      edge: { kind: "data", target: "agent-a", state: null },
      anchors,
    }),
    { x: 10, y: 20 },
  );
  assert.equal(
    resolveCanvasEdgeTargetPoint({
      edge: { kind: "data", target: "missing-node", state: "final" },
      anchors,
    }),
    null,
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import type { ProjectedCanvasEdge } from "./edgeProjection.ts";
import {
  buildDataEdgeId,
  buildDataEdgeStateConfirmFromEdge,
  buildDataEdgeStateEditorFromConfirm,
  buildDataEdgeStateEditorFromRequest,
  buildDataEdgeStateDisconnectPayload,
  buildFloatingCanvasPointStyle,
  isActiveDataEdge,
  isDataEdgeStateInteractionOpen,
  shouldOfferDataEdgeFlowDisconnect,
} from "./canvasDataEdgeStateModel.ts";

const dataEdge: ProjectedCanvasEdge = {
  id: "data:agent:answer->output",
  kind: "data",
  source: "agent",
  target: "output",
  state: "answer",
  path: "M 0 0 C 10 0 10 10 20 10",
};

test("data-edge state model builds stable data edge ids", () => {
  assert.equal(buildDataEdgeId("agent", "answer", "output"), "data:agent:answer->output");
});

test("data-edge state model builds floating point styles only when a target exists", () => {
  assert.deepEqual(buildFloatingCanvasPointStyle({ x: 120.5, y: 48 }), {
    left: "120.5px",
    top: "48px",
  });
  assert.equal(buildFloatingCanvasPointStyle(null), undefined);
  assert.equal(buildFloatingCanvasPointStyle(undefined), undefined);
});

test("data-edge state model projects data edges into confirm targets", () => {
  assert.deepEqual(buildDataEdgeStateConfirmFromEdge(dataEdge, { x: 32, y: 64 }), {
    id: "data:agent:answer->output",
    source: "agent",
    target: "output",
    stateKey: "answer",
    x: 32,
    y: 64,
  });

  assert.equal(
    buildDataEdgeStateConfirmFromEdge({ ...dataEdge, kind: "flow", state: undefined }, { x: 32, y: 64 }),
    null,
  );
  assert.equal(buildDataEdgeStateConfirmFromEdge({ ...dataEdge, state: undefined }, { x: 32, y: 64 }), null);
});

test("data-edge state model projects confirm and request values into editor targets", () => {
  const confirm = buildDataEdgeStateConfirmFromEdge(dataEdge, { x: 32, y: 64 });
  assert.ok(confirm);

  assert.deepEqual(buildDataEdgeStateEditorFromConfirm(confirm), {
    id: "data:agent:answer->output",
    source: "agent",
    target: "output",
    stateKey: "answer",
    mode: "edit",
    x: 32,
    y: 64,
  });
  assert.deepEqual(
    buildDataEdgeStateEditorFromRequest({
      sourceNodeId: "agent",
      targetNodeId: "output",
      stateKey: "answer",
      position: { x: 12, y: 18 },
    }),
    {
      id: "data:agent:answer->output",
      source: "agent",
      target: "output",
      stateKey: "answer",
      mode: "create",
      x: 12,
      y: 18,
    },
  );
});

test("data-edge state model matches active data-edge interactions", () => {
  const confirm = buildDataEdgeStateConfirmFromEdge(dataEdge, { x: 32, y: 64 });
  assert.ok(confirm);
  const editor = buildDataEdgeStateEditorFromConfirm(confirm);

  assert.equal(isActiveDataEdge(dataEdge, confirm), true);
  assert.equal(isActiveDataEdge({ ...dataEdge, target: "other" }, confirm), false);
  assert.equal(isActiveDataEdge({ ...dataEdge, kind: "route" }, confirm), false);
  assert.equal(isActiveDataEdge(dataEdge, null), false);
  assert.equal(isDataEdgeStateInteractionOpen(dataEdge, { confirm: null, editor }), true);
  assert.equal(isDataEdgeStateInteractionOpen({ ...dataEdge, state: "other" }, { confirm, editor }), false);
});

test("data-edge state model resolves disconnect availability and payloads", () => {
  const editor = buildDataEdgeStateEditorFromRequest({
    sourceNodeId: "agent",
    targetNodeId: "output",
    stateKey: "answer",
    position: { x: 12, y: 18 },
  });

  assert.equal(shouldOfferDataEdgeFlowDisconnect({ editor, canDisconnectFlow: () => true }), true);
  assert.equal(shouldOfferDataEdgeFlowDisconnect({ editor: null, canDisconnectFlow: () => true }), false);
  assert.equal(shouldOfferDataEdgeFlowDisconnect({ editor, canDisconnectFlow: () => false }), false);
  assert.deepEqual(buildDataEdgeStateDisconnectPayload(editor, "state"), {
    sourceNodeId: "agent",
    targetNodeId: "output",
    stateKey: "answer",
    mode: "state",
  });
  assert.deepEqual(buildDataEdgeStateDisconnectPayload(editor, "flow"), {
    sourceNodeId: "agent",
    targetNodeId: "output",
    stateKey: "answer",
    mode: "flow",
  });
  assert.equal(buildDataEdgeStateDisconnectPayload(null, "state"), null);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVirtualDragPoints,
  isGraphEditPlaybackDragStep,
  listGraphEditPlaybackNodeAffordanceIds,
  listGraphEditPlaybackPortStateKeys,
  normalizeVirtualText,
  resolveGraphEditPlaybackAnchorNodeId,
  resolveGraphEditPlaybackPositionClientPoint,
  resolveGraphEditPlaybackStepDelayMs,
  resolveGraphEditPlaybackViewportTransformValue,
  shouldForceGraphEditPlaybackEmptyCanvasDrop,
} from "./buddyGraphEditPlaybackUi.ts";

function makeStep(fields: Record<string, unknown>) {
  return fields as never;
}

function makeAffordanceRoot(ids: string[]) {
  return {
    querySelectorAll() {
      return ids.map((id) => ({ dataset: { virtualAffordanceId: id } }));
    },
  } as never;
}

test("graph edit playback UI helpers identify drag playback and empty canvas drops", () => {
  assert.equal(isGraphEditPlaybackDragStep(makeStep({ kind: "drag_state_edge_to_canvas" })), true);
  assert.equal(isGraphEditPlaybackDragStep(makeStep({ kind: "drag_state_edge_to_node" })), true);
  assert.equal(isGraphEditPlaybackDragStep(makeStep({ kind: "draw_flow_edge" })), true);
  assert.equal(isGraphEditPlaybackDragStep(makeStep({ kind: "click" })), false);

  assert.equal(shouldForceGraphEditPlaybackEmptyCanvasDrop(makeStep({
    kind: "drag_state_edge_to_canvas",
    position: { x: 10, y: 12 },
  })), true);
  assert.equal(shouldForceGraphEditPlaybackEmptyCanvasDrop(makeStep({
    kind: "draw_flow_edge",
    position: { x: 10, y: 12 },
    endTarget: "editor.canvas.empty.createFirstNode",
  })), true);
  assert.equal(shouldForceGraphEditPlaybackEmptyCanvasDrop(makeStep({
    kind: "draw_flow_edge",
    position: { x: 10, y: 12 },
    endTarget: "editor.canvas.node.a",
  })), false);
  assert.equal(shouldForceGraphEditPlaybackEmptyCanvasDrop(makeStep({
    kind: "drag_state_edge_to_node",
    position: { x: 10, y: 12 },
  })), false);
});

test("graph edit playback UI helpers build deterministic drag points", () => {
  assert.deepEqual(buildVirtualDragPoints({ x: 10, y: 20 }, { x: 20, y: 70 }), [
    { x: 12, y: 30 },
    { x: 14, y: 40 },
    { x: 16, y: 50 },
    { x: 18, y: 60 },
    { x: 20, y: 70 },
  ]);
});

test("graph edit playback UI helpers resolve canvas transform coordinates", () => {
  assert.deepEqual(resolveGraphEditPlaybackViewportTransformValue("none"), { x: 0, y: 0, scaleX: 1, scaleY: 1 });
  assert.deepEqual(resolveGraphEditPlaybackViewportTransformValue("matrix(2, 0, 0, 3, 12, 24)"), {
    x: 12,
    y: 24,
    scaleX: 2,
    scaleY: 3,
  });

  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    getComputedStyle() {
      return { transform: "matrix(2, 0, 0, 3, 10, 20)" };
    },
  };
  try {
    const viewport = {};
    const canvas = {
      querySelector() {
        return viewport;
      },
      getBoundingClientRect() {
        return { left: 100, top: 50 };
      },
    };
    assert.deepEqual(resolveGraphEditPlaybackPositionClientPoint(
      makeStep({ position: { x: 7, y: 4 } }),
      canvas as never,
    ), { x: 124, y: 82 });
    assert.equal(resolveGraphEditPlaybackPositionClientPoint(makeStep({ position: { x: "7", y: 4 } }), canvas as never), null);
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
  }
});

test("graph edit playback UI helpers scan affordance ids", () => {
  assert.equal(resolveGraphEditPlaybackAnchorNodeId("editor.canvas.anchor.node-a:source"), "node-a");
  assert.equal(resolveGraphEditPlaybackAnchorNodeId("editor.canvas.node.node-a"), "");

  const root = makeAffordanceRoot([
    "editor.canvas.node.node-a",
    "editor.canvas.node.node-b",
    "editor.canvas.node.node-b.port.input.query",
  ]);
  assert.deepEqual([...listGraphEditPlaybackNodeAffordanceIds(root)].sort(), ["node-a", "node-b"]);

  const playbackState = {
    nodeIdAliases: new Map([["planned-node", "real-node"]]),
    stateKeyAliases: new Map(),
  };
  const portRoot = makeAffordanceRoot([
    "editor.canvas.node.real-node.port.input.query",
    "editor.canvas.node.real-node.port.input.query.remove",
    "editor.canvas.node.real-node.port.input.create",
    "editor.canvas.node.real-node.port.input.deep.key",
    "editor.canvas.node.other.port.input.answer",
  ]);
  assert.deepEqual([...listGraphEditPlaybackPortStateKeys(
    makeStep({ nodeId: "planned-node", bindingMode: "read" }),
    playbackState as never,
    portRoot,
  )], ["query"]);
});

test("graph edit playback UI helpers normalize text and delay playback steps", () => {
  assert.equal(normalizeVirtualText("  hello\r\nworld  "), "hello\nworld");
  assert.equal(normalizeVirtualText(null), "");
  assert.equal(resolveGraphEditPlaybackStepDelayMs(makeStep({ kind: "apply_graph_command" })), 180);
  assert.equal(resolveGraphEditPlaybackStepDelayMs(makeStep({ kind: "type_node_field" })), 160);
  assert.equal(resolveGraphEditPlaybackStepDelayMs(makeStep({ kind: "click" })), 90);
});

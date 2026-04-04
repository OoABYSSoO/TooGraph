import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMinimapNodeModel,
  buildNodeCardSizeStyle,
  buildNodeTransformStyle,
  resolveFallbackNodeSize,
  resolveMinimapRunState,
  resolveNodeRenderedSize,
  type MeasuredNodeSize,
} from "./canvasNodePresentationModel.ts";
import type { GraphNode } from "../../types/node-system.ts";

function createNode(kind: GraphNode["kind"], size?: unknown): GraphNode {
  return {
    kind,
    ui: {
      position: { x: 24, y: 48 },
      size,
    },
  } as GraphNode;
}

test("buildNodeTransformStyle keeps node placement as a translate transform", () => {
  assert.deepEqual(buildNodeTransformStyle({ x: 12, y: 34 }), {
    transform: "translate(12px, 34px)",
  });
});

test("buildNodeCardSizeStyle uses normalized persisted node size variables", () => {
  assert.deepEqual(buildNodeCardSizeStyle(createNode("agent", { width: 512, height: 340 })), {
    "--node-card-width": "512px",
    "--node-card-min-height": "340px",
  });
  assert.deepEqual(buildNodeCardSizeStyle(createNode("condition")), {
    "--node-card-width": "560px",
    "--node-card-min-height": "280px",
  });
});

test("resolveFallbackNodeSize preserves fallback dimensions by node kind", () => {
  assert.deepEqual(resolveFallbackNodeSize(createNode("condition")), { width: 560, height: 280 });
  assert.deepEqual(resolveFallbackNodeSize(createNode("output")), { width: 460, height: 340 });
  assert.deepEqual(resolveFallbackNodeSize(createNode("input")), { width: 460, height: 320 });
  assert.deepEqual(resolveFallbackNodeSize(createNode("agent")), { width: 460, height: 360 });
});

test("resolveNodeRenderedSize prioritizes measured size, persisted size, then fallback size", () => {
  const measuredNodeSizes: Record<string, MeasuredNodeSize> = {
    measured: { width: 720, height: 410 },
  };

  assert.deepEqual(
    resolveNodeRenderedSize({
      nodeId: "measured",
      node: createNode("agent", { width: 500, height: 320 }),
      measuredNodeSizes,
    }),
    { width: 720, height: 410 },
  );
  assert.deepEqual(
    resolveNodeRenderedSize({
      nodeId: "stored",
      node: createNode("output", { width: 510, height: 345 }),
      measuredNodeSizes,
    }),
    { width: 510, height: 345 },
  );
  assert.deepEqual(
    resolveNodeRenderedSize({
      nodeId: "fallback",
      node: createNode("condition"),
      measuredNodeSizes,
    }),
    { width: 560, height: 280 },
  );
});

test("resolveMinimapRunState maps runtime statuses to minimap states", () => {
  assert.equal(resolveMinimapRunState("running"), "running");
  assert.equal(resolveMinimapRunState("resuming"), "running");
  assert.equal(resolveMinimapRunState("success"), "success");
  assert.equal(resolveMinimapRunState("completed"), "success");
  assert.equal(resolveMinimapRunState("paused"), "paused");
  assert.equal(resolveMinimapRunState("awaiting_human"), "paused");
  assert.equal(resolveMinimapRunState("failed"), "failed");
  assert.equal(resolveMinimapRunState("queued"), null);
  assert.equal(resolveMinimapRunState(undefined), null);
});

test("buildMinimapNodeModel combines position, size priority, selection, and run state", () => {
  assert.deepEqual(
    buildMinimapNodeModel({
      nodeId: "node-a",
      node: createNode("agent", { width: 510, height: 345 }),
      measuredNodeSizes: {},
      isSelected: true,
      runStatus: "completed",
    }),
    {
      id: "node-a",
      kind: "agent",
      x: 24,
      y: 48,
      width: 510,
      height: 345,
      selected: true,
      runState: "success",
    },
  );
});

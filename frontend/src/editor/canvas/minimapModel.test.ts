import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEditorMinimapModel,
  mapMinimapPointToWorld,
  resolveMinimapCenterViewAction,
  resolveViewportForMinimapCenter,
} from "./minimapModel.ts";

test("buildEditorMinimapModel maps graph nodes and viewport into minimap coordinates", () => {
  const model = buildEditorMinimapModel({
    width: 200,
    height: 100,
    fitRatio: 1,
    boundsPadding: 0,
    canvasSize: { width: 500, height: 250 },
    viewport: { x: -250, y: -125, scale: 1 },
    nodes: [
      { id: "input", kind: "input", x: 0, y: 0, width: 100, height: 100 },
      { id: "output", kind: "output", x: 900, y: 400, width: 100, height: 100 },
    ],
    edges: [
      { id: "flow:input->output", kind: "flow", path: "M 100 50 L 900 450" },
    ],
  });

  assert.ok(model);
  assert.equal(model.scale, 0.2);
  assert.deepEqual(model.bounds, { minX: 0, minY: 0, maxX: 1000, maxY: 500, width: 1000, height: 500 });
  assert.deepEqual(model.nodes[0], { id: "input", kind: "input", x: 0, y: 0, width: 20, height: 20 });
  assert.deepEqual(model.nodes[1], { id: "output", kind: "output", x: 180, y: 80, width: 20, height: 20 });
  assert.deepEqual(model.viewportRect, { x: 50, y: 25, width: 100, height: 50 });
  assert.equal(model.edges[0]?.transform, "translate(0 0) scale(0.2)");
});

test("buildEditorMinimapModel applies graph padding before fitting the minimap", () => {
  const model = buildEditorMinimapModel({
    width: 200,
    height: 200,
    fitRatio: 1,
    boundsPadding: 50,
    canvasSize: { width: 100, height: 100 },
    viewport: { x: 0, y: 0, scale: 1 },
    nodes: [{ id: "node", kind: "agent", x: 100, y: 100, width: 100, height: 100 }],
    edges: [],
  });

  assert.ok(model);
  assert.deepEqual(model.bounds, { minX: 50, minY: 50, maxX: 250, maxY: 250, width: 200, height: 200 });
  assert.deepEqual(model.nodes[0], { id: "node", kind: "agent", x: 50, y: 50, width: 100, height: 100 });
});

test("mapMinimapPointToWorld and resolveViewportForMinimapCenter keep minimap drag math deterministic", () => {
  const model = buildEditorMinimapModel({
    width: 200,
    height: 100,
    fitRatio: 1,
    boundsPadding: 0,
    canvasSize: { width: 500, height: 250 },
    viewport: { x: 0, y: 0, scale: 2 },
    nodes: [{ id: "node", kind: "agent", x: 0, y: 0, width: 1000, height: 500 }],
    edges: [],
  });

  assert.ok(model);
  const worldPoint = mapMinimapPointToWorld(model, { x: 100, y: 50 });
  assert.deepEqual(worldPoint, { x: 500, y: 250 });

  assert.deepEqual(
    resolveViewportForMinimapCenter({
      worldX: worldPoint.x,
      worldY: worldPoint.y,
      viewportScale: 2,
      canvasWidth: 500,
      canvasHeight: 250,
    }),
    { x: -750, y: -375, scale: 2 },
  );
});

test("resolveMinimapCenterViewAction ignores empty canvas sizes and projects centered viewports", () => {
  assert.deepEqual(
    resolveMinimapCenterViewAction({
      worldX: 500,
      worldY: 250,
      viewportScale: 2,
      canvasSize: { width: 0, height: 250 },
    }),
    { type: "ignore-empty-canvas-size" },
  );
  assert.deepEqual(
    resolveMinimapCenterViewAction({
      worldX: 500,
      worldY: 250,
      viewportScale: 2,
      canvasSize: { width: 500, height: 250 },
    }),
    {
      type: "set-viewport",
      viewport: { x: -750, y: -375, scale: 2 },
    },
  );
});

test("buildEditorMinimapModel returns null when the graph has no renderable nodes", () => {
  assert.equal(
    buildEditorMinimapModel({
      width: 200,
      height: 100,
      canvasSize: { width: 500, height: 250 },
      viewport: { x: 0, y: 0, scale: 1 },
      nodes: [],
      edges: [],
    }),
    null,
  );
});

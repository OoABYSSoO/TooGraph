import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveFocusedNodeViewportAction,
  resolveFocusedViewport,
} from "./focusNodeViewport.ts";

test("resolveFocusedViewport centers node and raises zoom floor", () => {
  const viewport = resolveFocusedViewport({
    currentScale: 0.6,
    canvasWidth: 1200,
    canvasHeight: 800,
    nodeX: 400,
    nodeY: 200,
    nodeWidth: 460,
    nodeHeight: 260,
  });

  assert.equal(viewport.scale, 0.95);
  assert.equal(viewport.x, 1200 / 2 - (400 + 460 / 2) * 0.95);
  assert.equal(viewport.y, 800 / 2 - (200 + 260 / 2) * 0.95);
});

test("resolveFocusedViewport preserves larger existing zoom", () => {
  const viewport = resolveFocusedViewport({
    currentScale: 1.4,
    canvasWidth: 1200,
    canvasHeight: 800,
    nodeX: 100,
    nodeY: 150,
    nodeWidth: 300,
    nodeHeight: 200,
  });

  assert.equal(viewport.scale, 1.4);
  assert.equal(viewport.x, 1200 / 2 - (100 + 300 / 2) * 1.4);
  assert.equal(viewport.y, 800 / 2 - (150 + 200 / 2) * 1.4);
});

test("resolveFocusedNodeViewportAction ignores missing focus targets and projects viewports", () => {
  assert.deepEqual(
    resolveFocusedNodeViewportAction({
      currentScale: 1,
      canvasSize: null,
      nodePosition: { x: 100, y: 150 },
      nodeSize: { width: 300, height: 200 },
    }),
    { type: "ignore-missing-target" },
  );
  assert.deepEqual(
    resolveFocusedNodeViewportAction({
      currentScale: 0.6,
      canvasSize: { width: 1200, height: 800 },
      nodePosition: { x: 400, y: 200 },
      nodeSize: { width: 460, height: 260 },
    }),
    {
      type: "set-viewport",
      viewport: {
        scale: 0.95,
        x: 1200 / 2 - (400 + 460 / 2) * 0.95,
        y: 800 / 2 - (200 + 260 / 2) * 0.95,
      },
    },
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_NODE_RESIZE_HEIGHT,
  MAX_NODE_RESIZE_WIDTH,
  MIN_NODE_RESIZE_HEIGHT,
  MIN_NODE_RESIZE_WIDTH,
  normalizeNodeSize,
  resolveNodeResize,
} from "./nodeResize.ts";

test("resolveNodeResize grows the south-east corner without moving the node", () => {
  const result = resolveNodeResize({
    handle: "se",
    originPosition: { x: 120, y: 80 },
    originSize: { width: 460, height: 320 },
    deltaX: 90,
    deltaY: 40,
  });

  assert.deepEqual(result, {
    position: { x: 120, y: 80 },
    size: { width: 550, height: 360 },
  });
});

test("resolveNodeResize keeps the opposite corner fixed for north-west resizing", () => {
  const result = resolveNodeResize({
    handle: "nw",
    originPosition: { x: 120, y: 80 },
    originSize: { width: 460, height: 320 },
    deltaX: 60,
    deltaY: 30,
  });

  assert.deepEqual(result, {
    position: { x: 180, y: 110 },
    size: { width: 400, height: 290 },
  });
});

test("resolveNodeResize clamps node size while preserving the fixed corner", () => {
  const minimumResult = resolveNodeResize({
    handle: "nw",
    originPosition: { x: 120, y: 80 },
    originSize: { width: 460, height: 320 },
    deltaX: 999,
    deltaY: 999,
  });

  assert.deepEqual(minimumResult, {
    position: { x: 120 + 460 - MIN_NODE_RESIZE_WIDTH, y: 80 + 320 - MIN_NODE_RESIZE_HEIGHT },
    size: { width: MIN_NODE_RESIZE_WIDTH, height: MIN_NODE_RESIZE_HEIGHT },
  });

  const maximumResult = resolveNodeResize({
    handle: "se",
    originPosition: { x: 120, y: 80 },
    originSize: { width: 460, height: 320 },
    deltaX: 9999,
    deltaY: 9999,
  });

  assert.deepEqual(maximumResult, {
    position: { x: 120, y: 80 },
    size: { width: MAX_NODE_RESIZE_WIDTH, height: MAX_NODE_RESIZE_HEIGHT },
  });
});

test("normalizeNodeSize accepts finite positive dimensions only", () => {
  assert.deepEqual(normalizeNodeSize({ width: 512.4, height: 333.6 }), { width: 512, height: 334 });
  assert.equal(normalizeNodeSize({ width: 0, height: 333 }), null);
  assert.equal(normalizeNodeSize({ width: 512, height: Number.NaN }), null);
  assert.equal(normalizeNodeSize(null), null);
});

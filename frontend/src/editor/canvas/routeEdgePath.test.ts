import assert from "node:assert/strict";
import test from "node:test";

import { buildRouteEdgePath, buildRouteEdgeWaypoints, resolveRouteEdgeSourceOffset } from "./routeEdgePath.ts";

test("resolveRouteEdgeSourceOffset matches legacy branch spacing", () => {
  assert.equal(resolveRouteEdgeSourceOffset(0), 28);
  assert.equal(resolveRouteEdgeSourceOffset(1), 46);
  assert.equal(resolveRouteEdgeSourceOffset(3), 82);
});

test("buildRouteEdgeWaypoints keeps a shared lane when source and target are close", () => {
  assert.deepEqual(
    buildRouteEdgeWaypoints({
      sourceX: 100,
      sourceY: 200,
      targetX: 320,
      targetY: 214,
    }),
    [
      { x: 100, y: 200 },
      { x: 320, y: 200 },
      { x: 320, y: 214 },
    ],
  );
});

test("buildRouteEdgeWaypoints lifts the route into a dedicated lane when target is lower", () => {
  assert.deepEqual(
    buildRouteEdgeWaypoints({
      sourceX: 100,
      sourceY: 200,
      targetX: 360,
      targetY: 340,
      sourceOffset: resolveRouteEdgeSourceOffset(2),
    }),
    [
      { x: 100, y: 200 },
      { x: 164, y: 200 },
      { x: 164, y: 312 },
      { x: 360, y: 312 },
      { x: 360, y: 340 },
    ],
  );
});

test("buildRouteEdgePath creates a rounded orthogonal path", () => {
  const path = buildRouteEdgePath({
    sourceX: 100,
    sourceY: 200,
    targetX: 360,
    targetY: 340,
    sourceOffset: resolveRouteEdgeSourceOffset(2),
  });

  assert.match(path, /^M 100 200/);
  assert.match(path, /Q 164 200 164 214/);
  assert.match(path, /Q 164 312 178 312/);
  assert.match(path, /Q 360 312 360 326/);
  assert.match(path, /L 360 340$/);
});

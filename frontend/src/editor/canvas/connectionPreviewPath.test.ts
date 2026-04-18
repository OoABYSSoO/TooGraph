import assert from "node:assert/strict";
import test from "node:test";

import { buildPendingConnectionPreviewPath } from "./connectionPreviewPath.ts";
import { buildRouteEdgePath, resolveRouteEdgeSourceOffset } from "./routeEdgePath.ts";

test("buildPendingConnectionPreviewPath builds an orthogonal flow preview", () => {
  const path = buildPendingConnectionPreviewPath({
    kind: "flow-out",
    sourceX: 100,
    sourceY: 120,
    targetX: 280,
    targetY: 240,
  });

  assert.equal(path, "M 100 120 L 190 120 L 190 240 L 280 240");
});

test("buildPendingConnectionPreviewPath reuses legacy route geometry for route previews", () => {
  const path = buildPendingConnectionPreviewPath({
    kind: "route-out",
    sourceX: 460,
    sourceY: 310,
    targetX: 980,
    targetY: 180,
    routeSourceIndex: 1,
  });

  assert.equal(
    path,
    buildRouteEdgePath({
      sourceX: 460,
      sourceY: 310,
      targetX: 980,
      targetY: 180,
      sourceOffset: resolveRouteEdgeSourceOffset(1),
    }),
  );
});

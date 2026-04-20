import assert from "node:assert/strict";
import test from "node:test";

import { buildPendingConnectionPreviewPath } from "./connectionPreviewPath.ts";
import { buildConnectorCurvePath } from "./connectionCurvePath.ts";
import { buildSequenceFlowPath } from "./flowEdgePath.ts";

test("buildPendingConnectionPreviewPath uses the sequence-flow bezier preview for downstream flow and route drags", () => {
  const path = buildPendingConnectionPreviewPath({
    kind: "flow-out",
    sourceX: 100,
    sourceY: 120,
    targetX: 280,
    targetY: 240,
  });

  const routePath = buildPendingConnectionPreviewPath({
    kind: "route-out",
    sourceX: 100,
    sourceY: 120,
    targetX: 280,
    targetY: 240,
  });

  const expectedPath = buildSequenceFlowPath({
    sourceX: 100,
    sourceY: 120,
    targetX: 280,
    targetY: 240,
  });

  assert.equal(path, expectedPath);
  assert.equal(routePath, expectedPath);
});

test("buildPendingConnectionPreviewPath uses the upstream flow path for flow and route drags", () => {
  const input = {
    sourceX: 500,
    sourceY: 220,
    targetX: 200,
    targetY: 180,
  };

  assert.equal(buildPendingConnectionPreviewPath({ kind: "flow-out", ...input }), buildSequenceFlowPath(input));
  assert.equal(buildPendingConnectionPreviewPath({ kind: "route-out", ...input }), buildSequenceFlowPath(input));
});

test("buildPendingConnectionPreviewPath keeps data previews as state curves", () => {
  assert.equal(
    buildPendingConnectionPreviewPath({
      kind: "state-out",
      sourceX: 500,
      sourceY: 220,
      targetX: 200,
      targetY: 180,
    }),
    buildConnectorCurvePath({
      sourceX: 500,
      sourceY: 220,
      targetX: 200,
      targetY: 180,
      sourceSide: "right",
      targetSide: "left",
    }),
  );
});

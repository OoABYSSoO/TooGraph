import assert from "node:assert/strict";
import test from "node:test";

import { buildConnectorCurvePath } from "./connectionCurvePath.ts";
import { buildSequenceFlowPath } from "./flowEdgePath.ts";

test("buildSequenceFlowPath keeps the current curve when the target is downstream on the right", () => {
  assert.equal(
    buildSequenceFlowPath({
      sourceX: 100,
      sourceY: 120,
      targetX: 280,
      targetY: 240,
    }),
    buildConnectorCurvePath({
      sourceX: 100,
      sourceY: 120,
      targetX: 280,
      targetY: 240,
      sourceSide: "right",
      targetSide: "left",
    }),
  );
});

test("buildSequenceFlowPath uses node positions to avoid misrouting close downstream cards", () => {
  assert.equal(
    buildSequenceFlowPath({
      sourceX: 534,
      sourceY: 254,
      targetX: 526,
      targetY: 254,
      sourceNodeX: 80,
      targetNodeX: 520,
    }),
    buildConnectorCurvePath({
      sourceX: 534,
      sourceY: 254,
      targetX: 526,
      targetY: 254,
      sourceSide: "right",
      targetSide: "left",
    }),
  );
});

test("buildSequenceFlowPath routes upstream targets over the nodes with rounded corners", () => {
  assert.equal(
    buildSequenceFlowPath({
      sourceX: 500,
      sourceY: 220,
      targetX: 200,
      targetY: 180,
    }),
    [
      "M 500 220",
      "L 554 220",
      "Q 572 220 572 202",
      "L 572 38",
      "Q 572 20 554 20",
      "L 146 20",
      "Q 128 20 128 38",
      "L 128 162",
      "Q 128 180 146 180",
      "L 200 180",
    ].join(" "),
  );
});

test("buildSequenceFlowPath places upstream rails above measured node tops when available", () => {
  assert.equal(
    buildSequenceFlowPath({
      sourceX: 500,
      sourceY: 260,
      targetX: 200,
      targetY: 240,
      sourceNodeX: 500,
      sourceNodeY: 220,
      targetNodeX: 200,
      targetNodeY: 180,
    }),
    [
      "M 500 260",
      "L 554 260",
      "Q 572 260 572 242",
      "L 572 150",
      "Q 572 132 554 132",
      "L 146 132",
      "Q 128 132 128 150",
      "L 128 222",
      "Q 128 240 146 240",
      "L 200 240",
    ].join(" "),
  );
});

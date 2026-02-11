import assert from "node:assert/strict";
import test from "node:test";

import { buildSequenceFlowPath } from "./flowEdgePath.ts";

test("buildSequenceFlowPath keeps downstream targets on a bezier middle segment with only short shared leads", () => {
  assert.equal(
    buildSequenceFlowPath({
      sourceX: 100,
      sourceY: 120,
      targetX: 280,
      targetY: 240,
    }),
    "M 100 120 L 128 120 C 167.68 120 212.32 240 252 240 L 280 240",
  );
});

test("buildSequenceFlowPath uses node positions to avoid misrouting close downstream cards", () => {
  assert.match(
    buildSequenceFlowPath({
      sourceX: 534,
      sourceY: 254,
      targetX: 526,
      targetY: 254,
      sourceNodeX: 80,
      targetNodeX: 520,
    }),
    /^M 534 254(?: L .*?)? C .*$/,
  );
});

test("buildSequenceFlowPath fans downstream sibling lines into separate bezier lanes", () => {
  assert.equal(
    buildSequenceFlowPath({
      sourceX: 100,
      sourceY: 120,
      targetX: 280,
      targetY: 240,
      sourceLaneIndex: 0,
      sourceLaneCount: 2,
      targetLaneIndex: 2,
      targetLaneCount: 3,
    }),
    "M 100 120 L 128 120 C 167.68 106 212.32 268 252 240 L 280 240",
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
      "L 528 220",
      "L 554 220",
      "Q 572 220 572 202",
      "L 572 38",
      "Q 572 20 554 20",
      "L 146 20",
      "Q 128 20 128 38",
      "L 128 162",
      "Q 128 180 146 180",
      "L 172 180",
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
      "L 528 260",
      "L 554 260",
      "Q 572 260 572 242",
      "L 572 150",
      "Q 572 132 554 132",
      "L 146 132",
      "Q 128 132 128 150",
      "L 128 222",
      "Q 128 240 146 240",
      "L 172 240",
      "L 200 240",
    ].join(" "),
  );
});

test("buildSequenceFlowPath staggers upstream source exits and target entries before the shared short leads", () => {
  assert.equal(
    buildSequenceFlowPath({
      sourceX: 500,
      sourceY: 220,
      targetX: 200,
      targetY: 180,
      sourceLaneIndex: 1,
      sourceLaneCount: 2,
      targetLaneIndex: 1,
      targetLaneCount: 2,
    }),
    [
      "M 500 220",
      "L 528 220",
      "L 568 220",
      "Q 586 220 586 202",
      "L 586 38",
      "Q 586 20 568 20",
      "L 132 20",
      "Q 114 20 114 38",
      "L 114 162",
      "Q 114 180 132 180",
      "L 172 180",
      "L 200 180",
    ].join(" "),
  );
});

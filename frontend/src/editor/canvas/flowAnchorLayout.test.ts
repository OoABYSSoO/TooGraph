import test from "node:test";
import assert from "node:assert/strict";

import { resolveFlowAnchorOffset } from "./flowAnchorLayout.ts";

test("resolveFlowAnchorOffset places side flow anchors on the vertical middle of the node edge", () => {
  assert.deepEqual(
    resolveFlowAnchorOffset({
      side: "right",
      width: 460,
      height: 220,
    }),
    {
      offsetX: 460,
      offsetY: 110,
    },
  );

  assert.deepEqual(
    resolveFlowAnchorOffset({
      side: "left",
      width: 460,
      height: 220,
    }),
    {
      offsetX: 0,
      offsetY: 110,
    },
  );
});

test("resolveFlowAnchorOffset supports top-edge flow entry for condition nodes", () => {
  assert.deepEqual(
    resolveFlowAnchorOffset({
      side: "top",
      width: 460,
      height: 260,
    }),
    {
      offsetX: 230,
      offsetY: 0,
    },
  );
});

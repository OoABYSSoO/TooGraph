import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCanvasViewportStyle,
  buildZoomPercentLabel,
} from "./canvasViewportDisplayModel.ts";

test("canvas viewport display model builds transform style and zoom label", () => {
  assert.deepEqual(buildCanvasViewportStyle({ x: 12, y: -8, scale: 1.25 }), {
    transform: "translate(12px, -8px) scale(1.25)",
  });
  assert.equal(buildZoomPercentLabel(1), "100%");
  assert.equal(buildZoomPercentLabel(1.256), "126%");
});

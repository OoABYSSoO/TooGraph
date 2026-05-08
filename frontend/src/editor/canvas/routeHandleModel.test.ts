import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFlowOutHotspotStyle,
  buildRouteHandleStyle,
  resolveRouteHandlePalette,
  resolveRouteHandleTone,
} from "./routeHandleModel.ts";

test("resolveRouteHandleTone maps condition branches to stable tones", () => {
  assert.equal(resolveRouteHandleTone("true"), "success");
  assert.equal(resolveRouteHandleTone(" TRUE "), "success");
  assert.equal(resolveRouteHandleTone("false"), "danger");
  assert.equal(resolveRouteHandleTone("exhausted"), "neutral");
  assert.equal(resolveRouteHandleTone("exausted"), "neutral");
  assert.equal(resolveRouteHandleTone("maybe"), "warning");
  assert.equal(resolveRouteHandleTone(undefined), "warning");
});

test("resolveRouteHandlePalette preserves route handle colors", () => {
  assert.equal(resolveRouteHandlePalette("true").accent, "#16a34a");
  assert.equal(resolveRouteHandlePalette("false").accent, "#dc2626");
  assert.equal(resolveRouteHandlePalette("exhausted").accent, "#78716c");
  assert.equal(resolveRouteHandlePalette("other").accent, "#d97706");
});

test("buildFlowOutHotspotStyle keeps the right-side hotspot geometry", () => {
  assert.deepEqual(buildFlowOutHotspotStyle({ x: 100, y: 200 }), {
    left: "126px",
    top: "200px",
    width: "60px",
    height: "94px",
  });
});

test("buildRouteHandleStyle keeps route handles as close to the node as normal flow handles", () => {
  assert.deepEqual(buildRouteHandleStyle({ x: 100, y: 200, branch: "false" }), {
    left: "126px",
    top: "200px",
    width: "44px",
    height: "56px",
    "--editor-flow-handle-fill": "rgba(254, 242, 242, 0.98)",
    "--editor-flow-handle-border": "rgba(239, 68, 68, 0.24)",
    "--editor-flow-handle-accent": "#dc2626",
    "--editor-flow-handle-glow": "rgba(239, 68, 68, 0.18)",
  });
});

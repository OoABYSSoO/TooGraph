import assert from "node:assert/strict";
import test from "node:test";

import {
  ROUTE_TARGET_HANDLE,
  canNodeAcceptRouteTarget,
  classifyEditorConnection,
  resolveRouteTargetHandle,
} from "./node-system-route-handles.ts";

test("condition outputs are always treated as route connections", () => {
  assert.equal(classifyEditorConnection("condition", "agent", "input:question"), "route");
  assert.equal(classifyEditorConnection("condition", "output", ROUTE_TARGET_HANDLE), "route");
  assert.equal(resolveRouteTargetHandle("condition", "input:question"), ROUTE_TARGET_HANDLE);
});

test("non-condition outputs cannot target the route handle", () => {
  assert.equal(classifyEditorConnection("agent", "agent", ROUTE_TARGET_HANDLE), "invalid");
  assert.equal(classifyEditorConnection("input", "output", ROUTE_TARGET_HANDLE), "invalid");
});

test("regular data connections keep their requested input handle", () => {
  assert.equal(classifyEditorConnection("agent", "agent", "input:question"), "data");
  assert.equal(resolveRouteTargetHandle("agent", "input:question"), "input:question");
});

test("condition outputs cannot route directly into another condition node", () => {
  assert.equal(classifyEditorConnection("condition", "condition", ROUTE_TARGET_HANDLE), "invalid");
  assert.equal(canNodeAcceptRouteTarget("condition"), false);
  assert.equal(canNodeAcceptRouteTarget("agent"), true);
  assert.equal(canNodeAcceptRouteTarget("output"), true);
});

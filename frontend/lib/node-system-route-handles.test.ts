import assert from "node:assert/strict";
import test from "node:test";

import {
  FLOW_SOURCE_HANDLE,
  FLOW_TARGET_HANDLE,
  ROUTE_TARGET_HANDLE,
  canNodeAcceptFlowTarget,
  canNodeAcceptRouteTarget,
  classifyEditorConnection,
  resolveFlowTargetHandle,
  resolveRouteTargetHandle,
} from "./node-system-route-handles.ts";

test("condition branch outputs always route into the shared flow target handle", () => {
  assert.equal(classifyEditorConnection("condition", "output:continue", "agent", FLOW_TARGET_HANDLE), "route");
  assert.equal(classifyEditorConnection("condition", "output:continue", "output", FLOW_TARGET_HANDLE), "route");
  assert.equal(resolveRouteTargetHandle("condition", "agent", "input:question"), FLOW_TARGET_HANDLE);
});

test("title-row flow outputs create editable control-flow connections", () => {
  assert.equal(classifyEditorConnection("agent", FLOW_SOURCE_HANDLE, "agent", FLOW_TARGET_HANDLE), "flow");
  assert.equal(classifyEditorConnection("input", FLOW_SOURCE_HANDLE, "output", FLOW_TARGET_HANDLE), "flow");
  assert.equal(classifyEditorConnection("agent", FLOW_SOURCE_HANDLE, "condition", ROUTE_TARGET_HANDLE), "flow");
  assert.equal(resolveFlowTargetHandle("agent", FLOW_SOURCE_HANDLE, "agent", "input:question"), FLOW_TARGET_HANDLE);
  assert.equal(resolveFlowTargetHandle("agent", FLOW_SOURCE_HANDLE, "condition", "input:question"), ROUTE_TARGET_HANDLE);
});

test("non-flow outputs cannot target the shared flow input handle", () => {
  assert.equal(classifyEditorConnection("agent", "output:answer", "agent", FLOW_TARGET_HANDLE), "invalid");
  assert.equal(classifyEditorConnection("input", "output:question", "output", FLOW_TARGET_HANDLE), "invalid");
});

test("state-binding connections keep their requested side handles", () => {
  assert.equal(classifyEditorConnection("agent", "output:answer", "agent", "input:question"), "data");
  assert.equal(resolveFlowTargetHandle("agent", "output:answer", "agent", "input:question"), "input:question");
});

test("condition branches still cannot route directly into another condition node, while ordinary flow can", () => {
  assert.equal(classifyEditorConnection("condition", "output:continue", "condition", ROUTE_TARGET_HANDLE), "invalid");
  assert.equal(canNodeAcceptRouteTarget("condition"), false);
  assert.equal(canNodeAcceptRouteTarget("agent"), true);
  assert.equal(canNodeAcceptRouteTarget("output"), true);
  assert.equal(canNodeAcceptFlowTarget("agent", "condition"), true);
});

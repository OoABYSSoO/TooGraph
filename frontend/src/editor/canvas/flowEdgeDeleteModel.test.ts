import test from "node:test";
import assert from "node:assert/strict";

import type { ProjectedCanvasEdge } from "./edgeProjection.ts";
import {
  buildFlowEdgeDeleteConfirmFromEdge,
  buildFlowEdgeDeleteConfirmStyle,
  isFlowEdgeDeleteConfirmActive,
  resolveFlowEdgeDeleteAction,
  resolveFlowEdgeDeleteActionFromEdge,
} from "./flowEdgeDeleteModel.ts";

const flowEdge: ProjectedCanvasEdge = {
  id: "flow:source->target",
  kind: "flow",
  source: "source",
  target: "target",
  path: "M 0 0 C 10 0 10 10 20 10",
};

const routeEdge: ProjectedCanvasEdge = {
  id: "route:condition:pass->target",
  kind: "route",
  source: "condition",
  target: "target",
  branch: "pass",
  path: "M 0 0 C 10 0 10 10 20 10",
};

const dataEdge: ProjectedCanvasEdge = {
  id: "data:source:answer->target",
  kind: "data",
  source: "source",
  target: "target",
  state: "answer",
  path: "M 0 0 C 10 0 10 10 20 10",
};

test("flow edge delete model projects flow and route edges into confirm targets", () => {
  assert.deepEqual(buildFlowEdgeDeleteConfirmFromEdge(flowEdge, { x: 24, y: 48 }), {
    id: "flow:source->target",
    kind: "flow",
    source: "source",
    target: "target",
    x: 24,
    y: 48,
  });
  assert.deepEqual(buildFlowEdgeDeleteConfirmFromEdge(routeEdge, { x: 32, y: 64 }), {
    id: "route:condition:pass->target",
    kind: "route",
    source: "condition",
    target: "target",
    branch: "pass",
    x: 32,
    y: 64,
  });
  assert.equal(buildFlowEdgeDeleteConfirmFromEdge(dataEdge, { x: 24, y: 48 }), null);
});

test("flow edge delete model builds floating confirm styles and active checks", () => {
  const confirm = buildFlowEdgeDeleteConfirmFromEdge(flowEdge, { x: 24, y: 48 });
  assert.ok(confirm);

  assert.deepEqual(buildFlowEdgeDeleteConfirmStyle(confirm), {
    left: "24px",
    top: "48px",
  });
  assert.equal(buildFlowEdgeDeleteConfirmStyle(null), undefined);
  assert.equal(isFlowEdgeDeleteConfirmActive(confirm, "flow:source->target"), true);
  assert.equal(isFlowEdgeDeleteConfirmActive(confirm, "other"), false);
  assert.equal(isFlowEdgeDeleteConfirmActive(null, "flow:source->target"), false);
});

test("flow edge delete model resolves route and flow delete actions", () => {
  assert.deepEqual(resolveFlowEdgeDeleteAction(buildFlowEdgeDeleteConfirmFromEdge(routeEdge, { x: 32, y: 64 })), {
    kind: "route",
    sourceNodeId: "condition",
    branchKey: "pass",
  });
  assert.deepEqual(resolveFlowEdgeDeleteAction(buildFlowEdgeDeleteConfirmFromEdge(flowEdge, { x: 24, y: 48 })), {
    kind: "flow",
    sourceNodeId: "source",
    targetNodeId: "target",
  });
  assert.deepEqual(resolveFlowEdgeDeleteAction({ ...buildFlowEdgeDeleteConfirmFromEdge(routeEdge, { x: 32, y: 64 })!, branch: undefined }), {
    kind: "flow",
    sourceNodeId: "condition",
    targetNodeId: "target",
  });
  assert.equal(resolveFlowEdgeDeleteAction(null), null);
});

test("flow edge delete model resolves keyboard delete actions from projected edges", () => {
  assert.deepEqual(resolveFlowEdgeDeleteActionFromEdge(routeEdge), {
    kind: "route",
    sourceNodeId: "condition",
    branchKey: "pass",
  });
  assert.deepEqual(resolveFlowEdgeDeleteActionFromEdge(flowEdge), {
    kind: "flow",
    sourceNodeId: "source",
    targetNodeId: "target",
  });
  assert.equal(resolveFlowEdgeDeleteActionFromEdge(dataEdge), null);
  assert.equal(resolveFlowEdgeDeleteActionFromEdge({ ...routeEdge, branch: undefined }), null);
});

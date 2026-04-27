import test from "node:test";
import assert from "node:assert/strict";

import {
  EDGE_VISIBILITY_MODE_OPTIONS,
  filterProjectedEdgesForVisibilityMode,
  isOutputFlowHandleVisibleForEdgeMode,
  type EdgeVisibilityMode,
} from "./edgeVisibilityModel.ts";
import type { ProjectedCanvasEdge } from "./edgeProjection.ts";

const edges: ProjectedCanvasEdge[] = [
  edge("data:input:question->agent", "data", "input", "agent"),
  edge("flow:input->agent", "flow", "input", "agent"),
  edge("flow:agent->output", "flow", "agent", "output"),
  edge("route:branch:true->agent", "route", "branch", "agent"),
  edge("route:branch:false->output", "route", "branch", "output"),
];

test("edge visibility mode options keep smart as the default first choice", () => {
  assert.deepEqual(
    EDGE_VISIBILITY_MODE_OPTIONS.map((option) => option.mode),
    ["smart", "data", "flow", "all"] satisfies EdgeVisibilityMode[],
  );
  assert.equal(EDGE_VISIBILITY_MODE_OPTIONS[0]?.label, "智能");
});

test("smart mode shows data edges and condition route edges by default", () => {
  assert.deepEqual(
    visibleEdgeIds("smart", []),
    ["data:input:question->agent", "route:branch:true->agent", "route:branch:false->output"],
  );
});

test("smart mode ignores hovered and selected nodes when choosing visible edges", () => {
  assert.deepEqual(
    visibleEdgeIds("smart", ["agent"]),
    ["data:input:question->agent", "route:branch:true->agent", "route:branch:false->output"],
  );
});

test("output flow handles follow sequence edge visibility by mode", () => {
  assert.equal(isOutputFlowHandleVisibleForEdgeMode({ mode: "smart", anchorKind: "route-out" }), true);
  assert.equal(isOutputFlowHandleVisibleForEdgeMode({ mode: "smart", anchorKind: "flow-out" }), false);
  assert.equal(isOutputFlowHandleVisibleForEdgeMode({ mode: "data", anchorKind: "route-out" }), false);
  assert.equal(isOutputFlowHandleVisibleForEdgeMode({ mode: "data", anchorKind: "flow-out" }), false);
  assert.equal(isOutputFlowHandleVisibleForEdgeMode({ mode: "flow", anchorKind: "route-out" }), true);
  assert.equal(isOutputFlowHandleVisibleForEdgeMode({ mode: "flow", anchorKind: "flow-out" }), true);
  assert.equal(isOutputFlowHandleVisibleForEdgeMode({ mode: "all", anchorKind: "route-out" }), true);
  assert.equal(isOutputFlowHandleVisibleForEdgeMode({ mode: "all", anchorKind: "flow-out" }), true);
});

test("data mode shows only data flow lines", () => {
  assert.deepEqual(visibleEdgeIds("data", ["agent"]), ["data:input:question->agent"]);
});

test("flow mode shows normal sequence flow and condition route flow", () => {
  assert.deepEqual(
    visibleEdgeIds("flow", []),
    ["flow:input->agent", "flow:agent->output", "route:branch:true->agent", "route:branch:false->output"],
  );
});

test("selected edges remain visible even when the current mode would hide them", () => {
  assert.deepEqual(
    filterProjectedEdgesForVisibilityMode(edges, {
      mode: "flow",
      relatedNodeIds: new Set(),
      forceVisibleEdgeIds: new Set(["data:input:question->agent"]),
    }).map((candidate) => candidate.id),
    ["data:input:question->agent", "flow:input->agent", "flow:agent->output", "route:branch:true->agent", "route:branch:false->output"],
  );
});

test("all mode shows every projected edge", () => {
  assert.deepEqual(
    visibleEdgeIds("all", []),
    ["data:input:question->agent", "flow:input->agent", "flow:agent->output", "route:branch:true->agent", "route:branch:false->output"],
  );
});

function visibleEdgeIds(mode: EdgeVisibilityMode, relatedNodeIds: string[]) {
  return filterProjectedEdgesForVisibilityMode(edges, {
    mode,
    relatedNodeIds: new Set(relatedNodeIds),
  }).map((candidate) => candidate.id);
}

function edge(
  id: string,
  kind: ProjectedCanvasEdge["kind"],
  source: string,
  target: string,
): ProjectedCanvasEdge {
  return {
    id,
    kind,
    source,
    target,
    path: "M 0 0 L 1 1",
  };
}

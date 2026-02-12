import test from "node:test";
import assert from "node:assert/strict";

import {
  EDGE_VISIBILITY_MODE_OPTIONS,
  filterProjectedEdgesForVisibilityMode,
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

test("smart mode also shows flow edges related to hovered or selected nodes", () => {
  assert.deepEqual(
    visibleEdgeIds("smart", ["agent"]),
    ["data:input:question->agent", "flow:input->agent", "flow:agent->output", "route:branch:true->agent", "route:branch:false->output"],
  );
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

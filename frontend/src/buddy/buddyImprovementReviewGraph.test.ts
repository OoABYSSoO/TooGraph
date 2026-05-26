import test from "node:test";
import assert from "node:assert/strict";

import { buildBuddyImprovementReviewGraph, BUDDY_IMPROVEMENT_REVIEW_TEMPLATE_ID } from "./buddyImprovementReviewGraph.ts";
import type { TemplateRecord } from "../types/node-system.ts";

function template(): TemplateRecord {
  return {
    template_id: BUDDY_IMPROVEMENT_REVIEW_TEMPLATE_ID,
    label: "改进候选验证",
    description: "",
    default_graph_name: "改进候选验证",
    source: "official",
    status: "active",
    capabilityDiscoverable: false,
    state_schema: {
      improvement_candidate: { name: "improvement_candidate", description: "", type: "json", value: {}, color: "#7c3aed" },
      source_run_id: { name: "source_run_id", description: "", type: "text", value: "", color: "#475569" },
      final_summary: { name: "final_summary", description: "", type: "markdown", value: "", color: "#0369a1" },
    },
    nodes: {
      input_improvement_candidate: {
        kind: "input",
        name: "输入改进候选",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "improvement_candidate", mode: "replace" }],
        config: { value: {}, boundaryType: "json" },
      },
      input_source_run_id: {
        kind: "input",
        name: "输入来源 Run ID",
        description: "",
        ui: { position: { x: 0, y: 400 } },
        reads: [],
        writes: [{ state: "source_run_id", mode: "replace" }],
        config: { value: "", boundaryType: "text" },
      },
      output_final_summary: {
        kind: "output",
        name: "输出验证摘要",
        description: "",
        ui: { position: { x: 800, y: 0 } },
        reads: [{ state: "final_summary", required: true }],
        writes: [],
        config: { displayMode: "markdown", persistEnabled: false, persistFormat: "auto", fileNameTemplate: "" },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      role: "buddy_improvement_review_workflow",
      graphProtocol: "node_system",
    },
  };
}

test("buildBuddyImprovementReviewGraph fills candidate inputs and preserves the official template contract", () => {
  const candidate = {
    candidate_id: "cand_template_retry_budget",
    kind: "template_revision",
    source_run_id: "run_source",
    target_ref: { kind: "template", id: "buddy_autonomous_loop" },
    proposed_change_summary: "补充能力预算恢复分支。",
  };

  const graph = buildBuddyImprovementReviewGraph(template(), {
    candidate,
    sourceRunId: "run_source",
  });

  assert.equal(graph.graph_id, null);
  assert.equal(graph.name, "改进候选验证");
  assert.deepEqual(graph.state_schema.improvement_candidate.value, candidate);
  assert.equal(graph.state_schema.source_run_id.value, "run_source");
  assert.deepEqual(graph.nodes.input_improvement_candidate.kind === "input" ? graph.nodes.input_improvement_candidate.config.value : null, candidate);
  assert.equal(graph.nodes.input_source_run_id.kind === "input" ? graph.nodes.input_source_run_id.config.value : null, "run_source");
  assert.equal(graph.metadata.origin, "buddy");
  assert.equal(graph.metadata.buddy_template_id, BUDDY_IMPROVEMENT_REVIEW_TEMPLATE_ID);
  assert.equal(graph.metadata.buddy_improvement_candidate_review, true);
  assert.equal(graph.metadata.buddy_source_run_id, "run_source");
  assert.equal(graph.metadata.buddy_improvement_candidate_id, "cand_template_retry_budget");
});

test("buildBuddyImprovementReviewGraph rejects templates without the required input nodes", () => {
  const brokenTemplate = template();
  delete brokenTemplate.nodes.input_improvement_candidate;

  assert.throws(
    () => buildBuddyImprovementReviewGraph(brokenTemplate, { candidate: { candidate_id: "cand_1" }, sourceRunId: "run_source" }),
    /改进候选验证模板缺少 input_improvement_candidate 输入节点/,
  );
});

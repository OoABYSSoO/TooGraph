import { createDraftFromTemplate } from "../lib/graph-document.ts";

import type { GraphPayload, InputNode, TemplateRecord } from "../types/node-system.ts";

export const BUDDY_IMPROVEMENT_REVIEW_TEMPLATE_ID = "buddy_improvement_review_workflow";

export type BuddyImprovementReviewGraphInput = {
  candidate: Record<string, unknown>;
  sourceRunId: string;
};

export function buildBuddyImprovementReviewGraph(
  template: TemplateRecord,
  input: BuddyImprovementReviewGraphInput,
): GraphPayload {
  const graph = createDraftFromTemplate(template);
  const normalizedSourceRunId = input.sourceRunId.trim();
  writeRequiredInputValue(graph, "input_improvement_candidate", input.candidate);
  writeRequiredInputValue(graph, "input_source_run_id", normalizedSourceRunId);

  graph.metadata = {
    ...graph.metadata,
    origin: "buddy",
    buddy_template_id: template.template_id,
    buddy_improvement_candidate_review: true,
    buddy_source_run_id: normalizedSourceRunId,
    buddy_improvement_candidate_id: normalizeText(input.candidate.candidate_id),
  };
  return graph;
}

function writeRequiredInputValue(graph: GraphPayload, nodeId: string, value: unknown) {
  const node = graph.nodes[nodeId];
  if (!node || node.kind !== "input") {
    throw new Error(`改进候选验证模板缺少 ${nodeId} 输入节点。`);
  }
  writeInputValue(graph, node, value);
}

function writeInputValue(graph: GraphPayload, node: InputNode, value: unknown) {
  node.config = {
    ...node.config,
    value,
  };
  for (const binding of node.writes) {
    const state = graph.state_schema[binding.state];
    if (!state) {
      continue;
    }
    graph.state_schema[binding.state] = {
      ...state,
      value,
    };
  }
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

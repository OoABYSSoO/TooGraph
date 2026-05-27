import { createDraftFromTemplate } from "../lib/graph-document.ts";

import type { GraphPayload, InputNode, TemplateRecord } from "../types/node-system.ts";

export const EMBEDDING_MAINTENANCE_TEMPLATE_ID = "embedding_maintenance";

export type EmbeddingMaintenanceGraphInput = {
  modelRef: string;
  jobLimit: number;
};

export function buildEmbeddingMaintenanceGraph(
  template: TemplateRecord,
  input: EmbeddingMaintenanceGraphInput,
): GraphPayload {
  const graph = createDraftFromTemplate(template);
  const normalizedModelRef = input.modelRef.trim();
  const normalizedJobLimit = normalizeJobLimit(input.jobLimit);

  writeRequiredInputValue(graph, "input_model_ref", normalizedModelRef);
  writeRequiredInputValue(graph, "input_limit", normalizedJobLimit);

  graph.metadata = {
    ...graph.metadata,
    origin: "evidence_search",
    template_id: template.template_id,
    embedding_maintenance: true,
    embedding_model_ref: normalizedModelRef,
    embedding_job_limit: normalizedJobLimit,
  };
  return graph;
}

function writeRequiredInputValue(graph: GraphPayload, nodeId: string, value: unknown) {
  const node = graph.nodes[nodeId];
  if (!node || node.kind !== "input") {
    throw new Error(`Embedding 维护模板缺少 ${nodeId} 输入节点。`);
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

function normalizeJobLimit(value: number) {
  const integer = Number.isFinite(value) ? Math.floor(value) : 50;
  return Math.min(Math.max(integer, 1), 500);
}

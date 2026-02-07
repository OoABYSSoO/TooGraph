import { toRaw } from "vue";

import type { GraphPayload, TemplateRecord } from "../types/node-system.ts";

export function createDraftFromTemplate(template: TemplateRecord): GraphPayload {
  const rawTemplate = toRaw(template) as TemplateRecord;

  return structuredClone({
    graph_id: null,
    name: rawTemplate.default_graph_name,
    state_schema: rawTemplate.state_schema,
    nodes: rawTemplate.nodes,
    edges: rawTemplate.edges,
    conditional_edges: rawTemplate.conditional_edges,
    metadata: rawTemplate.metadata,
  });
}

export function createEmptyDraftGraph(name = "Untitled Graph"): GraphPayload {
  return {
    graph_id: null,
    name,
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

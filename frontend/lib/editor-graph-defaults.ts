import type { CanonicalGraphPayload, CanonicalTemplateRecord } from "@/lib/node-system-canonical";

const HELLO_WORLD_TEMPLATE_ID = "hello_world";

function deepCloneGraph<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createEditorSeedGraph(
  templates: CanonicalTemplateRecord[],
  defaultTemplateId?: string | null,
  initialGraph?: CanonicalGraphPayload | null,
): CanonicalGraphPayload {
  if (initialGraph) {
    return initialGraph;
  }

  const preferredTemplate =
    templates.find((item) => item.template_id === defaultTemplateId) ??
    templates.find((item) => item.template_id === HELLO_WORLD_TEMPLATE_ID) ??
    templates[0];

  if (preferredTemplate) {
    return deepCloneGraph({
      graph_id: null,
      name: preferredTemplate.default_graph_name,
      state_schema: preferredTemplate.state_schema,
      nodes: preferredTemplate.nodes,
      edges: preferredTemplate.edges,
      conditional_edges: preferredTemplate.conditional_edges,
      metadata: preferredTemplate.metadata,
    } satisfies CanonicalGraphPayload);
  }

  return {
    graph_id: null,
    name: "Node System Playground",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

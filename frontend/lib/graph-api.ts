import type { GraphCanvasEdge, GraphCanvasNode } from "@/types/editor";

type BackendGraphPayload = {
  graph_id?: string;
  name: string;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    position: { x: number; y: number };
    config: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    type: "normal" | "conditional";
    source: string;
    target: string;
    condition_label?: "pass" | "revise" | "fail";
  }>;
  metadata: Record<string, unknown>;
};

export function toBackendGraphPayload(
  graphId: string,
  name: string,
  nodes: GraphCanvasNode[],
  edges: GraphCanvasEdge[],
): BackendGraphPayload {
  return {
    graph_id: graphId === "demo-graph" ? undefined : graphId,
    name,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.kind,
      label: node.data.label,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      config: {
        description: node.data.description,
        status: node.data.status ?? "idle",
        ...(node.data.kind === "input" ? { task_input: node.data.description } : {}),
        ...(node.data.kind === "evaluator" ? { decision: "pass" } : {}),
      },
    })),
    edges: edges.map((edge) => {
      const label = typeof edge.label === "string" ? edge.label.toLowerCase() : "";
      const isConditional = label === "pass" || label === "revise" || label === "fail";
      return {
        id: edge.id,
        type: isConditional ? "conditional" : "normal",
        source: edge.source,
        target: edge.target,
        ...(isConditional ? { condition_label: label as "pass" | "revise" | "fail" } : {}),
      };
    }),
    metadata: {},
  };
}


import type { GraphCanvasEdge, GraphCanvasNode, GraphNodeType } from "@/types/editor";

export type BackendGraphPayload = {
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

export type BackendGraphDocument = BackendGraphPayload & {
  graph_id: string;
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

export function fromBackendGraphDocument(document: BackendGraphDocument): {
  graphId: string;
  graphName: string;
  nodes: GraphCanvasNode[];
  edges: GraphCanvasEdge[];
} {
  return {
    graphId: document.graph_id,
    graphName: document.name,
    nodes: document.nodes.map((node) => ({
      id: node.id,
      type: "default",
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      data: {
        label: node.label,
        kind: node.type as GraphNodeType,
        description:
          typeof node.config.description === "string"
            ? node.config.description
            : typeof node.config.task_input === "string"
              ? node.config.task_input
              : "",
        status:
          node.config.status === "running" ||
          node.config.status === "success" ||
          node.config.status === "failed"
            ? node.config.status
            : "idle",
      },
    })),
    edges: document.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.condition_label ?? undefined,
      animated: false,
    })),
  };
}

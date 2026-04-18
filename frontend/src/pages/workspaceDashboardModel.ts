import type { GraphDocument } from "../types/node-system.ts";

export type WorkspaceEmptyAction = {
  href: string;
  label: string;
};

export function countGraphEdgeTotal(graph: GraphDocument) {
  return graph.edges.length + graph.conditional_edges.reduce((count, edge) => count + Object.keys(edge.branches).length, 0);
}

export function resolveWorkspaceEmptyAction(kind: "runs" | "templates" | "graphs"): WorkspaceEmptyAction {
  switch (kind) {
    case "runs":
      return {
        href: "/editor",
        label: "打开编排器",
      };
    case "templates":
      return {
        href: "/editor",
        label: "更多模板",
      };
    default:
      return {
        href: "/editor/new",
        label: "新建图",
      };
  }
}

export function resolveWorkspaceCardDetail(kind: "runs" | "graphs") {
  switch (kind) {
    case "runs":
    case "graphs":
      return "查看详情";
  }
}

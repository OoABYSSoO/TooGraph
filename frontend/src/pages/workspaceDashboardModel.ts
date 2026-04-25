import type { GraphDocument } from "../types/node-system.ts";

export type WorkspaceEmptyAction = {
  href: string;
  label: string;
};

export type PaginatedWorkspacePanel<T> = {
  items: T[];
  page: number;
  pageCount: number;
  hasPagination: boolean;
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

export function paginateWorkspacePanelItems<T>(items: T[], requestedPage: number, pageSize = 5): PaginatedWorkspacePanel<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), pageCount - 1);
  const start = page * safePageSize;
  return {
    items: items.slice(start, start + safePageSize),
    page,
    pageCount,
    hasPagination: items.length > safePageSize,
  };
}

import type { ProjectedCanvasEdge } from "./edgeProjection.ts";

export type EdgeVisibilityMode = "smart" | "data" | "flow" | "all";

export type EdgeVisibilityModeOption = {
  mode: EdgeVisibilityMode;
  label: string;
  title: string;
};

export const EDGE_VISIBILITY_MODE_OPTIONS: EdgeVisibilityModeOption[] = [
  {
    mode: "smart",
    label: "智能",
    title: "默认只显示数据流线和条件分支线；悬浮或选中节点时显示相关线",
  },
  {
    mode: "data",
    label: "数据",
    title: "只显示数据流线",
  },
  {
    mode: "flow",
    label: "顺序",
    title: "只显示普通顺序流线和条件分支线",
  },
  {
    mode: "all",
    label: "全量",
    title: "显示全部线条",
  },
];

export function filterProjectedEdgesForVisibilityMode(
  edges: ProjectedCanvasEdge[],
  options: {
    mode: EdgeVisibilityMode;
    relatedNodeIds: ReadonlySet<string>;
  },
) {
  if (options.mode === "all") {
    return edges;
  }

  if (options.mode === "data") {
    return edges.filter((edge) => edge.kind === "data");
  }

  if (options.mode === "flow") {
    return edges.filter((edge) => edge.kind === "flow" || edge.kind === "route");
  }

  return edges.filter((edge) => {
    if (edge.kind === "data" || edge.kind === "route") {
      return true;
    }
    return options.relatedNodeIds.has(edge.source) || options.relatedNodeIds.has(edge.target);
  });
}

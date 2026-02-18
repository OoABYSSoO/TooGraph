import type { ProjectedCanvasEdge } from "./edgeProjection.ts";
import { translate } from "../../i18n/index.ts";

export type EdgeVisibilityMode = "smart" | "data" | "flow" | "all";

export type EdgeVisibilityModeOption = {
  mode: EdgeVisibilityMode;
  label: string;
  title: string;
};

export function buildEdgeVisibilityModeOptions(): EdgeVisibilityModeOption[] {
  return [
    {
      mode: "smart",
      label: translate("edgeMode.smart"),
      title: translate("edgeMode.smartTitle"),
    },
    {
      mode: "data",
      label: translate("edgeMode.data"),
      title: translate("edgeMode.dataTitle"),
    },
    {
      mode: "flow",
      label: translate("edgeMode.sequence"),
      title: translate("edgeMode.sequenceTitle"),
    },
    {
      mode: "all",
      label: translate("edgeMode.all"),
      title: translate("edgeMode.allTitle"),
    },
  ];
}

export const EDGE_VISIBILITY_MODE_OPTIONS: EdgeVisibilityModeOption[] = buildEdgeVisibilityModeOptions();

export function filterProjectedEdgesForVisibilityMode(
  edges: ProjectedCanvasEdge[],
  options: {
    mode: EdgeVisibilityMode;
    relatedNodeIds: ReadonlySet<string>;
    forceVisibleEdgeIds?: ReadonlySet<string>;
  },
) {
  const forceVisibleEdgeIds = options.forceVisibleEdgeIds ?? new Set<string>();
  const visibleEdges = (() => {
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
  })();

  if (forceVisibleEdgeIds.size === 0) {
    return visibleEdges;
  }

  const visibleEdgeIds = new Set(visibleEdges.map((edge) => edge.id));
  return edges.filter((edge) => visibleEdgeIds.has(edge.id) || forceVisibleEdgeIds.has(edge.id));
}

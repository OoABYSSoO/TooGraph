import type { ProjectedCanvasEdge } from "./edgeProjection.ts";
import { resolveRouteHandlePalette } from "./routeHandleModel.ts";

export type MinimapEdgeModel = {
  id: string;
  kind: ProjectedCanvasEdge["kind"];
  path: string;
  color?: string;
};

export function buildMinimapEdgeModels(input: {
  edges: readonly ProjectedCanvasEdge[];
  visibleEdgeIds: ReadonlySet<string>;
}): MinimapEdgeModel[] {
  return input.edges
    .filter((edge) => input.visibleEdgeIds.has(edge.id))
    .map((edge) => ({
      id: edge.id,
      kind: edge.kind,
      path: edge.path,
      color: edge.kind === "route" ? resolveRouteHandlePalette(edge.branch).accent : edge.color,
    }));
}

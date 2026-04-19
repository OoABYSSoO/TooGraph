import { buildConnectorCurvePath } from "./connectionCurvePath.ts";
import { buildRouteEdgePath, resolveRouteEdgeSourceOffset } from "./routeEdgePath.ts";

export function buildPendingConnectionPreviewPath(input: {
  kind: "flow-out" | "route-out" | "state-out";
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  routeSourceIndex?: number;
}) {
  if (input.kind === "route-out") {
    return buildRouteEdgePath({
      sourceX: input.sourceX,
      sourceY: input.sourceY,
      targetX: input.targetX,
      targetY: input.targetY,
      sourceOffset: resolveRouteEdgeSourceOffset(input.routeSourceIndex ?? 0),
    });
  }

  return buildConnectorCurvePath({
    sourceX: input.sourceX,
    sourceY: input.sourceY,
    targetX: input.targetX,
    targetY: input.targetY,
    sourceSide: "right",
    targetSide: "left",
  });
}

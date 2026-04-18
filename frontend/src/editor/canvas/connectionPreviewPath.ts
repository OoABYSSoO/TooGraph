import { buildRouteEdgePath, resolveRouteEdgeSourceOffset } from "./routeEdgePath.ts";

export function buildPendingConnectionPreviewPath(input: {
  kind: "flow-out" | "route-out";
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

  const midX = input.sourceX + (input.targetX - input.sourceX) / 2;
  return `M ${input.sourceX} ${input.sourceY} L ${midX} ${input.sourceY} L ${midX} ${input.targetY} L ${input.targetX} ${input.targetY}`;
}

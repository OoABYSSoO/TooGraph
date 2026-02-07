"use client";

import { BaseEdge, type EdgeProps } from "@xyflow/react";

import { buildRouteEdgePath } from "@/lib/node-system-route-edge-path";

export function NodeSystemRouteEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  interactionWidth,
  data,
}: EdgeProps) {
  const edgePath = buildRouteEdgePath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceOffset:
      data && typeof data === "object" && "routeSourceOffset" in data && typeof data.routeSourceOffset === "number"
        ? data.routeSourceOffset
        : undefined,
  });

  return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />;
}

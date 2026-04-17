import type { Edge } from "@xyflow/react";

export function decorateFlowEdges(
  edges: Edge[],
  cycleBackEdgeIds: Set<string>,
  activeEdgeIds: Set<string>,
): Edge[] {
  return edges.map((edge) => {
    const isBackEdge = cycleBackEdgeIds.has(edge.id);
    const isActiveEdge = activeEdgeIds.has(edge.id);
    if (!isBackEdge && !isActiveEdge) {
      return edge;
    }

    const baseStrokeWidth = typeof edge.style?.strokeWidth === "number" ? edge.style.strokeWidth : 1.8;
    return {
      ...edge,
      animated: isBackEdge || edge.animated,
      style: {
        ...edge.style,
        ...(isBackEdge ? { strokeDasharray: "8 5" } : null),
        strokeWidth: isActiveEdge ? Math.max(baseStrokeWidth, 3) : Math.max(baseStrokeWidth, 2.4),
        opacity: isActiveEdge ? 1 : edge.style?.opacity,
      },
    };
  });
}

import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";
import { type ProjectedCanvasAnchor, type ProjectedCanvasEdge, projectCanvasAnchors, projectCanvasEdges } from "./edgeProjection.ts";
import { buildConnectorCurvePath } from "./connectionCurvePath.ts";
import { buildRouteEdgePath, resolveRouteEdgeSourceOffset } from "./routeEdgePath.ts";

export type MeasuredAnchorOffset = {
  offsetX: number;
  offsetY: number;
};

export function resolveCanvasLayout(
  document: GraphPayload | GraphDocument,
  measuredAnchorOffsets: Record<string, MeasuredAnchorOffset>,
): { anchors: ProjectedCanvasAnchor[]; edges: ProjectedCanvasEdge[] } {
  const anchors = resolveCanvasAnchors(document, projectCanvasAnchors(document), measuredAnchorOffsets);
  const edges = resolveCanvasEdges(document, projectCanvasEdges(document), anchors);

  return { anchors, edges };
}

function resolveCanvasAnchors(
  document: GraphPayload | GraphDocument,
  anchors: ProjectedCanvasAnchor[],
  measuredAnchorOffsets: Record<string, MeasuredAnchorOffset>,
): ProjectedCanvasAnchor[] {
  return anchors.map((anchor) => {
    const node = document.nodes[anchor.nodeId];
    const measured = measuredAnchorOffsets[anchor.id];
    if (!node || !measured) {
      return anchor;
    }

    return {
      ...anchor,
      x: node.ui.position.x + measured.offsetX,
      y: node.ui.position.y + measured.offsetY,
    };
  });
}

function resolveCanvasEdges(
  document: GraphPayload | GraphDocument,
  edges: ProjectedCanvasEdge[],
  anchors: ProjectedCanvasAnchor[],
): ProjectedCanvasEdge[] {
  return edges.map((edge) => {
    if (edge.kind === "route") {
      const sourceAnchor = anchors.find(
        (anchor) => anchor.nodeId === edge.source && anchor.kind === "route-out" && anchor.branch === edge.branch,
      );
      const targetAnchor = anchors.find((anchor) => anchor.nodeId === edge.target && anchor.kind === "flow-in");
      if (!sourceAnchor || !targetAnchor) {
        return edge;
      }

      return {
        ...edge,
        path: buildRouteEdgePath({
          sourceX: sourceAnchor.x,
          sourceY: sourceAnchor.y,
          targetX: targetAnchor.x,
          targetY: targetAnchor.y,
          sourceOffset: resolveRouteSourceOffset(document, edge.source, edge.branch ?? ""),
        }),
      };
    }

    if (edge.kind === "data") {
      const sourceAnchor = anchors.find(
        (anchor) => anchor.nodeId === edge.source && anchor.kind === "state-out" && anchor.stateKey === edge.state,
      );
      const targetAnchor = anchors.find(
        (anchor) => anchor.nodeId === edge.target && anchor.kind === "state-in" && anchor.stateKey === edge.state,
      );
      if (!sourceAnchor || !targetAnchor) {
        return edge;
      }

      return {
        ...edge,
        path: buildFlowPath(sourceAnchor.x, sourceAnchor.y, targetAnchor.x, targetAnchor.y),
      };
    }

    const sourceAnchor = anchors.find((anchor) => anchor.nodeId === edge.source && anchor.kind === "flow-out");
    const targetAnchor = anchors.find((anchor) => anchor.nodeId === edge.target && anchor.kind === "flow-in");
    if (!sourceAnchor || !targetAnchor) {
      return edge;
    }

    return {
      ...edge,
      path: buildFlowPath(sourceAnchor.x, sourceAnchor.y, targetAnchor.x, targetAnchor.y),
    };
  });
}

function buildFlowPath(startX: number, startY: number, endX: number, endY: number) {
  return buildConnectorCurvePath({
    sourceX: startX,
    sourceY: startY,
    targetX: endX,
    targetY: endY,
    sourceSide: "right",
    targetSide: "left",
  });
}

function resolveRouteSourceOffset(document: GraphPayload | GraphDocument, nodeId: string, branchKey: string) {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "condition") {
    return 0;
  }

  const branchIndex = node.config.branches.indexOf(branchKey);
  return resolveRouteEdgeSourceOffset(branchIndex >= 0 ? branchIndex : 0);
}

import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";
import { type ProjectedCanvasAnchor, type ProjectedCanvasEdge, projectCanvasAnchors, projectCanvasEdges } from "./edgeProjection.ts";
import { buildConnectorCurvePath } from "./connectionCurvePath.ts";
import { buildSequenceFlowPath } from "./flowEdgePath.ts";

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
        path: buildFlowPath(
          sourceAnchor.x,
          sourceAnchor.y,
          targetAnchor.x,
          targetAnchor.y,
          document.nodes[edge.source]?.ui.position.x,
          document.nodes[edge.source]?.ui.position.y,
          document.nodes[edge.target]?.ui.position.x,
          document.nodes[edge.target]?.ui.position.y,
        ),
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
        path: buildDataPath(sourceAnchor.x, sourceAnchor.y, targetAnchor.x, targetAnchor.y),
      };
    }

    const sourceAnchor = anchors.find((anchor) => anchor.nodeId === edge.source && anchor.kind === "flow-out");
    const targetAnchor = anchors.find((anchor) => anchor.nodeId === edge.target && anchor.kind === "flow-in");
    if (!sourceAnchor || !targetAnchor) {
      return edge;
    }

    return {
      ...edge,
      path: buildFlowPath(
        sourceAnchor.x,
        sourceAnchor.y,
        targetAnchor.x,
        targetAnchor.y,
        document.nodes[edge.source]?.ui.position.x,
        document.nodes[edge.source]?.ui.position.y,
        document.nodes[edge.target]?.ui.position.x,
        document.nodes[edge.target]?.ui.position.y,
      ),
    };
  });
}

function buildFlowPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  sourceNodeX?: number,
  sourceNodeY?: number,
  targetNodeX?: number,
  targetNodeY?: number,
) {
  return buildSequenceFlowPath({
    sourceX: startX,
    sourceY: startY,
    targetX: endX,
    targetY: endY,
    sourceNodeX,
    sourceNodeY,
    targetNodeX,
    targetNodeY,
  });
}

function buildDataPath(startX: number, startY: number, endX: number, endY: number) {
  return buildConnectorCurvePath({
    sourceX: startX,
    sourceY: startY,
    targetX: endX,
    targetY: endY,
    sourceSide: "right",
    targetSide: "left",
  });
}

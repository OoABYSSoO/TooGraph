import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";
import {
  type ProjectedCanvasAnchor,
  type ProjectedCanvasEdge,
  type ProjectedCanvasEdgeRouting,
  projectCanvasAnchors,
  projectCanvasEdges,
} from "./edgeProjection.ts";
import type { MeasuredNodeSize } from "./canvasNodePresentationModel.ts";
import { buildConnectorCurvePath } from "./connectionCurvePath.ts";
import { buildSelfFeedbackFlowPath, buildSequenceFlowPath } from "./flowEdgePath.ts";

export type MeasuredAnchorOffset = {
  offsetX: number;
  offsetY: number;
};

export function resolveCanvasLayout(
  document: GraphPayload | GraphDocument,
  measuredAnchorOffsets: Record<string, MeasuredAnchorOffset>,
  measuredNodeSizes: Record<string, MeasuredNodeSize> = {},
): { anchors: ProjectedCanvasAnchor[]; edges: ProjectedCanvasEdge[] } {
  const projectionOptions = { measuredNodeSizes };
  const anchors = resolveCanvasAnchors(document, projectCanvasAnchors(document, projectionOptions), measuredAnchorOffsets);
  const edges = resolveCanvasEdges(document, projectCanvasEdges(document, projectionOptions), anchors);

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
    if (!node || !measured || anchor.kind === "route-out") {
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
          edge.routing,
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
        path: buildDataPath(
          sourceAnchor.x,
          sourceAnchor.y,
          targetAnchor.x,
          targetAnchor.y,
          document.nodes[edge.source]?.ui.position.x,
          document.nodes[edge.source]?.ui.position.y,
          document.nodes[edge.target]?.ui.position.x,
          document.nodes[edge.target]?.ui.position.y,
          edge.source === edge.target,
        ),
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
        edge.routing,
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
  routing?: ProjectedCanvasEdgeRouting,
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
    sourceLaneIndex: routing?.sourceLaneIndex,
    sourceLaneCount: routing?.sourceLaneCount,
    targetLaneIndex: routing?.targetLaneIndex,
    targetLaneCount: routing?.targetLaneCount,
  });
}

function buildDataPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  sourceNodeX?: number,
  sourceNodeY?: number,
  targetNodeX?: number,
  targetNodeY?: number,
  isSelfFeedback = false,
) {
  if (isSelfFeedback) {
    return buildSelfFeedbackFlowPath({
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

  if (endX <= startX) {
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

  return buildConnectorCurvePath({
    sourceX: startX,
    sourceY: startY,
    targetX: endX,
    targetY: endY,
    sourceSide: "right",
    targetSide: "left",
  });
}

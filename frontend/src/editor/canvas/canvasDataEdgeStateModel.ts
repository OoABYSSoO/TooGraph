import type { GraphPosition } from "../../types/node-system.ts";
import type { ProjectedCanvasEdge } from "./edgeProjection.ts";

export type FloatingCanvasPoint = {
  x: number;
  y: number;
};

export type DataEdgeStateConfirmTarget = {
  id: string;
  source: string;
  target: string;
  stateKey: string;
  x: number;
  y: number;
};

export type DataEdgeStateEditorTarget = DataEdgeStateConfirmTarget & {
  mode: "edit" | "create";
};

export type DataEdgeStateEditorRequest = {
  sourceNodeId: string;
  targetNodeId: string;
  stateKey: string;
  position: GraphPosition;
};

export function buildDataEdgeId(sourceNodeId: string, stateKey: string, targetNodeId: string) {
  return `data:${sourceNodeId}:${stateKey}->${targetNodeId}`;
}

export function buildFloatingCanvasPointStyle(point: FloatingCanvasPoint | null | undefined) {
  if (!point) {
    return undefined;
  }

  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
  };
}

export function buildDataEdgeStateConfirmFromEdge(
  edge: Pick<ProjectedCanvasEdge, "id" | "kind" | "source" | "target" | "state">,
  point: FloatingCanvasPoint,
): DataEdgeStateConfirmTarget | null {
  if (edge.kind !== "data" || !edge.state) {
    return null;
  }

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    stateKey: edge.state,
    x: point.x,
    y: point.y,
  };
}

export function buildDataEdgeStateEditorFromConfirm(confirm: DataEdgeStateConfirmTarget): DataEdgeStateEditorTarget {
  return {
    ...confirm,
    mode: "edit",
  };
}

export function buildDataEdgeStateEditorFromRequest(request: DataEdgeStateEditorRequest): DataEdgeStateEditorTarget {
  return {
    id: buildDataEdgeId(request.sourceNodeId, request.stateKey, request.targetNodeId),
    source: request.sourceNodeId,
    target: request.targetNodeId,
    stateKey: request.stateKey,
    mode: "create",
    x: request.position.x,
    y: request.position.y,
  };
}

export function isActiveDataEdge(
  edge: Pick<ProjectedCanvasEdge, "kind" | "source" | "target" | "state">,
  dataState: Pick<DataEdgeStateConfirmTarget, "source" | "target" | "stateKey"> | null | undefined,
) {
  if (!dataState) {
    return false;
  }

  return edge.kind === "data" && edge.source === dataState.source && edge.target === dataState.target && edge.state === dataState.stateKey;
}

export function isDataEdgeStateInteractionOpen(
  edge: Pick<ProjectedCanvasEdge, "kind" | "source" | "target" | "state">,
  input: {
    confirm: Pick<DataEdgeStateConfirmTarget, "source" | "target" | "stateKey"> | null | undefined;
    editor: Pick<DataEdgeStateConfirmTarget, "source" | "target" | "stateKey"> | null | undefined;
  },
) {
  return isActiveDataEdge(edge, input.confirm) || isActiveDataEdge(edge, input.editor);
}

import {
  buildFloatingCanvasPointStyle,
  type FloatingCanvasPoint,
} from "./canvasDataEdgeStateModel.ts";
import type { ProjectedCanvasEdge } from "./edgeProjection.ts";

export type FlowEdgeDeleteConfirmTarget = FloatingCanvasPoint & {
  id: string;
  kind: "flow" | "route";
  source: string;
  target: string;
  branch?: string;
};

export type FlowEdgeDeleteAction =
  | {
      kind: "flow";
      sourceNodeId: string;
      targetNodeId: string;
    }
  | {
      kind: "route";
      sourceNodeId: string;
      branchKey: string;
    };

export function buildFlowEdgeDeleteConfirmFromEdge(
  edge: Pick<ProjectedCanvasEdge, "id" | "kind" | "source" | "target" | "branch">,
  point: FloatingCanvasPoint,
): FlowEdgeDeleteConfirmTarget | null {
  if (edge.kind !== "flow" && edge.kind !== "route") {
    return null;
  }

  return {
    id: edge.id,
    kind: edge.kind === "route" ? "route" : "flow",
    source: edge.source,
    target: edge.target,
    ...(edge.kind === "route" && edge.branch ? { branch: edge.branch } : {}),
    x: point.x,
    y: point.y,
  };
}

export function buildFlowEdgeDeleteConfirmStyle(confirm: FlowEdgeDeleteConfirmTarget | null | undefined) {
  return buildFloatingCanvasPointStyle(confirm);
}

export function isFlowEdgeDeleteConfirmActive(confirm: FlowEdgeDeleteConfirmTarget | null | undefined, edgeId: string) {
  return confirm?.id === edgeId;
}

export function resolveFlowEdgeDeleteAction(confirm: FlowEdgeDeleteConfirmTarget | null | undefined): FlowEdgeDeleteAction | null {
  if (!confirm) {
    return null;
  }

  if (confirm.kind === "route" && confirm.branch) {
    return {
      kind: "route",
      sourceNodeId: confirm.source,
      branchKey: confirm.branch,
    };
  }

  return {
    kind: "flow",
    sourceNodeId: confirm.source,
    targetNodeId: confirm.target,
  };
}

export function resolveFlowEdgeDeleteActionFromEdge(
  edge: Pick<ProjectedCanvasEdge, "kind" | "source" | "target" | "branch"> | null | undefined,
): FlowEdgeDeleteAction | null {
  if (!edge) {
    return null;
  }

  if (edge.kind === "route" && edge.branch) {
    return {
      kind: "route",
      sourceNodeId: edge.source,
      branchKey: edge.branch,
    };
  }

  if (edge.kind === "flow") {
    return {
      kind: "flow",
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
    };
  }

  return null;
}

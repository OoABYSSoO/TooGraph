import type { PendingGraphConnection } from "../../lib/graph-connections.ts";
import {
  CREATE_AGENT_INPUT_STATE_KEY,
  VIRTUAL_ANY_INPUT_COLOR,
  VIRTUAL_ANY_INPUT_STATE_KEY,
  VIRTUAL_ANY_OUTPUT_COLOR,
  VIRTUAL_ANY_OUTPUT_STATE_KEY,
} from "../../lib/virtual-any-input.ts";
import { buildPendingConnectionPreviewPath } from "./connectionPreviewPath.ts";
import type { ProjectedCanvasAnchor, ProjectedCanvasEdge } from "./edgeProjection.ts";
import { resolveRouteHandlePalette } from "./routeHandleModel.ts";

export type CanvasConnectionPreviewKind = "flow" | "route" | "data";

export type CanvasConnectionPreviewPoint = {
  x: number;
  y: number;
};

export type CanvasConnectionPreviewModel = {
  kind: CanvasConnectionPreviewKind;
  path: string;
};

export function isConcreteStateConnectionKey(stateKey: string | null | undefined): stateKey is string {
  return (
    typeof stateKey === "string" &&
    stateKey.length > 0 &&
    stateKey !== CREATE_AGENT_INPUT_STATE_KEY &&
    stateKey !== VIRTUAL_ANY_INPUT_STATE_KEY &&
    stateKey !== VIRTUAL_ANY_OUTPUT_STATE_KEY
  );
}

export function buildPendingConnectionFromAnchor(anchor: ProjectedCanvasAnchor): PendingGraphConnection | null {
  if (anchor.kind === "flow-out") {
    return {
      sourceNodeId: anchor.nodeId,
      sourceKind: "flow-out",
    };
  }

  if (anchor.kind === "route-out" && anchor.branch) {
    return {
      sourceNodeId: anchor.nodeId,
      sourceKind: "route-out",
      branchKey: anchor.branch,
    };
  }

  if (anchor.kind === "state-out" && anchor.stateKey) {
    return {
      sourceNodeId: anchor.nodeId,
      sourceKind: "state-out",
      sourceStateKey: anchor.stateKey,
    };
  }

  if (anchor.kind === "state-in" && anchor.stateKey) {
    return {
      sourceNodeId: anchor.nodeId,
      sourceKind: "state-in",
      sourceStateKey: anchor.stateKey,
    };
  }

  return null;
}

export function isSamePendingConnection(left: PendingGraphConnection | null, right: PendingGraphConnection | null) {
  return (
    left?.sourceNodeId === right?.sourceNodeId &&
    left?.sourceKind === right?.sourceKind &&
    left?.sourceStateKey === right?.sourceStateKey &&
    left?.branchKey === right?.branchKey
  );
}

export function resolveConnectionSourceAnchorId(
  connection: PendingGraphConnection | null,
  anchors: readonly ProjectedCanvasAnchor[],
) {
  if (!connection) {
    return null;
  }

  const sourceAnchor = anchors.find(
    (anchor) =>
      anchor.nodeId === connection.sourceNodeId &&
      anchor.kind === connection.sourceKind &&
      (anchor.kind !== "route-out" || anchor.branch === connection.branchKey) &&
      ((anchor.kind !== "state-out" && anchor.kind !== "state-in") || anchor.stateKey === connection.sourceStateKey),
  );
  return sourceAnchor?.id ?? null;
}

export function resolveConnectionPreviewStateKey(input: {
  connection: PendingGraphConnection | null;
  autoSnappedTargetStateKey?: string | null;
}) {
  const connection = input.connection;
  if (
    connection?.sourceKind === "state-out" &&
    connection.sourceStateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY &&
    isConcreteStateConnectionKey(input.autoSnappedTargetStateKey)
  ) {
    return input.autoSnappedTargetStateKey;
  }
  if (
    connection?.sourceKind === "state-in" &&
    connection.sourceStateKey === VIRTUAL_ANY_INPUT_STATE_KEY &&
    isConcreteStateConnectionKey(input.autoSnappedTargetStateKey)
  ) {
    return input.autoSnappedTargetStateKey;
  }
  if ((connection?.sourceKind === "state-out" || connection?.sourceKind === "state-in") && connection.sourceStateKey) {
    return connection.sourceStateKey;
  }
  return null;
}

export function resolveConnectionAccentColor(input: {
  connection: PendingGraphConnection | null;
  previewStateKey: string | null;
  stateSchema: Record<string, { color?: string | null }>;
}) {
  if (input.previewStateKey) {
    if (input.previewStateKey === VIRTUAL_ANY_INPUT_STATE_KEY) {
      return VIRTUAL_ANY_INPUT_COLOR;
    }
    if (input.previewStateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY) {
      return VIRTUAL_ANY_OUTPUT_COLOR;
    }
    return input.stateSchema[input.previewStateKey]?.color?.trim() || "#2563eb";
  }
  if (input.connection?.sourceKind === "route-out" && input.connection.branchKey) {
    return resolveRouteHandlePalette(input.connection.branchKey).accent;
  }
  return "#c96b1f";
}

export function buildConnectionPreviewModel(input: {
  connection: PendingGraphConnection | null;
  pendingPoint: CanvasConnectionPreviewPoint | null;
  sourceAnchor: Pick<ProjectedCanvasAnchor, "x" | "y"> | null;
}): CanvasConnectionPreviewModel | null {
  if (!input.connection || !input.pendingPoint || !input.sourceAnchor) {
    return null;
  }

  return {
    kind: resolveConnectionPreviewKind(input.connection.sourceKind),
    path: buildPendingConnectionPreviewPath({
      kind: input.connection.sourceKind,
      sourceX: input.sourceAnchor.x,
      sourceY: input.sourceAnchor.y,
      targetX: input.pendingPoint.x,
      targetY: input.pendingPoint.y,
    }),
  };
}

export function resolveSelectedReconnectConnection(input: {
  selectedEdgeId: string | null;
  activeFlowEdgeDeleteConfirmId?: string | null;
  edges: readonly ProjectedCanvasEdge[];
}): PendingGraphConnection | null {
  if (input.activeFlowEdgeDeleteConfirmId === input.selectedEdgeId) {
    return null;
  }

  const edge = input.selectedEdgeId ? input.edges.find((candidate) => candidate.id === input.selectedEdgeId) : null;
  if (!edge || edge.kind === "data") {
    return null;
  }

  if (edge.kind === "route" && edge.branch) {
    return {
      sourceNodeId: edge.source,
      sourceKind: "route-out",
      branchKey: edge.branch,
      mode: "reconnect",
      currentTargetNodeId: edge.target,
    };
  }

  if (edge.kind !== "flow") {
    return null;
  }

  return {
    sourceNodeId: edge.source,
    sourceKind: "flow-out",
    mode: "reconnect",
    currentTargetNodeId: edge.target,
  };
}

function resolveConnectionPreviewKind(sourceKind: PendingGraphConnection["sourceKind"]): CanvasConnectionPreviewKind {
  if (sourceKind === "route-out") {
    return "route";
  }
  if (sourceKind === "state-out" || sourceKind === "state-in") {
    return "data";
  }
  return "flow";
}

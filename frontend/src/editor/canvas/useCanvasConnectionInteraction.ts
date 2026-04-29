import { ref } from "vue";

import type { PendingGraphConnection } from "../../lib/graph-connections.ts";
import {
  buildPendingConnectionFromAnchor,
  isSamePendingConnection,
  type CanvasConnectionPreviewPoint,
} from "./canvasConnectionModel.ts";
import type { ProjectedCanvasAnchor } from "./edgeProjection.ts";

export type CanvasConnectionInteractionHoverChange = {
  previousNodeId: string | null;
  nextNodeId: string | null;
};

export type CanvasConnectionInteractionInput = {
  onActiveConnectionHoverNodeChange?: (change: CanvasConnectionInteractionHoverChange) => void;
};

export type PendingConnectionStartResult =
  | { status: "started"; connection: PendingGraphConnection }
  | { status: "cleared" }
  | { status: "ignored" };

export function useCanvasConnectionInteraction(input: CanvasConnectionInteractionInput = {}) {
  const pendingConnection = ref<PendingGraphConnection | null>(null);
  const pendingConnectionPoint = ref<CanvasConnectionPreviewPoint | null>(null);
  const pendingConnectionPointerId = ref<number | null>(null);
  const autoSnappedTargetAnchor = ref<ProjectedCanvasAnchor | null>(null);
  const activeConnectionHoverNodeId = ref<string | null>(null);

  function clearPendingConnection() {
    pendingConnection.value = null;
    pendingConnectionPoint.value = null;
    pendingConnectionPointerId.value = null;
  }

  function clearConnectionPreviewState() {
    autoSnappedTargetAnchor.value = null;
    setActiveConnectionHoverNode(null);
  }

  function clearConnectionInteractionState() {
    clearPendingConnection();
    clearConnectionPreviewState();
  }

  function startOrTogglePendingConnectionFromAnchor(anchor: ProjectedCanvasAnchor, pointerId: number | null = null): PendingConnectionStartResult {
    const nextPendingConnection = buildPendingConnectionFromAnchor(anchor);
    if (!nextPendingConnection) {
      return { status: "ignored" };
    }

    if (isSamePendingConnection(pendingConnection.value, nextPendingConnection)) {
      clearPendingConnection();
      return { status: "cleared" };
    }

    pendingConnection.value = nextPendingConnection;
    pendingConnectionPoint.value = { x: anchor.x, y: anchor.y };
    pendingConnectionPointerId.value = pointerId;
    return { status: "started", connection: nextPendingConnection };
  }

  function updatePendingConnectionTarget(input: {
    targetAnchor: ProjectedCanvasAnchor | null;
    fallbackPoint: CanvasConnectionPreviewPoint;
  }) {
    autoSnappedTargetAnchor.value = input.targetAnchor;
    pendingConnectionPoint.value = input.targetAnchor
      ? { x: input.targetAnchor.x, y: input.targetAnchor.y }
      : input.fallbackPoint;
  }

  function setPendingConnectionPoint(point: CanvasConnectionPreviewPoint | null) {
    pendingConnectionPoint.value = point;
  }

  function isPendingConnectionPointer(pointerId: number) {
    return pendingConnectionPointerId.value === null || pendingConnectionPointerId.value === pointerId;
  }

  function isForeignPendingConnectionPointer(pointerId: number) {
    return pendingConnectionPointerId.value !== null && pendingConnectionPointerId.value !== pointerId;
  }

  function setActiveConnectionHoverNode(nodeId: string | null) {
    if (activeConnectionHoverNodeId.value === nodeId) {
      return;
    }

    const previousNodeId = activeConnectionHoverNodeId.value;
    activeConnectionHoverNodeId.value = nodeId;
    input.onActiveConnectionHoverNodeChange?.({
      previousNodeId,
      nextNodeId: nodeId,
    });
  }

  return {
    pendingConnection,
    pendingConnectionPoint,
    pendingConnectionPointerId,
    autoSnappedTargetAnchor,
    activeConnectionHoverNodeId,
    clearPendingConnection,
    clearConnectionPreviewState,
    clearConnectionInteractionState,
    startOrTogglePendingConnectionFromAnchor,
    updatePendingConnectionTarget,
    setPendingConnectionPoint,
    isPendingConnectionPointer,
    isForeignPendingConnectionPointer,
    setActiveConnectionHoverNode,
  };
}

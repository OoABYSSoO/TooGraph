export type CanvasEdgePointerDownEdge = {
  id: string;
  kind: string;
};

export type CanvasEdgeTargetPointEdge = {
  kind: string;
  target: string;
  state?: string | null;
};

export type CanvasEdgeTargetPointAnchor = {
  nodeId: string;
  kind: string;
  stateKey?: string | null;
  x: number;
  y: number;
};

type CanvasEdgeTargetPoint = {
  x: number;
  y: number;
};

type CanvasEdgePointerDownBaseAction = {
  focusCanvas: true;
  clearCanvasTransientState: true;
  clearPendingConnection: true;
};

export type CanvasEdgePointerDownAction =
  | { type: "locked-edit-attempt"; preventDefault: true }
  | (CanvasEdgePointerDownBaseAction & {
      type: "start-flow-edge-delete-confirm";
      clearSelectedEdge: true;
      clearSelection: true;
    })
  | (CanvasEdgePointerDownBaseAction & {
      type: "start-data-edge-state-confirm";
      clearSelectedEdge: true;
      clearSelection: true;
    })
  | (CanvasEdgePointerDownBaseAction & {
      type: "clear-selected-edge";
      clearSelectedEdge: true;
      clearPendingConnectionPoint: true;
      clearSelection: true;
    })
  | (CanvasEdgePointerDownBaseAction & {
      type: "select-edge";
      selectEdgeId: string;
      updatePendingConnectionPoint: true;
      clearSelection: true;
    });

const baseEdgePointerDownAction = {
  focusCanvas: true,
  clearCanvasTransientState: true,
  clearPendingConnection: true,
} as const;

export function resolveCanvasEdgePointerDownAction(input: {
  interactionLocked: boolean;
  edge: CanvasEdgePointerDownEdge;
  selectedEdgeId: string | null | undefined;
}): CanvasEdgePointerDownAction {
  if (input.interactionLocked) {
    return { type: "locked-edit-attempt", preventDefault: true };
  }

  if (input.edge.kind === "flow" || input.edge.kind === "route") {
    return {
      type: "start-flow-edge-delete-confirm",
      ...baseEdgePointerDownAction,
      clearSelectedEdge: true,
      clearSelection: true,
    };
  }

  if (input.edge.kind === "data") {
    return {
      type: "start-data-edge-state-confirm",
      ...baseEdgePointerDownAction,
      clearSelectedEdge: true,
      clearSelection: true,
    };
  }

  if (input.selectedEdgeId === input.edge.id) {
    return {
      type: "clear-selected-edge",
      ...baseEdgePointerDownAction,
      clearSelectedEdge: true,
      clearPendingConnectionPoint: true,
      clearSelection: true,
    };
  }

  return {
    type: "select-edge",
    ...baseEdgePointerDownAction,
    selectEdgeId: input.edge.id,
    updatePendingConnectionPoint: true,
    clearSelection: true,
  };
}

export function resolveCanvasEdgeTargetPoint(input: {
  edge: CanvasEdgeTargetPointEdge;
  anchors: readonly CanvasEdgeTargetPointAnchor[];
}): CanvasEdgeTargetPoint | null {
  const targetAnchor =
    input.edge.kind === "data" && input.edge.state
      ? input.anchors.find(
          (anchor) =>
            anchor.nodeId === input.edge.target &&
            anchor.kind === "state-in" &&
            anchor.stateKey === input.edge.state,
        )
      : input.anchors.find((anchor) => anchor.nodeId === input.edge.target && anchor.kind === "flow-in");

  return targetAnchor ? { x: targetAnchor.x, y: targetAnchor.y } : null;
}

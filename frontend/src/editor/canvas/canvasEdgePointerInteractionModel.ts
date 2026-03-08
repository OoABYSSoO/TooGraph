export type CanvasEdgePointerDownEdge = {
  id: string;
  kind: string;
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

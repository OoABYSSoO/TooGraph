import type { PendingGraphConnection } from "../../lib/graph-connections.ts";
import type { GraphPosition, StateDefinition } from "../../types/node-system.ts";
import type { ProjectedCanvasAnchor } from "./edgeProjection.ts";
import { resolveCanvasConnectionStateValueType } from "./canvasConnectionInteractionModel.ts";

type StateSchemaLike = Record<string, Pick<StateDefinition, "type"> | undefined>;

export type CanvasConnectionCompletionAction =
  | {
      type: "connect-flow";
      payload: { sourceNodeId: string; targetNodeId: string };
    }
  | {
      type: "connect-state";
      payload: {
        sourceNodeId: string;
        sourceStateKey: string;
        targetNodeId: string;
        targetStateKey: string;
        position: GraphPosition;
      };
    }
  | {
      type: "connect-state-input-source";
      payload: {
        sourceNodeId: string;
        targetNodeId: string;
        targetStateKey: string;
        targetValueType?: string | null;
      };
    }
  | {
      type: "connect-route";
      payload: { sourceNodeId: string; branchKey: string; targetNodeId: string };
    }
  | {
      type: "reconnect-flow";
      payload: { sourceNodeId: string; currentTargetNodeId: string; nextTargetNodeId: string };
    }
  | {
      type: "reconnect-route";
      payload: { sourceNodeId: string; branchKey: string; nextTargetNodeId: string };
    };

type CanvasConnectionCompletionInput = {
  connection: PendingGraphConnection | null;
  targetAnchor: ProjectedCanvasAnchor;
  stateSchema: StateSchemaLike;
};

export type CanvasConnectionCompletionRequest = {
  action: CanvasConnectionCompletionAction | null;
  clearConnectionInteraction: true;
  clearSelectedEdge: true;
};

export function resolveCanvasConnectionCompletionAction(
  input: CanvasConnectionCompletionInput,
): CanvasConnectionCompletionAction | null {
  const { connection, targetAnchor } = input;
  if (!connection) {
    return null;
  }

  if (connection.mode === "reconnect") {
    if (connection.sourceKind === "route-out" && connection.branchKey) {
      return {
        type: "reconnect-route",
        payload: {
          sourceNodeId: connection.sourceNodeId,
          branchKey: connection.branchKey,
          nextTargetNodeId: targetAnchor.nodeId,
        },
      };
    }
    if (connection.currentTargetNodeId) {
      return {
        type: "reconnect-flow",
        payload: {
          sourceNodeId: connection.sourceNodeId,
          currentTargetNodeId: connection.currentTargetNodeId,
          nextTargetNodeId: targetAnchor.nodeId,
        },
      };
    }
    return null;
  }

  if (connection.sourceKind === "route-out" && connection.branchKey) {
    return {
      type: "connect-route",
      payload: {
        sourceNodeId: connection.sourceNodeId,
        branchKey: connection.branchKey,
        targetNodeId: targetAnchor.nodeId,
      },
    };
  }

  if (connection.sourceKind === "state-out" && connection.sourceStateKey && targetAnchor.stateKey) {
    return {
      type: "connect-state",
      payload: {
        sourceNodeId: connection.sourceNodeId,
        sourceStateKey: connection.sourceStateKey,
        targetNodeId: targetAnchor.nodeId,
        targetStateKey: targetAnchor.stateKey,
        position: { x: targetAnchor.x, y: targetAnchor.y },
      },
    };
  }

  if (
    connection.sourceKind === "state-in" &&
    connection.sourceStateKey &&
    targetAnchor.kind === "state-out" &&
    targetAnchor.stateKey
  ) {
    return {
      type: "connect-state",
      payload: {
        sourceNodeId: targetAnchor.nodeId,
        sourceStateKey: targetAnchor.stateKey,
        targetNodeId: connection.sourceNodeId,
        targetStateKey: connection.sourceStateKey,
        position: { x: targetAnchor.x, y: targetAnchor.y },
      },
    };
  }

  if (connection.sourceKind === "state-in" && connection.sourceStateKey) {
    return {
      type: "connect-state-input-source",
      payload: {
        sourceNodeId: targetAnchor.nodeId,
        targetNodeId: connection.sourceNodeId,
        targetStateKey: connection.sourceStateKey,
        targetValueType: resolveCanvasConnectionStateValueType(connection.sourceStateKey, input.stateSchema),
      },
    };
  }

  return {
    type: "connect-flow",
    payload: {
      sourceNodeId: connection.sourceNodeId,
      targetNodeId: targetAnchor.nodeId,
    },
  };
}

export function resolveCanvasConnectionCompletionRequest(
  input: CanvasConnectionCompletionInput,
): CanvasConnectionCompletionRequest | null {
  if (!input.connection) {
    return null;
  }

  return {
    action: resolveCanvasConnectionCompletionAction(input),
    clearConnectionInteraction: true,
    clearSelectedEdge: true,
  };
}

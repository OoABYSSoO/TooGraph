import test from "node:test";
import assert from "node:assert/strict";

import type { PendingGraphConnection } from "../../lib/graph-connections.ts";
import type { StateDefinition } from "../../types/node-system.ts";
import type { ProjectedCanvasAnchor } from "./edgeProjection.ts";
import {
  resolveCanvasConnectionCompletionAction,
  resolveCanvasConnectionCompletionRequest,
} from "./canvasConnectionCompletionModel.ts";

const stateSchema: Record<string, Pick<StateDefinition, "type">> = {
  answer: { type: "markdown" },
};

test("canvas connection completion model resolves reconnect actions", () => {
  assert.deepEqual(
    resolveCanvasConnectionCompletionAction({
      connection: {
        sourceNodeId: "router",
        sourceKind: "route-out",
        branchKey: "approved",
        mode: "reconnect",
        currentTargetNodeId: "oldTarget",
      },
      targetAnchor: flowAnchor("newTarget"),
      stateSchema,
    }),
    {
      type: "reconnect-route",
      payload: {
        sourceNodeId: "router",
        branchKey: "approved",
        nextTargetNodeId: "newTarget",
      },
    },
  );

  assert.deepEqual(
    resolveCanvasConnectionCompletionAction({
      connection: {
        sourceNodeId: "source",
        sourceKind: "flow-out",
        mode: "reconnect",
        currentTargetNodeId: "oldTarget",
      },
      targetAnchor: flowAnchor("newTarget"),
      stateSchema,
    }),
    {
      type: "reconnect-flow",
      payload: {
        sourceNodeId: "source",
        currentTargetNodeId: "oldTarget",
        nextTargetNodeId: "newTarget",
      },
    },
  );
});

test("canvas connection completion model resolves create connection actions", () => {
  assert.deepEqual(
    resolveCanvasConnectionCompletionAction({
      connection: {
        sourceNodeId: "router",
        sourceKind: "route-out",
        branchKey: "approved",
      },
      targetAnchor: flowAnchor("target"),
      stateSchema,
    }),
    {
      type: "connect-route",
      payload: {
        sourceNodeId: "router",
        branchKey: "approved",
        targetNodeId: "target",
      },
    },
  );

  assert.deepEqual(
    resolveCanvasConnectionCompletionAction({
      connection: {
        sourceNodeId: "writer",
        sourceKind: "state-out",
        sourceStateKey: "answer",
      },
      targetAnchor: stateAnchor("reader", "state-in", "answer", 240, 160),
      stateSchema,
    }),
    {
      type: "connect-state",
      payload: {
        sourceNodeId: "writer",
        sourceStateKey: "answer",
        targetNodeId: "reader",
        targetStateKey: "answer",
        position: { x: 240, y: 160 },
      },
    },
  );

  assert.deepEqual(
    resolveCanvasConnectionCompletionAction({
      connection: {
        sourceNodeId: "reader",
        sourceKind: "state-in",
        sourceStateKey: "answer",
      },
      targetAnchor: stateAnchor("writer", "state-out", "answer", 480, 160),
      stateSchema,
    }),
    {
      type: "connect-state",
      payload: {
        sourceNodeId: "writer",
        sourceStateKey: "answer",
        targetNodeId: "reader",
        targetStateKey: "answer",
        position: { x: 480, y: 160 },
      },
    },
  );

  assert.deepEqual(
    resolveCanvasConnectionCompletionAction({
      connection: {
        sourceNodeId: "reader",
        sourceKind: "state-in",
        sourceStateKey: "answer",
      },
      targetAnchor: flowAnchor("writer"),
      stateSchema,
    }),
    {
      type: "connect-state-input-source",
      payload: {
        sourceNodeId: "writer",
        targetNodeId: "reader",
        targetStateKey: "answer",
        targetValueType: "markdown",
      },
    },
  );

  assert.deepEqual(
    resolveCanvasConnectionCompletionAction({
      connection: {
        sourceNodeId: "source",
        sourceKind: "flow-out",
      },
      targetAnchor: flowAnchor("target"),
      stateSchema,
    }),
    {
      type: "connect-flow",
      payload: {
        sourceNodeId: "source",
        targetNodeId: "target",
      },
    },
  );
});

test("canvas connection completion model preserves no-op invalid reconnects", () => {
  const invalidReconnect: PendingGraphConnection = {
    sourceNodeId: "source",
    sourceKind: "flow-out",
    mode: "reconnect",
  };

  assert.equal(
    resolveCanvasConnectionCompletionAction({
      connection: null,
      targetAnchor: flowAnchor("target"),
      stateSchema,
    }),
    null,
  );
  assert.equal(
    resolveCanvasConnectionCompletionAction({
      connection: invalidReconnect,
      targetAnchor: flowAnchor("target"),
      stateSchema,
    }),
    null,
  );
});

test("canvas connection completion model resolves completion requests with cleanup policy", () => {
  assert.deepEqual(
    resolveCanvasConnectionCompletionRequest({
      connection: {
        sourceNodeId: "writer",
        sourceKind: "state-out",
        sourceStateKey: "answer",
      },
      targetAnchor: stateAnchor("reader", "state-in", "answer", 240, 160),
      stateSchema,
    }),
    {
      action: {
        type: "connect-state",
        payload: {
          sourceNodeId: "writer",
          sourceStateKey: "answer",
          targetNodeId: "reader",
          targetStateKey: "answer",
          position: { x: 240, y: 160 },
        },
      },
      clearConnectionInteraction: true,
      clearSelectedEdge: true,
    },
  );

  assert.deepEqual(
    resolveCanvasConnectionCompletionRequest({
      connection: {
        sourceNodeId: "source",
        sourceKind: "flow-out",
        mode: "reconnect",
      },
      targetAnchor: flowAnchor("target"),
      stateSchema,
    }),
    {
      action: null,
      clearConnectionInteraction: true,
      clearSelectedEdge: true,
    },
  );
  assert.equal(
    resolveCanvasConnectionCompletionRequest({
      connection: null,
      targetAnchor: flowAnchor("target"),
      stateSchema,
    }),
    null,
  );
});

function flowAnchor(nodeId: string): ProjectedCanvasAnchor {
  return {
    id: `${nodeId}:flow-in`,
    nodeId,
    kind: "flow-in",
    x: 320,
    y: 180,
    side: "left",
  };
}

function stateAnchor(
  nodeId: string,
  kind: "state-in" | "state-out",
  stateKey: string,
  x: number,
  y: number,
): ProjectedCanvasAnchor {
  return {
    id: `${nodeId}:${kind}:${stateKey}`,
    nodeId,
    kind,
    stateKey,
    x,
    y,
    side: kind === "state-in" ? "left" : "right",
  };
}

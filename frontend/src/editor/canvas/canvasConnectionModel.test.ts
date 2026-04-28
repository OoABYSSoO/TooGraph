import test from "node:test";
import assert from "node:assert/strict";

import type { PendingGraphConnection } from "../../lib/graph-connections.ts";
import {
  CREATE_AGENT_INPUT_STATE_KEY,
  VIRTUAL_ANY_INPUT_COLOR,
  VIRTUAL_ANY_INPUT_STATE_KEY,
  VIRTUAL_ANY_OUTPUT_COLOR,
  VIRTUAL_ANY_OUTPUT_STATE_KEY,
} from "../../lib/virtual-any-input.ts";
import { buildPendingConnectionPreviewPath } from "./connectionPreviewPath.ts";
import type { ProjectedCanvasAnchor } from "./edgeProjection.ts";
import {
  buildConnectionPreviewModel,
  buildPendingConnectionFromAnchor,
  isConcreteStateConnectionKey,
  isSamePendingConnection,
  resolveConnectionAccentColor,
  resolveConnectionPreviewStateKey,
  resolveConnectionSourceAnchorId,
  resolveSelectedReconnectConnection,
} from "./canvasConnectionModel.ts";

const flowOutAnchor: ProjectedCanvasAnchor = {
  id: "agent:flow-out",
  nodeId: "agent",
  kind: "flow-out",
  x: 100,
  y: 120,
  side: "right",
};

const routeOutAnchor: ProjectedCanvasAnchor = {
  id: "condition:route-out:true",
  nodeId: "condition",
  kind: "route-out",
  branch: "true",
  x: 300,
  y: 180,
  side: "right",
};

const stateOutAnchor: ProjectedCanvasAnchor = {
  id: "agent:state-out:answer",
  nodeId: "agent",
  kind: "state-out",
  stateKey: "answer",
  x: 180,
  y: 220,
  side: "right",
};

const stateInAnchor: ProjectedCanvasAnchor = {
  id: "output:state-in:answer",
  nodeId: "output",
  kind: "state-in",
  stateKey: "answer",
  x: 500,
  y: 240,
  side: "left",
};

test("canvas connection model identifies concrete state keys", () => {
  assert.equal(isConcreteStateConnectionKey("answer"), true);
  assert.equal(isConcreteStateConnectionKey(""), false);
  assert.equal(isConcreteStateConnectionKey(undefined), false);
  assert.equal(isConcreteStateConnectionKey(CREATE_AGENT_INPUT_STATE_KEY), false);
  assert.equal(isConcreteStateConnectionKey(VIRTUAL_ANY_INPUT_STATE_KEY), false);
  assert.equal(isConcreteStateConnectionKey(VIRTUAL_ANY_OUTPUT_STATE_KEY), false);
});

test("canvas connection model builds pending connections from start anchors", () => {
  assert.deepEqual(buildPendingConnectionFromAnchor(flowOutAnchor), {
    sourceNodeId: "agent",
    sourceKind: "flow-out",
  });
  assert.deepEqual(buildPendingConnectionFromAnchor(routeOutAnchor), {
    sourceNodeId: "condition",
    sourceKind: "route-out",
    branchKey: "true",
  });
  assert.deepEqual(buildPendingConnectionFromAnchor(stateOutAnchor), {
    sourceNodeId: "agent",
    sourceKind: "state-out",
    sourceStateKey: "answer",
  });
  assert.deepEqual(buildPendingConnectionFromAnchor(stateInAnchor), {
    sourceNodeId: "output",
    sourceKind: "state-in",
    sourceStateKey: "answer",
  });
  assert.equal(buildPendingConnectionFromAnchor({ ...routeOutAnchor, branch: undefined }), null);
  assert.equal(buildPendingConnectionFromAnchor({ ...stateOutAnchor, stateKey: undefined }), null);
  assert.equal(buildPendingConnectionFromAnchor({ ...flowOutAnchor, kind: "flow-in" }), null);
});

test("canvas connection model compares pending connection identity", () => {
  const base: PendingGraphConnection = {
    sourceNodeId: "agent",
    sourceKind: "state-out",
    sourceStateKey: "answer",
  };

  assert.equal(isSamePendingConnection(base, { ...base }), true);
  assert.equal(isSamePendingConnection(base, { ...base, sourceStateKey: "other" }), false);
  assert.equal(isSamePendingConnection({ ...base, branchKey: "true" }, { ...base, branchKey: "false" }), false);
  assert.equal(isSamePendingConnection(null, null), true);
});

test("canvas connection model resolves the active source anchor id", () => {
  const anchors = [flowOutAnchor, routeOutAnchor, stateOutAnchor, stateInAnchor];

  assert.equal(
    resolveConnectionSourceAnchorId({ sourceNodeId: "condition", sourceKind: "route-out", branchKey: "true" }, anchors),
    "condition:route-out:true",
  );
  assert.equal(
    resolveConnectionSourceAnchorId({ sourceNodeId: "agent", sourceKind: "state-out", sourceStateKey: "answer" }, anchors),
    "agent:state-out:answer",
  );
  assert.equal(
    resolveConnectionSourceAnchorId({ sourceNodeId: "condition", sourceKind: "route-out", branchKey: "false" }, anchors),
    null,
  );
  assert.equal(resolveConnectionSourceAnchorId(null, anchors), null);
});

test("canvas connection model resolves preview state keys and accent colors", () => {
  const stateSchema = {
    answer: { color: " #123456 " },
    blank: { color: "   " },
  };

  assert.equal(
    resolveConnectionPreviewStateKey({
      connection: { sourceNodeId: "agent", sourceKind: "state-out", sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY },
      autoSnappedTargetStateKey: "answer",
    }),
    "answer",
  );
  assert.equal(
    resolveConnectionPreviewStateKey({
      connection: { sourceNodeId: "agent", sourceKind: "state-in", sourceStateKey: VIRTUAL_ANY_INPUT_STATE_KEY },
      autoSnappedTargetStateKey: "answer",
    }),
    "answer",
  );
  assert.equal(
    resolveConnectionPreviewStateKey({
      connection: { sourceNodeId: "agent", sourceKind: "state-out", sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY },
      autoSnappedTargetStateKey: null,
    }),
    VIRTUAL_ANY_OUTPUT_STATE_KEY,
  );
  assert.equal(resolveConnectionPreviewStateKey({ connection: { sourceNodeId: "agent", sourceKind: "flow-out" } }), null);

  assert.equal(
    resolveConnectionAccentColor({
      connection: { sourceNodeId: "agent", sourceKind: "state-out", sourceStateKey: "answer" },
      previewStateKey: "answer",
      stateSchema,
    }),
    "#123456",
  );
  assert.equal(
    resolveConnectionAccentColor({
      connection: { sourceNodeId: "agent", sourceKind: "state-out", sourceStateKey: "blank" },
      previewStateKey: "blank",
      stateSchema,
    }),
    "#2563eb",
  );
  assert.equal(
    resolveConnectionAccentColor({
      connection: { sourceNodeId: "agent", sourceKind: "state-in", sourceStateKey: VIRTUAL_ANY_INPUT_STATE_KEY },
      previewStateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
      stateSchema,
    }),
    VIRTUAL_ANY_INPUT_COLOR,
  );
  assert.equal(
    resolveConnectionAccentColor({
      connection: { sourceNodeId: "agent", sourceKind: "state-out", sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY },
      previewStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
      stateSchema,
    }),
    VIRTUAL_ANY_OUTPUT_COLOR,
  );
  assert.equal(
    resolveConnectionAccentColor({
      connection: { sourceNodeId: "condition", sourceKind: "route-out", branchKey: "true" },
      previewStateKey: null,
      stateSchema,
    }),
    "#16a34a",
  );
  assert.equal(
    resolveConnectionAccentColor({
      connection: { sourceNodeId: "agent", sourceKind: "flow-out" },
      previewStateKey: null,
      stateSchema,
    }),
    "#c96b1f",
  );
});

test("canvas connection model builds preview models from source anchors and pointer points", () => {
  assert.equal(buildConnectionPreviewModel({ connection: null, pendingPoint: { x: 200, y: 240 }, sourceAnchor: flowOutAnchor }), null);
  assert.equal(buildConnectionPreviewModel({ connection: { sourceNodeId: "agent", sourceKind: "flow-out" }, pendingPoint: null, sourceAnchor: flowOutAnchor }), null);
  assert.equal(buildConnectionPreviewModel({ connection: { sourceNodeId: "agent", sourceKind: "flow-out" }, pendingPoint: { x: 200, y: 240 }, sourceAnchor: null }), null);

  assert.deepEqual(
    buildConnectionPreviewModel({
      connection: { sourceNodeId: "condition", sourceKind: "route-out", branchKey: "true" },
      pendingPoint: { x: 420, y: 300 },
      sourceAnchor: routeOutAnchor,
    }),
    {
      kind: "route",
      path: buildPendingConnectionPreviewPath({
        kind: "route-out",
        sourceX: 300,
        sourceY: 180,
        targetX: 420,
        targetY: 300,
      }),
    },
  );
  assert.deepEqual(
    buildConnectionPreviewModel({
      connection: { sourceNodeId: "output", sourceKind: "state-in", sourceStateKey: "answer" },
      pendingPoint: { x: 420, y: 300 },
      sourceAnchor: stateInAnchor,
    }),
    {
      kind: "data",
      path: buildPendingConnectionPreviewPath({
        kind: "state-in",
        sourceX: 500,
        sourceY: 240,
        targetX: 420,
        targetY: 300,
      }),
    },
  );
});

test("canvas connection model projects selected flow and route edges into reconnect connections", () => {
  const flowEdge = {
    id: "flow:agent->output",
    kind: "flow" as const,
    source: "agent",
    target: "output",
    path: "M 0 0 L 1 1",
  };
  const routeEdge = {
    id: "route:gate:true->output",
    kind: "route" as const,
    source: "gate",
    target: "output",
    branch: "true",
    path: "M 0 0 L 1 1",
  };
  const dataEdge = {
    id: "data:agent:answer->output",
    kind: "data" as const,
    source: "agent",
    target: "output",
    state: "answer",
    path: "M 0 0 L 1 1",
  };

  assert.deepEqual(
    resolveSelectedReconnectConnection({
      selectedEdgeId: "flow:agent->output",
      activeFlowEdgeDeleteConfirmId: null,
      edges: [flowEdge, routeEdge, dataEdge],
    }),
    {
      sourceNodeId: "agent",
      sourceKind: "flow-out",
      mode: "reconnect",
      currentTargetNodeId: "output",
    },
  );
  assert.deepEqual(
    resolveSelectedReconnectConnection({
      selectedEdgeId: "route:gate:true->output",
      activeFlowEdgeDeleteConfirmId: null,
      edges: [flowEdge, routeEdge, dataEdge],
    }),
    {
      sourceNodeId: "gate",
      sourceKind: "route-out",
      branchKey: "true",
      mode: "reconnect",
      currentTargetNodeId: "output",
    },
  );
  assert.equal(
    resolveSelectedReconnectConnection({
      selectedEdgeId: "data:agent:answer->output",
      activeFlowEdgeDeleteConfirmId: null,
      edges: [flowEdge, routeEdge, dataEdge],
    }),
    null,
  );
  assert.equal(
    resolveSelectedReconnectConnection({
      selectedEdgeId: "flow:agent->output",
      activeFlowEdgeDeleteConfirmId: "flow:agent->output",
      edges: [flowEdge, routeEdge],
    }),
    null,
  );
});

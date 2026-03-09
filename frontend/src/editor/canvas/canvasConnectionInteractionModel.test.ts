import test from "node:test";
import assert from "node:assert/strict";

import type { PendingGraphConnection } from "../../lib/graph-connections.ts";
import {
  CREATE_AGENT_INPUT_STATE_KEY,
  VIRTUAL_ANY_INPUT_STATE_KEY,
  VIRTUAL_ANY_OUTPUT_COLOR,
  VIRTUAL_ANY_OUTPUT_STATE_KEY,
} from "../../lib/virtual-any-input.ts";
import type { GraphPayload } from "../../types/node-system.ts";
import type { PendingStateInputSource } from "./canvasPendingStatePortModel.ts";
import type { ProjectedCanvasAnchor } from "./edgeProjection.ts";
import {
  buildCanvasNodeCreationMenuPayload,
  canCompleteCanvasAnchorConnection,
  resolveCanvasPendingConnectionCreationMenuAction,
  resolveCanvasPendingConnectionCreationMenuRequest,
  resolveCanvasAutoSnappedTargetAnchor,
  resolveCanvasAgentCreateInputTargetAnchor,
  resolveCanvasConnectionPointerUpAction,
  resolveCanvasConnectionStateValueType,
  resolveCanvasEligibleTargetAnchorForNodeBody,
  resolveCanvasConnectionPointerMoveRequest,
  resolveCanvasAnchorPointerDownAction,
  resolveCanvasDragOverDropEffect,
  resolveCanvasDoubleClickCreationAction,
  resolveCanvasDropCreationAction,
  resolveCanvasNodePointerDownConnectionAction,
} from "./canvasConnectionInteractionModel.ts";

const document: GraphPayload = {
  name: "Connection interactions",
  state_schema: {
    answer: { name: "answer", description: "", type: "markdown", value: "", color: "#2563eb" },
  },
  metadata: {},
  nodes: {
    writer: agentNode("Writer", ["answer"], []),
    target: agentNode("Target", [], ["answer"]),
  },
  edges: [],
  conditional_edges: [],
};

test("canvas connection interaction model resolves creation payloads without dropping virtual output state keys", () => {
  const payload = buildCanvasNodeCreationMenuPayload({
    connection: {
      sourceNodeId: "writer",
      sourceKind: "state-out",
      sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    },
    position: { x: 320, y: 180 },
    clientX: 900,
    clientY: 420,
    stateSchema: document.state_schema,
  });

  assert.deepEqual(payload, {
    position: { x: 320, y: 180 },
    sourceNodeId: "writer",
    sourceAnchorKind: "state-out",
    sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    sourceValueType: null,
    clientX: 900,
    clientY: 420,
  });
  assert.equal(resolveCanvasConnectionStateValueType("answer", document.state_schema), "markdown");
  assert.equal(resolveCanvasConnectionStateValueType(VIRTUAL_ANY_OUTPUT_STATE_KEY, document.state_schema), null);
});

test("canvas connection interaction model resolves empty-canvas double-click creation actions", () => {
  const payload = {
    position: { x: 120, y: 80 },
    clientX: 240,
    clientY: 180,
  };

  assert.deepEqual(
    resolveCanvasDoubleClickCreationAction({
      interactionLocked: true,
      isIgnoredTarget: false,
      ...payload,
    }),
    { type: "locked-edit-attempt" },
  );
  assert.deepEqual(
    resolveCanvasDoubleClickCreationAction({
      interactionLocked: false,
      isIgnoredTarget: true,
      ...payload,
    }),
    { type: "ignore-target" },
  );
  assert.deepEqual(
    resolveCanvasDoubleClickCreationAction({
      interactionLocked: false,
      isIgnoredTarget: false,
      ...payload,
    }),
    {
      type: "open-creation-menu",
      payload,
    },
  );
});

test("canvas connection interaction model resolves file-drop creation actions", () => {
  const file = { name: "workflow.md" } as File;
  const payload = {
    file,
    position: { x: 160, y: 90 },
    clientX: 260,
    clientY: 190,
  };

  assert.deepEqual(
    resolveCanvasDropCreationAction({
      interactionLocked: true,
      isIgnoredTarget: false,
      ...payload,
    }),
    { type: "locked-edit-attempt" },
  );
  assert.deepEqual(
    resolveCanvasDropCreationAction({
      interactionLocked: false,
      isIgnoredTarget: true,
      ...payload,
    }),
    { type: "ignore-target" },
  );
  assert.deepEqual(
    resolveCanvasDropCreationAction({
      interactionLocked: false,
      isIgnoredTarget: false,
      ...payload,
      file: null,
    }),
    { type: "ignore-missing-file" },
  );
  assert.deepEqual(
    resolveCanvasDropCreationAction({
      interactionLocked: false,
      isIgnoredTarget: false,
      ...payload,
    }),
    {
      type: "create-from-file",
      payload,
    },
  );
});

test("canvas connection interaction model resolves drag-over drop effects", () => {
  assert.equal(
    resolveCanvasDragOverDropEffect({
      interactionLocked: true,
      hasDraggedFiles: true,
    }),
    "none",
  );
  assert.equal(
    resolveCanvasDragOverDropEffect({
      interactionLocked: false,
      hasDraggedFiles: false,
    }),
    "none",
  );
  assert.equal(
    resolveCanvasDragOverDropEffect({
      interactionLocked: false,
      hasDraggedFiles: true,
    }),
    "copy",
  );
});

test("canvas connection interaction model resolves forward creation menu requests with cleanup policy", () => {
  const request = resolveCanvasPendingConnectionCreationMenuRequest({
    connection: {
      sourceNodeId: "writer",
      sourceKind: "state-out",
      sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    },
    position: { x: 320, y: 180 },
    clientX: 900,
    clientY: 420,
    stateSchema: document.state_schema,
  });

  assert.deepEqual(request, {
    payload: {
      position: { x: 320, y: 180 },
      sourceNodeId: "writer",
      sourceAnchorKind: "state-out",
      sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
      sourceValueType: null,
      clientX: 900,
      clientY: 420,
    },
    clearConnectionInteraction: true,
    clearSelectedEdge: true,
  });
});

test("canvas connection interaction model resolves reverse creation menu requests with cleanup policy", () => {
  const request = resolveCanvasPendingConnectionCreationMenuRequest({
    connection: {
      sourceNodeId: "target",
      sourceKind: "state-in",
      sourceStateKey: "answer",
    },
    position: { x: 160, y: 220 },
    clientX: 740,
    clientY: 480,
    stateSchema: document.state_schema,
  });

  assert.deepEqual(request, {
    payload: {
      position: { x: 160, y: 220 },
      targetNodeId: "target",
      targetAnchorKind: "state-in",
      targetStateKey: "answer",
      targetValueType: "markdown",
      clientX: 740,
      clientY: 480,
    },
    clearConnectionInteraction: true,
    clearSelectedEdge: true,
  });
});

test("canvas connection interaction model resolves pending creation menu actions", () => {
  const connection: PendingGraphConnection = {
    sourceNodeId: "writer",
    sourceKind: "state-out",
    sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
  };
  const request = {
    connection,
    position: { x: 320, y: 180 },
    clientX: 900,
    clientY: 420,
    stateSchema: document.state_schema,
  };

  assert.deepEqual(
    resolveCanvasPendingConnectionCreationMenuAction({
      ...request,
      interactionLocked: true,
    }),
    { type: "ignore-locked" },
  );
  assert.deepEqual(
    resolveCanvasPendingConnectionCreationMenuAction({
      ...request,
      interactionLocked: false,
      connection: null,
    }),
    { type: "ignore-missing-connection" },
  );
  assert.deepEqual(
    resolveCanvasPendingConnectionCreationMenuAction({
      ...request,
      interactionLocked: false,
    }),
    {
      type: "open-creation-menu",
      clearCanvasTransientState: true,
      payload: {
        position: { x: 320, y: 180 },
        sourceNodeId: "writer",
        sourceAnchorKind: "state-out",
        sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
        sourceValueType: null,
        clientX: 900,
        clientY: 420,
      },
      clearConnectionInteraction: true,
      clearSelectedEdge: true,
    },
  );
});

test("canvas connection interaction model ignores empty creation menu requests", () => {
  assert.equal(
    resolveCanvasPendingConnectionCreationMenuRequest({
      connection: null,
      position: { x: 0, y: 0 },
      clientX: 0,
      clientY: 0,
      stateSchema: document.state_schema,
    }),
    null,
  );
});

test("canvas connection interaction model resolves pointer-up routing actions", () => {
  const targetAnchor = flowAnchor("target", 440, 180);
  const connection: PendingGraphConnection = {
    sourceNodeId: "writer",
    sourceKind: "flow-out",
  };

  assert.equal(
    resolveCanvasConnectionPointerUpAction({
      connection: null,
      interactionLocked: false,
      autoSnappedTargetAnchor: targetAnchor,
    }),
    null,
  );
  assert.deepEqual(
    resolveCanvasConnectionPointerUpAction({
      connection,
      interactionLocked: true,
      autoSnappedTargetAnchor: targetAnchor,
    }),
    {
      type: "clear-connection-interaction",
    },
  );
  assert.deepEqual(
    resolveCanvasConnectionPointerUpAction({
      connection,
      interactionLocked: false,
      autoSnappedTargetAnchor: targetAnchor,
    }),
    {
      type: "complete-connection",
      targetAnchor,
    },
  );
  assert.deepEqual(
    resolveCanvasConnectionPointerUpAction({
      connection,
      interactionLocked: false,
      autoSnappedTargetAnchor: null,
    }),
    {
      type: "open-creation-menu",
    },
  );
});

test("canvas connection interaction model resolves node pointer-down connection actions", () => {
  const targetAnchor = flowAnchor("target", 440, 180);
  const connection: PendingGraphConnection = {
    sourceNodeId: "writer",
    sourceKind: "flow-out",
  };

  assert.equal(
    resolveCanvasNodePointerDownConnectionAction({
      connection: null,
      targetAnchor,
      preserveInlineEditorFocus: false,
    }),
    null,
  );
  assert.deepEqual(
    resolveCanvasNodePointerDownConnectionAction({
      connection,
      targetAnchor: null,
      preserveInlineEditorFocus: false,
    }),
    {
      type: "continue-node-pointer-down",
    },
  );
  assert.deepEqual(
    resolveCanvasNodePointerDownConnectionAction({
      connection,
      targetAnchor,
      preserveInlineEditorFocus: false,
    }),
    {
      type: "complete-connection",
      targetAnchor,
      preventDefault: true,
      focusCanvas: true,
    },
  );
  assert.deepEqual(
    resolveCanvasNodePointerDownConnectionAction({
      connection,
      targetAnchor,
      preserveInlineEditorFocus: true,
    }),
    {
      type: "complete-connection",
      targetAnchor,
      preventDefault: true,
      focusCanvas: false,
    },
  );
});

test("canvas connection interaction model resolves pointer-move preview requests", () => {
  const targetAnchor = flowAnchor("target", 440, 180);
  const connection: PendingGraphConnection = {
    sourceNodeId: "writer",
    sourceKind: "flow-out",
  };

  assert.equal(
    resolveCanvasConnectionPointerMoveRequest({
      connection: null,
      hoverNodeId: "target",
      targetAnchor,
      fallbackPoint: { x: 480, y: 240 },
    }),
    null,
  );
  assert.deepEqual(
    resolveCanvasConnectionPointerMoveRequest({
      connection,
      hoverNodeId: "target",
      targetAnchor,
      fallbackPoint: { x: 480, y: 240 },
    }),
    {
      hoverNodeId: "target",
      targetAnchor,
      fallbackPoint: { x: 480, y: 240 },
    },
  );
});

test("canvas connection interaction model resolves anchor pointer-down actions", () => {
  const targetAnchor = flowAnchor("target", 440, 180);
  const setupPolicy = {
    focusCanvas: true,
    clearCanvasTransientState: true,
    selectNodeId: "target",
  } as const;

  assert.deepEqual(
    resolveCanvasAnchorPointerDownAction({
      interactionLocked: true,
      anchor: targetAnchor,
      canComplete: true,
      canStart: true,
    }),
    { type: "locked-edit-attempt" },
  );
  assert.deepEqual(
    resolveCanvasAnchorPointerDownAction({
      interactionLocked: false,
      anchor: targetAnchor,
      canComplete: true,
      canStart: true,
    }),
    {
      type: "complete-connection",
      targetAnchor,
      ...setupPolicy,
    },
  );
  assert.deepEqual(
    resolveCanvasAnchorPointerDownAction({
      interactionLocked: false,
      anchor: targetAnchor,
      canComplete: false,
      canStart: false,
    }),
    {
      type: "ignore-anchor",
      ...setupPolicy,
    },
  );
  assert.deepEqual(
    resolveCanvasAnchorPointerDownAction({
      interactionLocked: false,
      anchor: targetAnchor,
      canComplete: false,
      canStart: true,
    }),
    {
      type: "start-or-toggle-connection",
      clearWindowSelection: true,
      ...setupPolicy,
    },
  );
});

test("canvas connection interaction model resolves canvas anchor completion eligibility", () => {
  const flowTarget = flowAnchor("target", 440, 180);
  const concreteInput = stateAnchor("target:answer", "target", "state-in", "answer", 206, 160);
  const invalidFlowForVirtualState = flowAnchor("target", 240, 200);
  const virtualOutputConnection: PendingGraphConnection = {
    sourceNodeId: "writer",
    sourceKind: "state-out",
    sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
  };
  let graphCompletionCalls = 0;

  assert.equal(
    canCompleteCanvasAnchorConnection({
      connection: virtualOutputConnection,
      anchor: invalidFlowForVirtualState,
      canCompleteGraphConnection: () => {
        graphCompletionCalls += 1;
        return true;
      },
    }),
    false,
  );
  assert.equal(graphCompletionCalls, 0);

  assert.equal(
    canCompleteCanvasAnchorConnection({
      connection: virtualOutputConnection,
      anchor: concreteInput,
      canCompleteGraphConnection: () => {
        graphCompletionCalls += 1;
        return false;
      },
    }),
    false,
  );
  assert.equal(graphCompletionCalls, 1);

  assert.equal(
    canCompleteCanvasAnchorConnection({
      connection: { sourceNodeId: "writer", sourceKind: "flow-out" },
      anchor: flowTarget,
      canCompleteGraphConnection: () => true,
    }),
    true,
  );
});

test("canvas connection interaction model builds fallback create-input anchors for virtual output snapping", () => {
  const pendingSource: PendingStateInputSource = {
    stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    label: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    stateColor: "#d97706",
  };
  const anchor = resolveCanvasAgentCreateInputTargetAnchor({
    nodeId: "target",
    node: document.nodes.target,
    pendingSource,
    projectedAnchors: [],
    baseProjectedAnchors: [
      stateAnchor("target:any-input", "target", "state-in", VIRTUAL_ANY_INPUT_STATE_KEY, 206, 150),
      stateAnchor("target:answer", "target", "state-in", "answer", 206, 194),
    ],
    measuredAnchorOffsets: {},
  });

  assert.deepEqual(anchor, {
    id: `target:state-in:${CREATE_AGENT_INPUT_STATE_KEY}`,
    nodeId: "target",
    kind: "state-in",
    x: 206,
    y: 150,
    side: "left",
    color: "#d97706",
    stateKey: CREATE_AGENT_INPUT_STATE_KEY,
  });
});

test("canvas connection interaction model prioritizes create-input snapping over existing inputs for virtual outputs", () => {
  const connection: PendingGraphConnection = {
    sourceNodeId: "writer",
    sourceKind: "state-out",
    sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
  };
  const pendingSource: PendingStateInputSource = {
    stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    label: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    stateColor: "#d97706",
  };
  const existingInput = stateAnchor("target:answer", "target", "state-in", "answer", 206, 194);

  const anchor = resolveCanvasEligibleTargetAnchorForNodeBody({
    connection,
    nodeId: "target",
    node: document.nodes.target,
    projectedAnchors: [existingInput],
    baseProjectedAnchors: [
      stateAnchor("target:any-input", "target", "state-in", VIRTUAL_ANY_INPUT_STATE_KEY, 206, 150),
      existingInput,
    ],
    measuredAnchorOffsets: {},
    measuredNodeSize: undefined,
    eligibleTargetAnchorIds: new Set([existingInput.id]),
    pendingAgentInputSource: pendingSource,
    canComplete: (candidate) => candidate.stateKey === CREATE_AGENT_INPUT_STATE_KEY || candidate.id === existingInput.id,
  });

  assert.equal(anchor?.stateKey, CREATE_AGENT_INPUT_STATE_KEY);
});

test("canvas connection interaction model builds fallback virtual outputs for reverse input snapping", () => {
  const connection: PendingGraphConnection = {
    sourceNodeId: "target",
    sourceKind: "state-in",
    sourceStateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
  };

  const anchor = resolveCanvasEligibleTargetAnchorForNodeBody({
    connection,
    nodeId: "writer",
    node: document.nodes.writer,
    projectedAnchors: [],
    baseProjectedAnchors: [],
    measuredAnchorOffsets: {},
    measuredNodeSize: { width: 500, height: 360 },
    eligibleTargetAnchorIds: new Set(),
    pendingAgentInputSource: null,
    canComplete: (candidate) => candidate.stateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY,
  });

  assert.deepEqual(anchor, {
    id: `writer:state-out:${VIRTUAL_ANY_OUTPUT_STATE_KEY}:reverse`,
    nodeId: "writer",
    kind: "state-out",
    x: 700,
    y: 88,
    side: "right",
    color: VIRTUAL_ANY_OUTPUT_COLOR,
    stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
  });
});

test("canvas connection interaction model resolves flow hotspot and node body auto-snaps", () => {
  const flowTarget = flowAnchor("target", 206, 120);
  const nodeBodyTarget = flowAnchor("target", 460, 220);

  assert.equal(
    resolveCanvasAutoSnappedTargetAnchor({
      connection: { sourceNodeId: "writer", sourceKind: "flow-out" },
      nodeIdAtPointer: "target",
      canvasPoint: { x: 188, y: 120 },
      flowAnchors: [flowTarget],
      projectedAnchors: [nodeBodyTarget],
      baseProjectedAnchors: [],
      nodes: document.nodes,
      measuredAnchorOffsets: {},
      measuredNodeSizes: {},
      eligibleTargetAnchorIds: new Set([flowTarget.id, nodeBodyTarget.id]),
      pendingAgentInputSourceByNodeId: {},
      canComplete: () => true,
    }),
    flowTarget,
  );

  assert.equal(
    resolveCanvasAutoSnappedTargetAnchor({
      connection: { sourceNodeId: "writer", sourceKind: "flow-out" },
      nodeIdAtPointer: "target",
      canvasPoint: { x: 320, y: 400 },
      flowAnchors: [flowTarget],
      projectedAnchors: [nodeBodyTarget],
      baseProjectedAnchors: [],
      nodes: document.nodes,
      measuredAnchorOffsets: {},
      measuredNodeSizes: {},
      eligibleTargetAnchorIds: new Set([nodeBodyTarget.id]),
      pendingAgentInputSourceByNodeId: {},
      canComplete: () => true,
    }),
    nodeBodyTarget,
  );
});

test("canvas connection interaction model resolves state auto-snaps from pointer rows and node bodies", () => {
  const concreteOutput = stateAnchor("writer:answer", "writer", "state-out", "answer", 660, 120);
  const virtualOutput = stateAnchor("writer:any-output", "writer", "state-out", VIRTUAL_ANY_OUTPUT_STATE_KEY, 660, 164);
  const concreteInput = stateAnchor("target:answer", "target", "state-in", "answer", 206, 160);
  const virtualInput = stateAnchor("target:any-input", "target", "state-in", VIRTUAL_ANY_INPUT_STATE_KEY, 206, 116);
  const pendingSource: PendingStateInputSource = {
    stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    label: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    stateColor: "#d97706",
  };

  assert.equal(
    resolveCanvasAutoSnappedTargetAnchor({
      connection: {
        sourceNodeId: "target",
        sourceKind: "state-in",
        sourceStateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
      },
      nodeIdAtPointer: "writer",
      canvasPoint: { x: 620, y: 120 },
      flowAnchors: [],
      projectedAnchors: [concreteOutput, virtualOutput],
      baseProjectedAnchors: [],
      nodes: document.nodes,
      measuredAnchorOffsets: {},
      measuredNodeSizes: { writer: { width: 500, height: 360 } },
      eligibleTargetAnchorIds: new Set(),
      pendingAgentInputSourceByNodeId: {},
      canComplete: (candidate) => candidate.id === concreteOutput.id || candidate.id === virtualOutput.id,
    }),
    concreteOutput,
  );

  const stateOutputTarget = resolveCanvasAutoSnappedTargetAnchor({
    connection: {
      sourceNodeId: "writer",
      sourceKind: "state-out",
      sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    },
    nodeIdAtPointer: "target",
    canvasPoint: { x: 240, y: 320 },
    flowAnchors: [],
    projectedAnchors: [concreteInput],
    baseProjectedAnchors: [virtualInput, concreteInput],
    nodes: document.nodes,
    measuredAnchorOffsets: {},
    measuredNodeSizes: {},
    eligibleTargetAnchorIds: new Set([concreteInput.id]),
    pendingAgentInputSourceByNodeId: { target: pendingSource },
    canComplete: (candidate) => candidate.stateKey === CREATE_AGENT_INPUT_STATE_KEY || candidate.id === concreteInput.id,
  });

  assert.equal(stateOutputTarget?.stateKey, CREATE_AGENT_INPUT_STATE_KEY);
});

function agentNode(name: string, writes: string[], reads: string[]) {
  return {
    kind: "agent" as const,
    name,
    description: "",
    ui: { position: { x: 200, y: 0 } },
    reads: reads.map((state) => ({ state })),
    writes: writes.map((state) => ({ state })),
    config: {
      skills: [],
      taskInstruction: "",
      modelSource: "global" as const,
      model: "",
      thinkingMode: "off" as const,
      temperature: 0.2,
    },
  };
}

function stateAnchor(
  id: string,
  nodeId: string,
  kind: "state-in" | "state-out",
  stateKey: string,
  x: number,
  y: number,
): ProjectedCanvasAnchor {
  return {
    id,
    nodeId,
    kind,
    stateKey,
    x,
    y,
    side: kind === "state-in" ? "left" : "right",
  };
}

function flowAnchor(nodeId: string, x: number, y: number): ProjectedCanvasAnchor {
  return {
    id: `${nodeId}:flow-in`,
    nodeId,
    kind: "flow-in",
    x,
    y,
    side: "left",
  };
}

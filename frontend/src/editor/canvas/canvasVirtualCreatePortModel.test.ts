import test from "node:test";
import assert from "node:assert/strict";

import type { GraphPayload } from "../../types/node-system.ts";
import {
  CREATE_AGENT_INPUT_STATE_KEY,
  VIRTUAL_ANY_INPUT_COLOR,
  VIRTUAL_ANY_INPUT_STATE_KEY,
  VIRTUAL_ANY_OUTPUT_COLOR,
  VIRTUAL_ANY_OUTPUT_STATE_KEY,
} from "../../lib/virtual-any-input.ts";
import type { ProjectedCanvasAnchor } from "./edgeProjection.ts";
import {
  buildTransientAgentCreateInputAnchors,
  buildTransientAgentInputAnchors,
  buildTransientAgentOutputAnchors,
  filterBaseProjectedAnchorsForVirtualCreatePorts,
  isAgentCreateInputAnchorVisible,
  isAgentCreateOutputAnchorVisible,
  shouldShowAgentCreateInputPortByDefault,
  shouldShowAgentCreateOutputPortByDefault,
} from "./canvasVirtualCreatePortModel.ts";

const document: GraphPayload = {
  name: "Virtual ports",
  state_schema: {
    selected_capability: {
      name: "selected_capability",
      description: "",
      type: "capability",
      value: { kind: "none" },
      color: "#2563eb",
    },
    dynamic_result: {
      name: "dynamic_result",
      description: "",
      type: "result_package",
      value: {},
      color: "#7c3aed",
      binding: {
        kind: "capability_result",
        nodeId: "dynamic_executor",
        fieldKey: "result_package",
        managed: true,
      },
    },
  },
  metadata: {},
  nodes: {
    empty_agent: agentNode("Empty", [], []),
    reading_agent: agentNode("Reader", [], ["answer"]),
    writing_agent: agentNode("Writer", ["answer"], []),
    dynamic_executor: agentNode("Dynamic", ["dynamic_result"], ["selected_capability"]),
    input: {
      kind: "input",
      name: "Input",
      description: "",
      ui: { position: { x: 200, y: 300 } },
      reads: [],
      writes: ["answer"].map((state) => ({ state })),
      config: { value: "" },
    },
  },
  edges: [],
  conditional_edges: [],
};

test("virtual create port model resolves default visibility by node shape", () => {
  assert.equal(shouldShowAgentCreateInputPortByDefault(document.nodes.empty_agent), true);
  assert.equal(shouldShowAgentCreateInputPortByDefault(document.nodes.reading_agent), false);
  assert.equal(shouldShowAgentCreateInputPortByDefault(document.nodes.input), false);
  assert.equal(shouldShowAgentCreateOutputPortByDefault(document.nodes.empty_agent), true);
  assert.equal(shouldShowAgentCreateOutputPortByDefault(document.nodes.writing_agent), false);
  assert.equal(shouldShowAgentCreateOutputPortByDefault(document.nodes.input), false);
});

test("virtual create port model hides output creation for dynamic capability executors", () => {
  assert.equal(
    shouldShowAgentCreateOutputPortByDefault(document.nodes.dynamic_executor, document.state_schema),
    false,
  );
  assert.equal(
    isAgentCreateOutputAnchorVisible({
      nodeId: "dynamic_executor",
      node: document.nodes.dynamic_executor,
      stateSchema: document.state_schema,
      selectedNodeId: "dynamic_executor",
    }),
    false,
  );
  assert.equal(
    isAgentCreateOutputAnchorVisible({
      nodeId: "dynamic_executor",
      node: document.nodes.dynamic_executor,
      stateSchema: document.state_schema,
      hoveredNodeId: "dynamic_executor",
    }),
    false,
  );
});

test("virtual create port model keeps virtual anchors visible while selected, hovered, or dragging from them", () => {
  assert.equal(
    isAgentCreateInputAnchorVisible({
      nodeId: "reading_agent",
      node: document.nodes.reading_agent,
      selectedNodeId: "reading_agent",
    }),
    true,
  );
  assert.equal(
    isAgentCreateInputAnchorVisible({
      nodeId: "reading_agent",
      node: document.nodes.reading_agent,
      pendingConnection: {
        sourceNodeId: "reading_agent",
        sourceKind: "state-in",
        sourceStateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
      },
    }),
    true,
  );
  assert.equal(isAgentCreateInputAnchorVisible({ nodeId: "reading_agent", node: document.nodes.reading_agent }), false);
  assert.equal(
    isAgentCreateOutputAnchorVisible({
      nodeId: "writing_agent",
      node: document.nodes.writing_agent,
      activeConnectionHoverNodeId: "writing_agent",
    }),
    true,
  );
});

test("virtual create port model filters and projects transient anchors", () => {
  const baseAnchors: ProjectedCanvasAnchor[] = [
    virtualInputAnchor("empty_agent"),
    virtualInputAnchor("reading_agent"),
    virtualOutputAnchor("writing_agent"),
  ];

  assert.deepEqual(
    filterBaseProjectedAnchorsForVirtualCreatePorts({
      anchors: baseAnchors,
      pendingAgentInputSourceByNodeId: { empty_agent: { stateKey: "answer", label: "Answer", stateColor: "#2563eb" } },
      isAgentCreateOutputAnchorVisible: (nodeId) => nodeId !== "writing_agent",
    }).map((anchor) => anchor.id),
    [`reading_agent:state-in:${VIRTUAL_ANY_INPUT_STATE_KEY}`],
  );

  const measuredAnchorOffsets = {
    [`reading_agent:state-in:${VIRTUAL_ANY_INPUT_STATE_KEY}`]: { offsetX: 10, offsetY: 20 },
    [`empty_agent:state-in:${CREATE_AGENT_INPUT_STATE_KEY}`]: { offsetX: 12, offsetY: 22 },
    [`writing_agent:state-out:${VIRTUAL_ANY_OUTPUT_STATE_KEY}`]: { offsetX: 30, offsetY: 40 },
  };

  assert.deepEqual(
    buildTransientAgentCreateInputAnchors({
      document,
      measuredAnchorOffsets,
      pendingAgentInputSourceByNodeId: {},
      isAgentCreateInputAnchorVisible: (nodeId) => nodeId === "reading_agent",
    }),
    [
      {
        id: `reading_agent:state-in:${VIRTUAL_ANY_INPUT_STATE_KEY}`,
        nodeId: "reading_agent",
        kind: "state-in",
        x: 110,
        y: 220,
        side: "left",
        color: VIRTUAL_ANY_INPUT_COLOR,
        stateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
      },
    ],
  );
  assert.deepEqual(
    buildTransientAgentInputAnchors({
      document,
      measuredAnchorOffsets,
      pendingAgentInputSourceByNodeId: { empty_agent: { stateKey: "answer", label: "Answer", stateColor: "#2563eb" } },
    }),
    [
      {
        id: `empty_agent:state-in:${CREATE_AGENT_INPUT_STATE_KEY}`,
        nodeId: "empty_agent",
        kind: "state-in",
        x: 12,
        y: 22,
        side: "left",
        color: "#2563eb",
        stateKey: CREATE_AGENT_INPUT_STATE_KEY,
      },
    ],
  );
  assert.deepEqual(
    buildTransientAgentOutputAnchors({
      document,
      measuredAnchorOffsets,
      isAgentCreateOutputAnchorVisible: (nodeId) => nodeId === "writing_agent",
    }),
    [
      {
        id: `writing_agent:state-out:${VIRTUAL_ANY_OUTPUT_STATE_KEY}`,
        nodeId: "writing_agent",
        kind: "state-out",
        x: 330,
        y: 440,
        side: "right",
        color: VIRTUAL_ANY_OUTPUT_COLOR,
        stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
      },
    ],
  );
});

function agentNode(name: string, writes: string[], reads: string[]) {
  return {
    kind: "agent" as const,
    name,
    description: "",
    ui: {
      position: name === "Reader" ? { x: 100, y: 200 } : name === "Writer" ? { x: 300, y: 400 } : { x: 0, y: 0 },
    },
    reads: reads.map((state) => ({ state })),
    writes: writes.map((state) => ({ state })),
    config: {
      skillKey: "",
      taskInstruction: "",
      modelSource: "global" as const,
      model: "",
      thinkingMode: "off" as const,
      temperature: 0.2,
    },
  };
}

function virtualInputAnchor(nodeId: string): ProjectedCanvasAnchor {
  return {
    id: `${nodeId}:state-in:${VIRTUAL_ANY_INPUT_STATE_KEY}`,
    nodeId,
    kind: "state-in",
    x: 0,
    y: 0,
    side: "left",
    stateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
  };
}

function virtualOutputAnchor(nodeId: string): ProjectedCanvasAnchor {
  return {
    id: `${nodeId}:state-out:${VIRTUAL_ANY_OUTPUT_STATE_KEY}`,
    nodeId,
    kind: "state-out",
    x: 0,
    y: 0,
    side: "right",
    stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
  };
}

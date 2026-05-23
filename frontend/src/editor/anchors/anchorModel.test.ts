import test from "node:test";
import assert from "node:assert/strict";

import { buildAnchorModel } from "./anchorModel.ts";
import { VIRTUAL_ANY_INPUT_STATE_KEY, VIRTUAL_ANY_OUTPUT_STATE_KEY } from "../../lib/virtual-any-input.ts";
import type { GraphNode } from "../../types/node-system.ts";

test("buildAnchorModel creates flow and state anchors for LLM nodes", () => {
  const node: GraphNode = {
    kind: "agent",
    name: "answer_helper",
    description: "Answer the user question.",
    ui: {
      position: { x: 520, y: 220 },
    },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      actionKey: "",
      taskInstruction: "请直接回答。",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };

  const model = buildAnchorModel("answer_helper", node);

  assert.equal(model.nodeId, "answer_helper");
  assert.equal(model.flowIn?.id, "flow-in");
  assert.equal(model.flowOut?.id, "flow-out");
  assert.equal(model.stateInputs.length, 1);
  assert.equal(model.stateOutputs.length, 1);
  assert.equal(model.stateInputs[0]?.stateKey, "question");
  assert.equal(model.stateOutputs[0]?.stateKey, "answer");
});

test("buildAnchorModel keeps managed tool input anchor ids stable when the bound state changes", () => {
  const slotNode: GraphNode = {
    kind: "tool",
    name: "segmenter",
    description: "Split videos.",
    ui: { position: { x: 520, y: 220 } },
    reads: [
      {
        state: "tool_video_slot",
        required: true,
        binding: {
          kind: "tool_input",
          toolKey: "video_segmenter",
          fieldKey: "video",
          managed: true,
        },
      },
    ],
    writes: [],
    config: { toolKey: "video_segmenter" },
  };
  const connectedNode: GraphNode = {
    ...slotNode,
    reads: [
      {
        ...slotNode.reads[0],
        state: "uploaded_video",
      },
    ],
  };

  const slotAnchor = buildAnchorModel("segmenter", slotNode).stateInputs[0];
  const connectedAnchor = buildAnchorModel("segmenter", connectedNode).stateInputs[0];

  assert.equal(slotAnchor?.id, "state-in:tool_input_video_segmenter_video");
  assert.equal(connectedAnchor?.id, slotAnchor?.id);
  assert.equal(slotAnchor?.stateKey, "tool_video_slot");
  assert.equal(connectedAnchor?.stateKey, "uploaded_video");
});

test("buildAnchorModel keeps managed action input anchor ids stable when the bound state changes", () => {
  const slotNode: GraphNode = {
    kind: "agent",
    name: "capability_selector",
    description: "Pick a capability.",
    ui: { position: { x: 520, y: 220 } },
    reads: [
      {
        state: "action_requirement_slot",
        required: true,
        binding: {
          kind: "action_input",
          actionKey: "toograph_capability_selector",
          fieldKey: "current_requirement",
          managed: true,
        },
      },
    ],
    writes: [],
    config: {
      actionKey: "toograph_capability_selector",
      taskInstruction: "Choose a capability.",
      modelSource: "global",
      model: "",
      thinkingMode: "high",
      temperature: 0.2,
    },
  };
  const connectedNode: GraphNode = {
    ...slotNode,
    reads: [
      {
        ...slotNode.reads[0],
        state: "requirement",
      },
    ],
  };

  const slotAnchor = buildAnchorModel("capability_selector", slotNode).stateInputs[0];
  const connectedAnchor = buildAnchorModel("capability_selector", connectedNode).stateInputs[0];

  assert.equal(slotAnchor?.id, "state-in:action_input_toograph_capability_selector_current_requirement");
  assert.equal(connectedAnchor?.id, slotAnchor?.id);
  assert.equal(slotAnchor?.stateKey, "action_requirement_slot");
  assert.equal(connectedAnchor?.stateKey, "requirement");
});

test("buildAnchorModel creates route outputs for condition nodes", () => {
  const node: GraphNode = {
    kind: "condition",
    name: "continue_check",
    description: "Continue or retry.",
    ui: {
      position: { x: 780, y: 220 },
    },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      branches: ["continue", "retry"],
      loopLimit: 5,
      branchMapping: {
        true: "continue",
        false: "retry",
      },
      rule: {
        source: "answer",
        operator: "exists",
        value: null,
      },
    },
  };

  const model = buildAnchorModel("continue_check", node);

  assert.equal(model.flowIn?.id, "flow-in");
  assert.equal(model.flowOut, null);
  assert.equal(model.routeOutputs.length, 2);
  assert.equal(model.routeOutputs[0]?.id, "branch:continue");
  assert.equal(model.routeOutputs[1]?.id, "branch:retry");
});

test("buildAnchorModel exposes a virtual any state input for non-input nodes without reads", () => {
  const emptyAgent: GraphNode = {
    kind: "agent",
    name: "empty_agent",
    description: "Blank agent.",
    ui: { position: { x: 520, y: 220 } },
    reads: [],
    writes: [],
    config: {
      actionKey: "",
      taskInstruction: "",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };
  const emptyOutput: GraphNode = {
    kind: "output",
    name: "output",
    description: "Preview output.",
    ui: { position: { x: 920, y: 220 } },
    reads: [],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };
  const inputNode: GraphNode = {
    kind: "input",
    name: "input",
    description: "Provide input.",
    ui: { position: { x: 80, y: 220 } },
    reads: [],
    writes: [{ state: "value", mode: "replace" }],
    config: {
      value: "",
    },
  };

  const agentModel = buildAnchorModel("empty_agent", emptyAgent);
  const outputModel = buildAnchorModel("output", emptyOutput);
  const inputModel = buildAnchorModel("input", inputNode);

  assert.deepEqual(agentModel.stateInputs.map((anchor) => anchor.stateKey), [VIRTUAL_ANY_INPUT_STATE_KEY]);
  assert.deepEqual(outputModel.stateInputs.map((anchor) => anchor.stateKey), [VIRTUAL_ANY_INPUT_STATE_KEY]);
  assert.deepEqual(inputModel.stateInputs, []);
});

test("buildAnchorModel exposes a virtual plus output for empty agent and input nodes without writes", () => {
  const emptyAgent: GraphNode = {
    kind: "agent",
    name: "empty_agent",
    description: "Blank agent.",
    ui: { position: { x: 520, y: 220 } },
    reads: [{ state: "question", required: true }],
    writes: [],
    config: {
      actionKey: "",
      taskInstruction: "",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };
  const outputNode: GraphNode = {
    kind: "output",
    name: "output",
    description: "Preview output.",
    ui: { position: { x: 920, y: 220 } },
    reads: [{ state: "question", required: true }],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };
  const emptyInput: GraphNode = {
    kind: "input",
    name: "empty_input",
    description: "Provide input.",
    ui: { position: { x: 80, y: 220 } },
    reads: [],
    writes: [],
    config: {
      value: "",
    },
  };

  const agentModel = buildAnchorModel("empty_agent", emptyAgent);
  const outputModel = buildAnchorModel("output", outputNode);
  const inputModel = buildAnchorModel("empty_input", emptyInput);

  assert.deepEqual(agentModel.stateOutputs.map((anchor) => anchor.stateKey), [VIRTUAL_ANY_OUTPUT_STATE_KEY]);
  assert.deepEqual(inputModel.stateOutputs.map((anchor) => anchor.stateKey), [VIRTUAL_ANY_OUTPUT_STATE_KEY]);
  assert.deepEqual(outputModel.stateOutputs, []);
});

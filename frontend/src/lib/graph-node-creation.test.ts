import test from "node:test";
import assert from "node:assert/strict";

import {
  applyNodeCreationResult,
  buildGenericInputNode,
  buildGenericOutputNode,
  buildNodeFromPreset,
} from "./graph-node-creation.ts";
import type { GraphPayload, PresetDocument } from "../types/node-system.ts";

test("buildGenericInputNode creates an expanded input node that writes a default value state", () => {
  const result = buildGenericInputNode({
    id: "input_created",
    position: { x: 120, y: 240 },
  });

  assert.equal(result.node.kind, "input");
  assert.equal(result.node.ui.position.x, 120);
  assert.equal(result.node.ui.collapsed, false);
  assert.equal("expandedSize" in result.node.ui, false);
  assert.equal("collapsedSize" in result.node.ui, false);
  assert.deepEqual(result.node.writes, [{ state: "value", mode: "replace" }]);
});

test("buildNodeFromPreset preserves preset node semantics while replacing the canvas position", () => {
  const preset: PresetDocument = {
    presetId: "preset.agent.empty.v0",
    sourcePresetId: null,
    createdAt: null,
    updatedAt: null,
    status: "active",
    definition: {
      label: "Empty Agent Node",
      description: "Blank agent node.",
      state_schema: {},
      node: {
        kind: "agent",
        name: "Empty Agent Node",
        description: "Blank agent node.",
        ui: {
          position: { x: 0, y: 0 },
          collapsed: false,
        },
        reads: [],
        writes: [],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
  };

  const result = buildNodeFromPreset(preset, {
    id: "agent_created",
    position: { x: 320, y: 180 },
  });

  assert.equal(result.node.kind, "agent");
  assert.equal(result.node.ui.position.x, 320);
  assert.equal(result.node.ui.position.y, 180);
  assert.equal(result.node.name, "Empty Agent Node");
});

test("applyNodeCreationResult auto-binds state outputs into a created output node and adds control flow", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Creation Graph",
    state_schema: {
      question: {
        name: "用户问题",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "什么是 GraphiteUI？",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const createdOutput = buildGenericOutputNode({
    id: "output_created",
    position: { x: 260, y: 0 },
  });
  const result = applyNodeCreationResult(document, {
    createdNodeId: createdOutput.id,
    createdNode: createdOutput.node,
    mergedStateSchema: createdOutput.state_schema,
    context: {
      position: { x: 260, y: 0 },
      sourceNodeId: "input_question",
      sourceAnchorKind: "state-out",
      sourceStateKey: "question",
      sourceValueType: "text",
    },
  });

  assert.deepEqual(result.document.nodes.output_created.reads, [{ state: "question", required: true }]);
  assert.equal(result.document.nodes.output_created.name, "用户问题");
  assert.deepEqual(result.document.edges, [{ source: "input_question", target: "output_created" }]);
});

test("applyNodeCreationResult auto-creates a read binding for blank agent presets when spawned from a state output", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Creation Graph",
    state_schema: {
      answer: {
        name: "answer",
        description: "",
        type: "text",
        value: "",
        color: "#2563eb",
      },
    },
    nodes: {
      answer_source: {
        kind: "agent",
        name: "answer_source",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const preset: PresetDocument = {
    presetId: "preset.agent.empty.v0",
    sourcePresetId: null,
    createdAt: null,
    updatedAt: null,
    status: "active",
    definition: {
      label: "Empty Agent Node",
      description: "Blank agent node.",
      state_schema: {},
      node: {
        kind: "agent",
        name: "Empty Agent Node",
        description: "Blank agent node.",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
  };

  const createdAgent = buildNodeFromPreset(preset, {
    id: "agent_created",
    position: { x: 240, y: 60 },
  });
  const result = applyNodeCreationResult(document, {
    createdNodeId: createdAgent.id,
    createdNode: createdAgent.node,
    mergedStateSchema: createdAgent.state_schema,
    context: {
      position: { x: 240, y: 60 },
      sourceNodeId: "answer_source",
      sourceAnchorKind: "state-out",
      sourceStateKey: "answer",
      sourceValueType: "text",
    },
  });

  assert.deepEqual(result.document.nodes.agent_created.reads, [{ state: "answer", required: true }]);
  assert.deepEqual(result.document.edges, [{ source: "answer_source", target: "agent_created" }]);
});

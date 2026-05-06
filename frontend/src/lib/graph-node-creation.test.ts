import test from "node:test";
import assert from "node:assert/strict";

import {
  applyNodeCreationResult,
  buildGenericInputNode,
  buildGenericOutputNode,
  buildNodeFromPreset,
  buildSubgraphNodeFromGraph,
  connectStateInputSourceToTarget,
} from "./graph-node-creation.ts";
import { VIRTUAL_ANY_INPUT_STATE_KEY, VIRTUAL_ANY_OUTPUT_STATE_KEY } from "./virtual-any-input.ts";
import type { GraphPayload, PresetDocument } from "../types/node-system.ts";

test("buildSubgraphNodeFromGraph exposes graph input and output boundaries as required parent ports", () => {
  const targetDocument: GraphPayload = {
    graph_id: null,
    name: "Parent",
    state_schema: {
      state_1: {
        name: "Existing",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: { graphiteui_state_key_counter: 1 },
  };
  const sourceGraph: GraphPayload = {
    graph_id: "graph_research",
    name: "Research Flow",
    state_schema: {
      question: {
        name: "Question",
        description: "Original graph input.",
        type: "text",
        value: "old default should be cleared",
        color: "#d97706",
      },
      answer: {
        name: "Answer",
        description: "Original graph output.",
        type: "markdown",
        value: "",
        color: "#2563eb",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "Question Input",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "old default should be cleared" },
      },
      output_answer: {
        kind: "output",
        name: "Answer Output",
        description: "",
        ui: { position: { x: 320, y: 0 }, collapsed: false },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [{ source: "input_question", target: "output_answer" }],
    conditional_edges: [],
    metadata: {},
  };

  const result = buildSubgraphNodeFromGraph(sourceGraph, {
    id: "subgraph_created",
    position: { x: 120, y: 80 },
    targetDocument,
  });

  assert.equal(result.node.kind, "subgraph");
  assert.equal(result.node.name, "Research Flow Subgraph");
  assert.deepEqual(result.node.reads, [{ state: "state_2", required: true }]);
  assert.deepEqual(result.node.writes, [{ state: "state_3", mode: "replace" }]);
  assert.equal(result.state_schema.state_2.name, "Question");
  assert.equal(result.state_schema.state_2.value, "");
  assert.equal(result.state_schema.state_3.name, "Answer");
  assert.equal(result.state_schema.state_3.type, "markdown");
  assert.equal(result.node.config.graph.state_schema.question.value, "");
  assert.equal(result.node.config.graph.metadata.sourceGraphId, "graph_research");
});

test("buildGenericInputNode creates an expanded input node with an empty virtual output slot", () => {
  const result = buildGenericInputNode({
    id: "input_created",
    position: { x: 120, y: 240 },
  });

  assert.equal(result.node.kind, "input");
  assert.equal(result.node.ui.position.x, 120);
  assert.equal(result.node.ui.collapsed, false);
  assert.equal("expandedSize" in result.node.ui, false);
  assert.equal("collapsedSize" in result.node.ui, false);
  assert.deepEqual(result.node.writes, []);
  assert.deepEqual(result.state_schema, {});
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

test("applyNodeCreationResult materializes a virtual agent any output when it spawns a target node", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Creation Graph",
    state_schema: {
      question: {
        name: "question",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      empty_agent: {
        kind: "agent",
        name: "Empty Agent",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [{ state: "question", required: true }],
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
    edges: [],
    conditional_edges: [],
    metadata: {
      graphiteui_state_key_counter: 2,
    },
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
      sourceNodeId: "empty_agent",
      sourceAnchorKind: "state-out",
      sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
      sourceValueType: "markdown",
    },
  });

  assert.equal(result.createdStateKey, "state_3");
  assert.deepEqual(result.document.nodes.empty_agent.writes, [{ state: "state_3", mode: "replace" }]);
  assert.deepEqual(result.document.nodes.output_created.reads, [{ state: "state_3", required: true }]);
  assert.equal(result.document.nodes.output_created.name, "state_3");
  assert.deepEqual(result.document.state_schema.state_3, {
    name: "state_3",
    description: "",
    type: "markdown",
    value: "",
    color: "#7c3aed",
  });
  assert.equal(result.document.metadata.graphiteui_state_key_counter, 3);
  assert.deepEqual(result.document.edges, [{ source: "empty_agent", target: "output_created" }]);
});

test("applyNodeCreationResult materializes a virtual input output when it spawns a target node", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Creation Graph",
    state_schema: {},
    nodes: {
      empty_input: {
        kind: "input",
        name: "Empty Input",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          value: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      graphiteui_state_key_counter: 4,
    },
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
      sourceNodeId: "empty_input",
      sourceAnchorKind: "state-out",
      sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
      sourceValueType: "text",
    },
  });

  assert.equal(result.createdStateKey, "state_5");
  assert.deepEqual(result.document.nodes.empty_input.writes, [{ state: "state_5", mode: "replace" }]);
  assert.deepEqual(result.document.nodes.output_created.reads, [{ state: "state_5", required: true }]);
  assert.equal(result.document.nodes.output_created.name, "state_5");
  assert.equal(result.document.state_schema.state_5?.name, "state_5");
  assert.equal(result.document.metadata.graphiteui_state_key_counter, 5);
  assert.deepEqual(result.document.edges, [{ source: "empty_input", target: "output_created" }]);
});

test("applyNodeCreationResult materializes skill virtual outputs with an empty skill list", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Creation Graph",
    state_schema: {},
    nodes: {
      empty_agent: {
        kind: "agent",
        name: "Empty Agent",
        description: "",
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
      sourceNodeId: "empty_agent",
      sourceAnchorKind: "state-out",
      sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
      sourceValueType: "skill",
    },
  });

  assert.equal(result.document.state_schema.state_1?.type, "skill");
  assert.deepEqual(result.document.state_schema.state_1?.value, []);
});

test("applyNodeCreationResult wires a created input node upstream of an existing concrete state input", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Creation Graph",
    state_schema: {
      question: {
        name: "question",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 240, y: 0 }, collapsed: false },
        reads: [{ state: "question", required: true }],
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
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const createdInput = buildGenericInputNode({
    id: "input_created",
    position: { x: 0, y: 0 },
  });
  const result = applyNodeCreationResult(document, {
    createdNodeId: createdInput.id,
    createdNode: createdInput.node,
    mergedStateSchema: createdInput.state_schema,
    context: {
      position: { x: 0, y: 0 },
      targetNodeId: "answer_helper",
      targetAnchorKind: "state-in",
      targetStateKey: "question",
      targetValueType: "text",
    },
  });

  assert.equal(result.createdStateKey, null);
  assert.deepEqual(result.document.nodes.input_created.writes, [{ state: "question", mode: "replace" }]);
  assert.deepEqual(result.document.nodes.answer_helper.reads, [{ state: "question", required: true }]);
  assert.deepEqual(result.document.edges, [{ source: "input_created", target: "answer_helper" }]);
});

test("applyNodeCreationResult materializes a virtual target input when creating an upstream node", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Creation Graph",
    state_schema: {},
    nodes: {
      empty_agent: {
        kind: "agent",
        name: "Empty Agent",
        description: "",
        ui: { position: { x: 240, y: 0 }, collapsed: false },
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
    edges: [],
    conditional_edges: [],
    metadata: {
      graphiteui_state_key_counter: 2,
    },
  };

  const createdInput = buildGenericInputNode({
    id: "input_created",
    position: { x: 0, y: 0 },
  });
  const result = applyNodeCreationResult(document, {
    createdNodeId: createdInput.id,
    createdNode: createdInput.node,
    mergedStateSchema: createdInput.state_schema,
    context: {
      position: { x: 0, y: 0 },
      targetNodeId: "empty_agent",
      targetAnchorKind: "state-in",
      targetStateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
      targetValueType: "markdown",
    },
  });

  assert.equal(result.createdStateKey, "state_3");
  assert.deepEqual(result.document.nodes.input_created.writes, [{ state: "state_3", mode: "replace" }]);
  assert.deepEqual(result.document.nodes.empty_agent.reads, [{ state: "state_3", required: true }]);
  assert.deepEqual(result.document.state_schema.state_3, {
    name: "state_3",
    description: "",
    type: "markdown",
    value: "",
    color: "#7c3aed",
  });
  assert.equal(result.document.metadata.graphiteui_state_key_counter, 3);
  assert.deepEqual(result.document.edges, [{ source: "input_created", target: "empty_agent" }]);
});

test("connectStateInputSourceToTarget wires an empty input node upstream of a concrete state input", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Creation Graph",
    state_schema: {
      question: {
        name: "question",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      empty_input: {
        kind: "input",
        name: "Empty Input",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          value: "",
        },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 240, y: 0 }, collapsed: false },
        reads: [{ state: "question", required: true }],
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
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const result = connectStateInputSourceToTarget(document, {
    sourceNodeId: "empty_input",
    targetNodeId: "answer_helper",
    targetStateKey: "question",
    targetValueType: "text",
  });

  assert.equal(result.createdStateKey, null);
  assert.deepEqual(result.document.nodes.empty_input.writes, [{ state: "question", mode: "replace" }]);
  assert.deepEqual(result.document.nodes.answer_helper.reads, [{ state: "question", required: true }]);
  assert.deepEqual(result.document.edges, [{ source: "empty_input", target: "answer_helper" }]);
});

test("connectStateInputSourceToTarget preserves previous same-state source edges for a concrete state input", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Replace Reverse Creation Graph",
    state_schema: {
      question: {
        name: "question",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      original_input: {
        kind: "input",
        name: "Original Input",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "",
        },
      },
      empty_input: {
        kind: "input",
        name: "Empty Input",
        description: "",
        ui: { position: { x: 0, y: 120 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          value: "",
        },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 240, y: 0 }, collapsed: false },
        reads: [{ state: "question", required: true }],
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
    edges: [{ source: "original_input", target: "answer_helper" }],
    conditional_edges: [],
    metadata: {},
  };

  const result = connectStateInputSourceToTarget(document, {
    sourceNodeId: "empty_input",
    targetNodeId: "answer_helper",
    targetStateKey: "question",
    targetValueType: "text",
  });

  assert.deepEqual(result.document.nodes.empty_input.writes, [{ state: "question", mode: "replace" }]);
  assert.deepEqual(result.document.nodes.answer_helper.reads, [{ state: "question", required: true }]);
  assert.deepEqual(result.document.edges, [
    { source: "original_input", target: "answer_helper" },
    { source: "empty_input", target: "answer_helper" },
  ]);
  assert.deepEqual(document.edges, [{ source: "original_input", target: "answer_helper" }]);
});

test("connectStateInputSourceToTarget materializes a virtual input through an existing agent writer", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Creation Graph",
    state_schema: {
      draft: {
        name: "draft",
        description: "",
        type: "text",
        value: "",
        color: "#2563eb",
      },
    },
    nodes: {
      writer_agent: {
        kind: "agent",
        name: "Writer Agent",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [{ state: "draft", mode: "replace" }],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      empty_agent: {
        kind: "agent",
        name: "Empty Agent",
        description: "",
        ui: { position: { x: 240, y: 0 }, collapsed: false },
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
    edges: [],
    conditional_edges: [],
    metadata: {
      graphiteui_state_key_counter: 2,
    },
  };

  const result = connectStateInputSourceToTarget(document, {
    sourceNodeId: "writer_agent",
    targetNodeId: "empty_agent",
    targetStateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
    targetValueType: "markdown",
  });

  assert.equal(result.createdStateKey, "state_3");
  assert.deepEqual(result.document.nodes.writer_agent.writes, [
    { state: "draft", mode: "replace" },
    { state: "state_3", mode: "replace" },
  ]);
  assert.deepEqual(result.document.nodes.empty_agent.reads, [{ state: "state_3", required: true }]);
  assert.deepEqual(result.document.state_schema.state_3, {
    name: "state_3",
    description: "",
    type: "markdown",
    value: "",
    color: "#7c3aed",
  });
  assert.deepEqual(result.document.edges, [{ source: "writer_agent", target: "empty_agent" }]);
});

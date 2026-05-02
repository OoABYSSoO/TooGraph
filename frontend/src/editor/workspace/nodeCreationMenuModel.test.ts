import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCreatedStateEdgeEditorRequest,
  buildClosedNodeCreationMenuState,
  buildNodeCreationEntries,
  buildOpenNodeCreationMenuState,
  buildUpdatedNodeCreationMenuQuery,
  supportsCreationSourceType,
} from "./nodeCreationMenuModel.ts";
import type { NodeCreationContext, NodeCreationEntry, PresetDocument } from "@/types/node-system";

const builtins: NodeCreationEntry[] = [
  {
    id: "node-input",
    family: "input",
    label: "Input",
    description: "Create a workflow input boundary.",
    mode: "node",
    origin: "builtin",
    nodeKind: "input",
  },
  {
    id: "node-output",
    family: "output",
    label: "Output",
    description: "Create a workflow output boundary.",
    mode: "node",
    origin: "builtin",
    nodeKind: "output",
  },
  {
    id: "preset-agent-empty",
    family: "agent",
    label: "Empty Agent Node",
    description: "Blank agent node.",
    mode: "preset",
    origin: "builtin",
    presetId: "preset.agent.empty.v0",
  },
  {
    id: "preset-condition-empty",
    family: "condition",
    label: "Condition Node",
    description: "Branch based on state.",
    mode: "preset",
    origin: "builtin",
    presetId: "preset.condition.empty.v0",
  },
];

const presets: PresetDocument[] = [
  {
    presetId: "preset.agent.answer_text",
    sourcePresetId: null,
    createdAt: null,
    updatedAt: null,
    status: "active",
    definition: {
      label: "Answer Text",
      description: "Answer a text question.",
      state_schema: {
        question: {
          name: "question",
          description: "",
          type: "text",
          value: "",
          color: "#d97706",
        },
      },
      node: {
        kind: "agent",
        name: "answer_text",
        description: "Answer a text question.",
        ui: { position: { x: 0, y: 0 } },
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
  },
  {
    presetId: "preset.agent.lookup_kb",
    sourcePresetId: null,
    createdAt: null,
    updatedAt: null,
    status: "active",
    definition: {
      label: "Lookup KB",
      description: "Read from a knowledge base.",
      state_schema: {
        query: {
          name: "query",
          description: "",
          type: "text",
          value: "",
          color: "#2563eb",
        },
        knowledge_base: {
          name: "knowledge_base",
          description: "",
          type: "knowledge_base",
          value: "",
          color: "#16a34a",
        },
      },
      node: {
        kind: "agent",
        name: "lookup_kb",
        description: "Read from a knowledge base.",
        ui: { position: { x: 0, y: 0 } },
        reads: [
          { state: "query", required: true },
          { state: "knowledge_base", required: true },
        ],
        writes: [],
        config: {
          skills: ["web_search"],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
  },
];

test("buildNodeCreationEntries keeps node entries ahead of persisted presets within family order", () => {
  const entries = buildNodeCreationEntries({
    builtins: [...builtins],
    presets: [...presets],
    query: "",
    sourceValueType: null,
  });

  assert.deepEqual(
    entries.map((entry) => entry.id),
    [
      "node-input",
      "node-output",
      "preset-agent-empty",
      "preset-preset.agent.answer_text",
      "preset-preset.agent.lookup_kb",
      "preset-condition-empty",
    ],
  );
});

test("buildNodeCreationEntries filters creation candidates by query and source type", () => {
  const entries = buildNodeCreationEntries({
    builtins: [...builtins],
    presets: [...presets],
    query: "lookup",
    sourceValueType: "knowledge_base",
  });

  assert.deepEqual(entries.map((entry) => entry.id), ["preset-preset.agent.lookup_kb"]);
});

test("buildNodeCreationEntries excludes input nodes when creation starts from a connection", () => {
  const entries = buildNodeCreationEntries({
    builtins: [...builtins],
    presets: [...presets],
    query: "",
    sourceValueType: null,
    sourceAnchorKind: "flow-out",
  });

  assert.ok(entries.every((entry) => entry.family !== "input"));
});

test("buildNodeCreationEntries limits reverse input drags to upstream writer nodes", () => {
  const entries = buildNodeCreationEntries({
    builtins: [...builtins],
    presets: [...presets],
    query: "",
    sourceValueType: "text",
    sourceAnchorKind: "state-in",
  });

  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["node-input", "preset-agent-empty", "preset-preset.agent.answer_text", "preset-preset.agent.lookup_kb"],
  );
});

test("supportsCreationSourceType rejects text-only agent presets for knowledge base outputs", () => {
  const textPresetEntry: NodeCreationEntry = {
    id: "preset-preset.agent.answer_text",
    family: "agent",
    label: "Answer Text",
    description: "Answer a text question.",
    mode: "preset",
    origin: "persisted",
    presetId: "preset.agent.answer_text",
    acceptsValueTypes: ["text"],
  };

  assert.equal(supportsCreationSourceType(textPresetEntry, "knowledge_base"), false);
  assert.equal(supportsCreationSourceType(textPresetEntry, "text"), true);
  assert.equal(supportsCreationSourceType(builtins[0], null, "flow-out"), false);
  assert.equal(supportsCreationSourceType(builtins[0], "text", "state-in"), true);
  assert.equal(supportsCreationSourceType(builtins[1], "text", "state-in"), false);
});

test("buildOpenNodeCreationMenuState preserves creation context and pointer position", () => {
  const context: NodeCreationContext = {
    position: { x: 240, y: 120 },
    clientX: 760,
    clientY: 410,
    sourceNodeId: "agent_a",
    sourceAnchorKind: "state-out",
    sourceStateKey: "answer",
    sourceValueType: "text",
  };

  assert.deepEqual(buildOpenNodeCreationMenuState(context), {
    open: true,
    context,
    position: { x: 760, y: 410 },
    query: "",
  });
});

test("buildOpenNodeCreationMenuState falls back to anchored menu positioning when client coordinates are absent", () => {
  const context: NodeCreationContext = {
    position: { x: 120, y: 80 },
    targetNodeId: "agent_b",
    targetAnchorKind: "state-in",
    targetStateKey: "question",
    targetValueType: "text",
  };

  assert.deepEqual(buildOpenNodeCreationMenuState(context), {
    open: true,
    context,
    position: null,
    query: "",
  });
});

test("buildUpdatedNodeCreationMenuQuery keeps the current context and popup position", () => {
  const context: NodeCreationContext = {
    position: { x: 120, y: 80 },
    sourceNodeId: "agent_a",
    sourceAnchorKind: "flow-out",
  };
  const currentState = buildOpenNodeCreationMenuState({
    ...context,
    clientX: 440,
    clientY: 300,
  });

  assert.deepEqual(buildUpdatedNodeCreationMenuQuery(currentState, "agent"), {
    ...currentState,
    query: "agent",
  });
});

test("buildUpdatedNodeCreationMenuQuery creates a closed query state when no menu is active", () => {
  assert.deepEqual(buildUpdatedNodeCreationMenuQuery(null, "input"), {
    open: false,
    context: null,
    position: null,
    query: "input",
  });
});

test("buildClosedNodeCreationMenuState resets all transient creation menu context", () => {
  assert.deepEqual(buildClosedNodeCreationMenuState(), {
    open: false,
    context: null,
    position: null,
    query: "",
  });
});

test("buildCreatedStateEdgeEditorRequest opens a created downstream node from the source context", () => {
  const context: NodeCreationContext = {
    position: { x: 320, y: 180 },
    sourceNodeId: "agent_a",
    sourceAnchorKind: "state-out",
    sourceStateKey: "answer",
  };

  assert.deepEqual(
    buildCreatedStateEdgeEditorRequest(context, { createdNodeId: "created_output", createdStateKey: "generated_answer" }, 12345),
    {
      requestId: "agent_a:generated_answer:created_output:12345",
      sourceNodeId: "agent_a",
      targetNodeId: "created_output",
      stateKey: "generated_answer",
      position: { x: 320, y: 180 },
    },
  );
});

test("buildCreatedStateEdgeEditorRequest opens a created upstream node from the target context", () => {
  const context: NodeCreationContext = {
    position: { x: 140, y: 90 },
    targetNodeId: "agent_b",
    targetAnchorKind: "state-in",
    targetStateKey: "question",
  };

  assert.deepEqual(
    buildCreatedStateEdgeEditorRequest(context, { createdNodeId: "created_input", createdStateKey: "created_question" }, 67890),
    {
      requestId: "created_input:created_question:agent_b:67890",
      sourceNodeId: "created_input",
      targetNodeId: "agent_b",
      stateKey: "created_question",
      position: { x: 140, y: 90 },
    },
  );
});

test("buildCreatedStateEdgeEditorRequest ignores creations without an editable state edge", () => {
  assert.equal(
    buildCreatedStateEdgeEditorRequest(
      {
        position: { x: 10, y: 20 },
        sourceNodeId: "agent_a",
        sourceAnchorKind: "flow-out",
      },
      { createdNodeId: "agent_b", createdStateKey: null },
      1,
    ),
    null,
  );
});

test("buildCreatedStateEdgeEditorRequest ignores incomplete creation endpoints", () => {
  assert.equal(
    buildCreatedStateEdgeEditorRequest(
      {
        position: { x: 10, y: 20 },
      },
      { createdNodeId: "agent_b", createdStateKey: "answer" },
      1,
    ),
    null,
  );
});

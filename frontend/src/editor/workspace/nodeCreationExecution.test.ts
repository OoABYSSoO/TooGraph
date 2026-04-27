import test from "node:test";
import assert from "node:assert/strict";

import { createNodeFromCreationEntry, createNodeFromDroppedFile } from "./nodeCreationExecution.ts";
import type { GraphPayload, NodeCreationEntry } from "@/types/node-system";

function createBaseDocument(): GraphPayload {
  return {
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
      branch_gate: {
        kind: "condition",
        name: "branch_gate",
        description: "",
        ui: { position: { x: 180, y: 0 }, collapsed: false },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          branches: ["true", "false"],
          loopLimit: -1,
          branchMapping: { true: "true", false: "false" },
          rule: {
            source: "question",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

test("createNodeFromCreationEntry builds the builtin empty agent preset and auto-wires state + flow", () => {
  const document = createBaseDocument();
  const entry: NodeCreationEntry = {
    id: "preset-agent-empty",
    family: "agent",
    label: "Empty Agent Node",
    description: "Blank agent node.",
    mode: "preset",
    origin: "builtin",
    presetId: "preset.agent.empty.v0",
    acceptsValueTypes: null,
  };

  const result = createNodeFromCreationEntry(document, {
    entry,
    createdNodeId: "agent_created",
    persistedPresets: [],
    context: {
      position: { x: 320, y: 80 },
      sourceNodeId: "input_question",
      sourceAnchorKind: "state-out",
      sourceStateKey: "question",
      sourceValueType: "text",
    },
  });

  assert.equal(result.createdNodeId, "agent_created");
  assert.equal(result.document.nodes.agent_created.kind, "agent");
  assert.deepEqual(result.document.nodes.agent_created.reads, [{ state: "question", required: true }]);
  assert.deepEqual(result.document.edges, [{ source: "input_question", target: "agent_created" }]);
});

test("createNodeFromCreationEntry creates input boundary states with neutral system keys", () => {
  const document = {
    ...createBaseDocument(),
    metadata: {
      graphiteui_state_key_counter: 7,
    },
  };
  const entry: NodeCreationEntry = {
    id: "node-input",
    family: "input",
    label: "Input",
    description: "Create a workflow input boundary.",
    mode: "node",
    origin: "builtin",
    nodeKind: "input",
    acceptsValueTypes: null,
  };

  const result = createNodeFromCreationEntry(document, {
    entry,
    createdNodeId: "input_created",
    persistedPresets: [],
    context: {
      position: { x: 120, y: 160 },
    },
  });

  assert.deepEqual(result.document.nodes.input_created.writes, [{ state: "state_8", mode: "replace" }]);
  assert.equal(result.document.state_schema.state_8?.name, "Input");
  assert.equal(result.document.metadata.graphiteui_state_key_counter, 8);
});

test("createNodeFromCreationEntry builds the builtin condition preset and auto-wires route edges", () => {
  const document = createBaseDocument();
  const entry: NodeCreationEntry = {
    id: "preset-condition-empty",
    family: "condition",
    label: "Condition Node",
    description: "Branch based on state.",
    mode: "preset",
    origin: "builtin",
    presetId: "preset.condition.empty.v0",
    acceptsValueTypes: null,
  };

  const result = createNodeFromCreationEntry(document, {
    entry,
    createdNodeId: "condition_created",
    persistedPresets: [],
    context: {
      position: { x: 460, y: 60 },
      sourceNodeId: "branch_gate",
      sourceAnchorKind: "route-out",
      sourceBranchKey: "true",
    },
  });

  assert.equal(result.createdNodeId, "condition_created");
  assert.equal(result.document.nodes.condition_created.kind, "condition");
  assert.equal(
    result.document.nodes.condition_created.kind === "condition"
      ? result.document.nodes.condition_created.config.loopLimit
      : null,
    5,
  );
  assert.deepEqual(result.document.conditional_edges, [
    {
      source: "branch_gate",
      branches: {
        true: "condition_created",
      },
    },
  ]);
});

test("createNodeFromDroppedFile builds an input node from the uploaded asset envelope", async () => {
  const document = createBaseDocument();
  const file = new File(["fake-png"], "diagram.png", { type: "image/png" });

  const result = await createNodeFromDroppedFile(document, {
    file,
    position: { x: 140, y: 200 },
    createdNodeId: "input_file_created",
  });

  assert.equal(result.createdNodeId, "input_file_created");
  assert.equal(result.document.nodes.input_file_created.kind, "input");
  assert.deepEqual(result.document.nodes.input_file_created.writes, [{ state: "state_1", mode: "replace" }]);
  assert.equal(result.document.state_schema.state_1?.name, "diagram.png");
  assert.equal(result.document.state_schema.state_1?.type, "image");
  assert.equal(result.document.metadata.graphiteui_state_key_counter, 1);
  assert.match(String(result.document.nodes.input_file_created.config.value), /"kind":"uploaded_file"/);
  assert.match(String(result.document.nodes.input_file_created.config.value), /"encoding":"data_url"/);
});

import test from "node:test";
import assert from "node:assert/strict";

import { createNodeFromCreationEntry, createNodeFromDroppedFile } from "./nodeCreationExecution.ts";
import type { GraphPayload, NodeCreationEntry, TemplateRecord } from "@/types/node-system";

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
          value: "什么是 TooGraph？",
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

function createSubgraphTemplate(): TemplateRecord {
  return {
    template_id: "template_research",
    label: "Research Template",
    description: "Reusable research template.",
    default_graph_name: "Research Flow",
    source: "official",
    state_schema: {
      topic: {
        name: "Topic",
        description: "Research topic.",
        type: "text",
        value: "old topic",
        color: "#d97706",
      },
      answer: {
        name: "Answer",
        description: "Research answer.",
        type: "markdown",
        value: "",
        color: "#2563eb",
      },
    },
    nodes: {
      input_topic: {
        kind: "input",
        name: "Topic Input",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "topic", mode: "replace" }],
        config: { value: "old topic", boundaryType: "text" },
      },
      output_answer: {
        kind: "output",
        name: "Answer Output",
        description: "",
        ui: { position: { x: 320, y: 0 } },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: false,
          persistFormat: "md",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

test("createNodeFromCreationEntry builds the builtin empty agent preset and auto-wires input state + flow", () => {
  const document = createBaseDocument();
  const entry: NodeCreationEntry = {
    id: "preset-agent-empty",
    family: "agent",
    label: "Empty LLM Node",
    description: "Blank one-turn LLM node.",
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
  assert.equal(result.document.nodes.agent_created.kind === "agent" ? result.document.nodes.agent_created.config.thinkingMode : null, "high");
  assert.deepEqual(result.document.nodes.agent_created.reads, [{ state: "question", required: true }]);
  assert.deepEqual(result.document.nodes.agent_created.writes, []);
  assert.equal(result.document.metadata.toograph_state_key_counter, undefined);
  assert.deepEqual(result.document.edges, [{ source: "input_question", target: "agent_created" }]);
});

test("createNodeFromCreationEntry creates input boundary nodes with a virtual output slot", () => {
  const document = {
    ...createBaseDocument(),
    metadata: {
      toograph_state_key_counter: 7,
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

  assert.deepEqual(result.document.nodes.input_created.writes, []);
  assert.deepEqual(result.document.state_schema, document.state_schema);
  assert.equal(result.document.metadata.toograph_state_key_counter, 7);
});

test("createNodeFromCreationEntry places double-click-created nodes around the gesture point", () => {
  const document = createBaseDocument();
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
    createdNodeId: "input_centered",
    persistedPresets: [],
    context: {
      position: { x: 500, y: 420 },
    },
  });

  assert.deepEqual(result.document.nodes.input_centered.ui.position, { x: 270, y: 260 });
});

test("createNodeFromCreationEntry places state-drag-created nodes with their input port on the release point", () => {
  const document = createBaseDocument();
  const entry: NodeCreationEntry = {
    id: "preset-agent-empty",
    family: "agent",
    label: "Empty LLM Node",
    description: "Blank one-turn LLM node.",
    mode: "preset",
    origin: "builtin",
    presetId: "preset.agent.empty.v0",
    acceptsValueTypes: null,
  };

  const result = createNodeFromCreationEntry(document, {
    entry,
    createdNodeId: "agent_from_state",
    persistedPresets: [],
    context: {
      position: { x: 600, y: 320 },
      sourceNodeId: "input_question",
      sourceAnchorKind: "state-out",
      sourceStateKey: "question",
      sourceValueType: "text",
    },
  });

  assert.deepEqual(result.document.nodes.agent_from_state.ui.position, { x: 594, y: 175 });
  assert.deepEqual(result.document.nodes.agent_from_state.reads, [{ state: "question", required: true }]);
});

test("createNodeFromCreationEntry places flow-drag-created nodes with their flow input on the release point", () => {
  const document = createBaseDocument();
  const entry: NodeCreationEntry = {
    id: "preset-agent-empty",
    family: "agent",
    label: "Empty LLM Node",
    description: "Blank one-turn LLM node.",
    mode: "preset",
    origin: "builtin",
    presetId: "preset.agent.empty.v0",
    acceptsValueTypes: null,
  };

  const result = createNodeFromCreationEntry(document, {
    entry,
    createdNodeId: "agent_from_flow",
    persistedPresets: [],
    context: {
      position: { x: 620, y: 300 },
      sourceNodeId: "input_question",
      sourceAnchorKind: "flow-out",
    },
  });

  assert.deepEqual(result.document.nodes.agent_from_flow.ui.position, { x: 614, y: 266 });
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

test("createNodeFromCreationEntry creates subgraphs from graph templates", () => {
  const document = createBaseDocument();
  const entry: NodeCreationEntry = {
    id: "template-template_research",
    family: "subgraph",
    label: "Research Template Subgraph",
    description: "Use a graph template as an embedded subgraph instance.",
    mode: "subgraph",
    origin: "builtin",
    templateId: "template_research",
    templateSource: "official",
    acceptsValueTypes: ["text"],
  };

  const result = createNodeFromCreationEntry(document, {
    entry,
    createdNodeId: "subgraph_created",
    persistedPresets: [],
    templates: [createSubgraphTemplate()],
    context: {
      position: { x: 320, y: 80 },
      sourceNodeId: "input_question",
      sourceAnchorKind: "state-out",
      sourceStateKey: "question",
      sourceValueType: "text",
    },
  });

  assert.equal(result.createdNodeId, "subgraph_created");
  assert.equal(result.document.nodes.subgraph_created.kind, "subgraph");
  const createdNode = result.document.nodes.subgraph_created;
  assert.equal(createdNode.kind === "subgraph" ? createdNode.name : "", "Research Flow Subgraph");
  assert.deepEqual(createdNode.kind === "subgraph" ? createdNode.reads : [], [{ state: "question", required: true }]);
  assert.deepEqual(createdNode.kind === "subgraph" ? createdNode.writes : [], [{ state: "state_2", mode: "replace" }]);
  assert.deepEqual(result.document.edges, [{ source: "input_question", target: "subgraph_created" }]);
  assert.equal(
    createdNode.kind === "subgraph" ? createdNode.config.graph.metadata.sourceTemplateId : null,
    "template_research",
  );
});

test("createNodeFromDroppedFile builds an input node from the uploaded asset envelope", async () => {
  const document = createBaseDocument();
  const file = new File(["fake-png"], "diagram.png", { type: "image/png" });

  const result = await createNodeFromDroppedFile(document, {
    file,
    position: { x: 140, y: 200 },
    createdNodeId: "input_file_created",
    uploadFile: async (uploadFile) => ({
      local_path: `uploads/${uploadFile.name}`,
      filename: uploadFile.name,
      content_type: uploadFile.type,
      size: uploadFile.size,
    }),
  });

  assert.equal(result.createdNodeId, "input_file_created");
  assert.equal(result.document.nodes.input_file_created.kind, "input");
  assert.deepEqual(result.document.nodes.input_file_created.writes, [{ state: "state_1", mode: "replace" }]);
  assert.equal(result.document.state_schema.state_1?.name, "diagram.png");
  assert.equal(result.document.state_schema.state_1?.type, "image");
  assert.equal(result.document.state_schema.state_1?.value, "uploads/diagram.png");
  assert.equal(result.document.metadata.toograph_state_key_counter, 1);
  assert.equal(result.document.nodes.input_file_created.config.value, "uploads/diagram.png");
});

test("createNodeFromDroppedFile stores generic file input nodes as local paths", async () => {
  const document = createBaseDocument();
  const file = new File(["full document text"], "notes.txt", { type: "text/plain" });

  const result = await createNodeFromDroppedFile(document, {
    file,
    position: { x: 140, y: 200 },
    createdNodeId: "input_text_created",
    uploadFile: async (uploadFile) => ({
      local_path: `uploads/${uploadFile.name}`,
      filename: uploadFile.name,
      content_type: uploadFile.type,
      size: uploadFile.size,
    }),
  });

  assert.equal(result.createdNodeId, "input_text_created");
  assert.equal(result.document.nodes.input_text_created.kind, "input");
  assert.deepEqual(result.document.nodes.input_text_created.writes, [{ state: "state_1", mode: "replace" }]);
  assert.equal(result.document.state_schema.state_1?.name, "notes.txt");
  assert.equal(result.document.state_schema.state_1?.type, "file");
  assert.equal(result.document.state_schema.state_1?.value, "uploads/notes.txt");
  assert.equal(result.document.nodes.input_text_created.config.value, "uploads/notes.txt");
});

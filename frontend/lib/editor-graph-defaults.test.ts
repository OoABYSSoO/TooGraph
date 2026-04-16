import test from "node:test";
import assert from "node:assert/strict";

import type { CanonicalGraphPayload, CanonicalTemplateRecord } from "@/lib/node-system-canonical";
import { createEditorSeedGraph } from "./editor-graph-defaults.ts";

const HELLO_WORLD_TEMPLATE: CanonicalTemplateRecord = {
  template_id: "hello_world",
  label: "Hello World",
  description: "A minimal hello world graph for validating the native LangGraph runtime path.",
  default_graph_name: "Hello World",
  state_schema: {
    question: {
      name: "question",
      description: "User question for the workflow.",
      type: "text",
      value: "什么是 GraphiteUI？",
      color: "#d97706",
    },
  },
  nodes: {
    input_question: {
      kind: "input",
      name: "input_question",
      description: "Provide the user question.",
      ui: {
        position: { x: 80, y: 220 },
        collapsed: false,
      },
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

test("createEditorSeedGraph reuses the loaded graph when one is already provided", () => {
  const initialGraph: CanonicalGraphPayload = {
    graph_id: "graph_123",
    name: "Existing Graph",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const result = createEditorSeedGraph([HELLO_WORLD_TEMPLATE], "hello_world", initialGraph);

  assert.equal(result, initialGraph);
});

test("createEditorSeedGraph clones template-backed defaults so new graphs do not share template references", () => {
  const result = createEditorSeedGraph([HELLO_WORLD_TEMPLATE], "hello_world", null);

  assert.notEqual(result, HELLO_WORLD_TEMPLATE);
  assert.notEqual(result.state_schema, HELLO_WORLD_TEMPLATE.state_schema);
  assert.notEqual(result.nodes, HELLO_WORLD_TEMPLATE.nodes);
  assert.equal(result.graph_id, null);
  assert.equal(result.name, "Hello World");

  result.state_schema.question.value = "changed";
  assert.equal(HELLO_WORLD_TEMPLATE.state_schema.question.value, "什么是 GraphiteUI？");
});

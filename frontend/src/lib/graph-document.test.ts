import test from "node:test";
import assert from "node:assert/strict";
import { reactive } from "vue";

import { createDraftFromTemplate, createEmptyDraftGraph } from "./graph-document.ts";
import type { TemplateRecord } from "../types/node-system.ts";

const template: TemplateRecord = {
  template_id: "hello_world",
  label: "Hello World",
  description: "A minimal hello world graph for validating the runtime path.",
  default_graph_name: "Hello World",
  state_schema: {
    question: {
      name: "question",
      description: "User question",
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
        position: {
          x: 80,
          y: 220,
        },
      },
      reads: [],
      writes: [{ state: "question", mode: "replace" }],
      config: {
        value: "什么是 GraphiteUI？",
      },
    },
  },
  edges: [{ source: "input_question", target: "input_question" }],
  conditional_edges: [],
  metadata: {
    category: "demo",
  },
};

test("createDraftFromTemplate creates a backend-native graph payload", () => {
  const draft = createDraftFromTemplate(template);

  assert.equal(draft.graph_id, null);
  assert.equal(draft.name, "Hello World");
  assert.deepEqual(draft.state_schema, template.state_schema);
  assert.deepEqual(draft.nodes, template.nodes);
  assert.deepEqual(draft.edges, template.edges);
  assert.deepEqual(draft.conditional_edges, template.conditional_edges);
  assert.deepEqual(draft.metadata, template.metadata);
});

test("createDraftFromTemplate deep clones nested template content", () => {
  const draft = createDraftFromTemplate(template);

  draft.state_schema.question.value = "changed";
  draft.metadata.category = "mutated";

  assert.equal(template.state_schema.question.value, "什么是 GraphiteUI？");
  assert.equal(template.metadata.category, "demo");
});

test("createDraftFromTemplate accepts Vue reactive template records", () => {
  const reactiveTemplate = reactive(template) as TemplateRecord;

  const draft = createDraftFromTemplate(reactiveTemplate);

  assert.equal(draft.name, "Hello World");
  assert.deepEqual(draft.nodes, template.nodes);
});

test("createEmptyDraftGraph creates an empty backend-native payload", () => {
  const draft = createEmptyDraftGraph("Untitled Graph");

  assert.deepEqual(draft, {
    graph_id: null,
    name: "Untitled Graph",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  });
});

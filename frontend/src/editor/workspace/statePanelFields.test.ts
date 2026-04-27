import test from "node:test";
import assert from "node:assert/strict";

import {
  addStateFieldToDocument,
  buildDefaultStateField,
  deleteStateFieldFromDocument,
  insertStateFieldIntoDocument,
  listStateFieldUsageLabels,
  parseStateValueInput,
  renameStateFieldInDocument,
  updateStateFieldInDocument,
} from "./statePanelFields.ts";
import type { GraphPayload } from "@/types/node-system";

function buildDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "State Fields",
    metadata: {},
    state_schema: {
      question: {
        name: "Question",
        description: "Primary prompt",
        type: "text",
        value: "What is GraphiteUI?",
        color: "#ffffff",
      },
      answer: {
        name: "Answer",
        description: "Generated answer",
        type: "text",
        value: "",
        color: "#000000",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "What is GraphiteUI?" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "question", required: true }],
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
      score_gate: {
        kind: "condition",
        name: "score_gate",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          branches: ["pass", "retry"],
          loopLimit: -1,
          branchMapping: { true: "pass", false: "retry" },
          rule: {
            source: "answer",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
  };
}

test("buildDefaultStateField returns a unique text state", () => {
  const field = buildDefaultStateField(["state_1", "state_2"]);
  assert.equal(field.key, "state_3");
  assert.equal(field.definition.name, "State 3");
  assert.equal(field.definition.type, "text");
  assert.equal(field.definition.value, "");
});

test("renameStateFieldInDocument updates bindings and condition rule source", () => {
  const document = buildDocument();
  const nextDocument = renameStateFieldInDocument(document, "answer", "final_answer");
  const scoreGate = nextDocument.nodes.score_gate;
  assert.equal(scoreGate.kind, "condition");

  assert.ok(nextDocument.state_schema.final_answer);
  assert.equal(nextDocument.state_schema.final_answer.name, "Answer");
  assert.equal(nextDocument.nodes.answer_helper.writes[0]?.state, "final_answer");
  assert.equal(scoreGate.reads[0]?.state, "final_answer");
  assert.equal(scoreGate.config.rule.source, "final_answer");
  assert.ok(!nextDocument.state_schema.answer);
});

test("listStateFieldUsageLabels returns unique node labels using a state", () => {
  const document = buildDocument();

  assert.deepEqual(listStateFieldUsageLabels(document, "answer"), ["answer_helper", "score_gate"]);
});

test("deleteStateFieldFromDocument refuses to delete states still referenced by nodes", () => {
  const document = buildDocument();
  const nextDocument = deleteStateFieldFromDocument(document, "answer");
  const scoreGate = nextDocument.nodes.score_gate;
  assert.equal(scoreGate.kind, "condition");

  assert.equal(nextDocument, document);
  assert.ok(nextDocument.state_schema.answer);
  assert.deepEqual(nextDocument.nodes.answer_helper.writes, [{ state: "answer", mode: "replace" }]);
  assert.deepEqual(scoreGate.reads, [{ state: "answer", required: true }]);
  assert.equal(scoreGate.config.rule.source, "answer");
});

test("deleteStateFieldFromDocument removes unreferenced state definitions immutably", () => {
  const document = insertStateFieldIntoDocument(buildDocument(), {
    key: "orphan",
    definition: {
      name: "Orphan",
      description: "",
      type: "text",
      value: "",
      color: "",
    },
  });
  const nextDocument = deleteStateFieldFromDocument(document, "orphan");

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.state_schema.orphan, undefined);
  assert.ok(document.state_schema.orphan);
});

test("addStateFieldToDocument inserts a new default field", () => {
  const document = buildDocument();
  const nextDocument = addStateFieldToDocument(document);

  assert.ok(nextDocument.state_schema.state_1);
  assert.equal(nextDocument.state_schema.state_1.type, "text");
});

test("addStateFieldToDocument does not reuse deleted default state keys in the same graph", () => {
  const document = buildDocument();
  const firstDocument = addStateFieldToDocument(document);
  const deletedDocument = deleteStateFieldFromDocument(firstDocument, "state_1");
  const secondDocument = addStateFieldToDocument(deletedDocument);

  assert.equal(secondDocument.state_schema.state_1, undefined);
  assert.ok(secondDocument.state_schema.state_2);
});

test("insertStateFieldIntoDocument adds an explicit state definition immutably", () => {
  const document = buildDocument();
  const nextDocument = insertStateFieldIntoDocument(document, {
    key: "review_notes",
    definition: {
      name: "Review Notes",
      description: "Human review notes.",
      type: "markdown",
      value: "",
      color: "#0f766e",
    },
  });

  assert.ok(nextDocument.state_schema.review_notes);
  assert.equal(nextDocument.state_schema.review_notes.type, "markdown");
  assert.equal(nextDocument.state_schema.review_notes.name, "Review Notes");
  assert.equal(document.state_schema.review_notes, undefined);
});

test("insertStateFieldIntoDocument advances the neutral state key counter for explicit state keys", () => {
  const document = buildDocument();
  const nextDocument = insertStateFieldIntoDocument(document, {
    key: "state_9",
    definition: {
      name: "Uploaded image",
      description: "",
      type: "image",
      value: "",
      color: "",
    },
  });

  assert.equal(nextDocument.metadata.graphiteui_state_key_counter, 9);
});

test("updateStateFieldInDocument applies updater to existing definition", () => {
  const document = buildDocument();
  const nextDocument = updateStateFieldInDocument(document, "answer", (current) => ({
    ...current,
    description: "Updated",
  }));

  assert.equal(nextDocument.state_schema.answer.description, "Updated");
});

test("updateStateFieldInDocument keeps input node config value in sync with its written state value", () => {
  const document = buildDocument();
  const nextDocument = updateStateFieldInDocument(document, "question", (current) => ({
    ...current,
    value: "Updated from state schema",
  }));

  assert.equal(nextDocument.state_schema.question.value, "Updated from state schema");
  assert.equal(nextDocument.nodes.input_question.kind, "input");
  if (nextDocument.nodes.input_question.kind !== "input") {
    return;
  }
  assert.equal(nextDocument.nodes.input_question.config.value, "Updated from state schema");
});

test("parseStateValueInput coerces values by state type", () => {
  assert.equal(parseStateValueInput("number", "42"), 42);
  assert.equal(parseStateValueInput("boolean", "true"), true);
  assert.deepEqual(parseStateValueInput("json", "{\"ok\":true}"), { ok: true });
  assert.deepEqual(parseStateValueInput("array", "[1,2]"), [1, 2]);
  assert.equal(parseStateValueInput("text", "hello"), "hello");
});

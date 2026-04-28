import test from "node:test";
import assert from "node:assert/strict";

import {
  addStateBindingToDocument,
  listStateBindingNodeOptions,
  removeStateBindingFromDocument,
} from "./statePanelBindings.ts";
import type { GraphPayload } from "@/types/node-system";

function buildDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Bindings",
    metadata: {},
    state_schema: {
      question: { name: "Question", description: "", type: "text", value: "", color: "#ffffff" },
      answer: { name: "Answer", description: "", type: "text", value: "", color: "#000000" },
      review: { name: "Review", description: "", type: "text", value: "", color: "#ff9900" },
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
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
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
    edges: [
      { source: "input_question", target: "answer_helper" },
      { source: "answer_helper", target: "score_gate" },
      { source: "answer_helper", target: "output_answer" },
    ],
    conditional_edges: [],
  };
}

test("listStateBindingNodeOptions follows current reader and writer rules", () => {
  const document = buildDocument();

  const readerOptions = listStateBindingNodeOptions(document, "review", "read");
  assert.deepEqual(
    readerOptions.map((option) => `${option.nodeLabel}:${option.kind}`),
    ["answer_helper:agent", "output_answer:output", "score_gate:condition"],
  );

  const writerOptions = listStateBindingNodeOptions(document, "review", "write");
  assert.deepEqual(
    writerOptions.map((option) => `${option.nodeLabel}:${option.kind}`),
    ["answer_helper:agent", "input_question:input"],
  );
});

test("addStateBindingToDocument appends agent readers and replaces single-input readers", () => {
  const document = buildDocument();

  const nextAgentDocument = addStateBindingToDocument(document, "review", "answer_helper", "read");
  assert.equal(nextAgentDocument.nodes.answer_helper.reads.at(-1)?.state, "review");
  assert.equal(nextAgentDocument.nodes.answer_helper.reads.at(-1)?.required, false);
  assert.deepEqual(document.nodes.answer_helper.reads.map((binding) => binding.state), ["question"]);

  const nextOutputDocument = addStateBindingToDocument(document, "review", "output_answer", "read");
  assert.deepEqual(nextOutputDocument.nodes.output_answer.reads, [{ state: "review", required: true }]);

  const nextConditionDocument = addStateBindingToDocument(document, "review", "score_gate", "read");
  assert.deepEqual(nextConditionDocument.nodes.score_gate.reads, [{ state: "review", required: true }]);
  assert.equal(nextConditionDocument.nodes.score_gate.kind, "condition");
  if (nextConditionDocument.nodes.score_gate.kind === "condition") {
    assert.equal(nextConditionDocument.nodes.score_gate.config.rule.source, "review");
  }
});

test("addStateBindingToDocument appends agent writers and replaces input writers", () => {
  const document = buildDocument();

  const nextAgentDocument = addStateBindingToDocument(document, "review", "answer_helper", "write");
  assert.deepEqual(nextAgentDocument.nodes.answer_helper.writes.map((binding) => binding.state), ["answer", "review"]);

  const nextInputDocument = addStateBindingToDocument(document, "review", "input_question", "write");
  assert.deepEqual(nextInputDocument.nodes.input_question.writes, [{ state: "review", mode: "replace" }]);
});

test("removeStateBindingFromDocument removes existing read and write relations", () => {
  const document = buildDocument();

  const nextReadDocument = removeStateBindingFromDocument(document, "answer", "score_gate", "read");
  assert.deepEqual(nextReadDocument.nodes.score_gate.reads, []);
  assert.deepEqual(nextReadDocument.edges, [
    { source: "input_question", target: "answer_helper" },
    { source: "answer_helper", target: "output_answer" },
  ]);

  const nextWriteDocument = removeStateBindingFromDocument(document, "answer", "answer_helper", "write");
  assert.deepEqual(nextWriteDocument.nodes.answer_helper.writes, []);
  assert.deepEqual(nextWriteDocument.edges, [{ source: "input_question", target: "answer_helper" }]);
});

test("removeStateBindingFromDocument never removes input node state outputs", () => {
  const document = buildDocument();

  const nextInputWriteDocument = removeStateBindingFromDocument(document, "question", "input_question", "write");

  assert.equal(nextInputWriteDocument, document);
  assert.deepEqual(nextInputWriteDocument.nodes.input_question.writes, [{ state: "question", mode: "replace" }]);
  assert.deepEqual(nextInputWriteDocument.edges, document.edges);
});

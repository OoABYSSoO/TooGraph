import test from "node:test";
import assert from "node:assert/strict";

import { buildStatePanelViewModel } from "./statePanelViewModel.ts";

test("buildStatePanelViewModel returns sorted state rows with readable values", () => {
  const view = buildStatePanelViewModel({
    graph_id: "graph-1",
    name: "Hello World",
    metadata: {},
    state_schema: {
      beta: {
        name: "",
        description: "Second field.",
        type: "text",
        value: { ok: true },
        color: "#000000",
      },
      alpha: {
        name: "Question",
        description: "Primary question.",
        type: "text",
        value: "What is GraphiteUI?",
        color: "#ffffff",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "alpha", mode: "replace" }],
        config: { value: "What is GraphiteUI?" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "alpha", required: true }],
        writes: [{ state: "beta", mode: "replace" }],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "beta", required: true }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
  });

  assert.equal(view.count, 2);
  assert.deepEqual(
    view.rows.map((row) => ({
      key: row.key,
      title: row.title,
      typeLabel: row.typeLabel,
      readerCount: row.readerCount,
      writerCount: row.writerCount,
      readers: row.readers.map((binding) => ({
        nodeLabel: binding.nodeLabel,
        nodeKindLabel: binding.nodeKindLabel,
        portLabel: binding.portLabel,
      })),
      writers: row.writers.map((binding) => ({
        nodeLabel: binding.nodeLabel,
        nodeKindLabel: binding.nodeKindLabel,
        portLabel: binding.portLabel,
      })),
    })),
    [
      {
        key: "alpha",
        title: "Question",
        typeLabel: "text",
        readerCount: 1,
        writerCount: 1,
        readers: [{ nodeLabel: "answer_helper", nodeKindLabel: "agent", portLabel: "alpha" }],
        writers: [{ nodeLabel: "input_question", nodeKindLabel: "input", portLabel: "alpha" }],
      },
      {
        key: "beta",
        title: "beta",
        typeLabel: "text",
        readerCount: 1,
        writerCount: 1,
        readers: [{ nodeLabel: "output_answer", nodeKindLabel: "output", portLabel: "beta" }],
        writers: [{ nodeLabel: "answer_helper", nodeKindLabel: "agent", portLabel: "beta" }],
      },
    ],
  );
  assert.equal(view.rows[0].valuePreview, "What is GraphiteUI?");
  assert.match(view.rows[1].valuePreview, /"ok": true/);
  assert.equal(view.rows[0].bindingSummary, "1 reader · 1 writer");
});

test("buildStatePanelViewModel orders rows by first state appearance in node execution order", () => {
  const view = buildStatePanelViewModel({
    graph_id: "graph-1",
    name: "Execution Order",
    metadata: {},
    state_schema: {
      final_answer: {
        name: "Final Answer",
        description: "Final output.",
        type: "text",
        value: "",
        color: "#d97706",
      },
      draft_answer: {
        name: "Draft Answer",
        description: "Draft output.",
        type: "text",
        value: "",
        color: "#2563eb",
      },
      question: {
        name: "Question",
        description: "Original question.",
        type: "text",
        value: "",
        color: "#10b981",
      },
      manual_feedback: {
        name: "Manual Feedback",
        description: "Human feedback.",
        type: "text",
        value: "",
        color: "#7c3aed",
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
        config: { value: "" },
      },
      draft_writer: {
        kind: "agent",
        name: "draft_writer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [{ state: "draft_answer", mode: "replace" }],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      revision_writer: {
        kind: "agent",
        name: "revision_writer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [
          { state: "draft_answer", required: true },
          { state: "manual_feedback", required: true },
        ],
        writes: [{ state: "final_answer", mode: "replace" }],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "final_answer", required: true }],
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
      { source: "input_question", target: "draft_writer" },
      { source: "draft_writer", target: "revision_writer" },
      { source: "revision_writer", target: "output_answer" },
    ],
    conditional_edges: [],
  });

  assert.deepEqual(
    view.rows.map((row) => row.key),
    ["question", "draft_answer", "manual_feedback", "final_answer"],
  );
});

test("buildStatePanelViewModel reports empty state cleanly", () => {
  const view = buildStatePanelViewModel({
    graph_id: "graph-1",
    name: "Empty",
    metadata: {},
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
  });
  assert.equal(view.count, 0);
  assert.equal(view.emptyTitle, "No State Yet");
  assert.equal(view.emptyBody, "Graph state objects will appear here once the graph defines them.");
});

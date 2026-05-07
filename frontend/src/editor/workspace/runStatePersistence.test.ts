import assert from "node:assert/strict";
import test from "node:test";

import type { GraphPayload } from "../../types/node-system.ts";
import type { RunDetail } from "../../types/run.ts";

import { applyRunWrittenStateValuesToDocument } from "./runStatePersistence.ts";

function createDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Preview persistence",
    state_schema: {
      state_1: { name: "question", description: "", type: "text", value: "current user edit", color: "#d97706" },
      state_2: { name: "answer", description: "", type: "markdown", value: "", color: "#10b981" },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "Question",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [{ state: "state_1", mode: "replace" }],
        config: { value: "current user edit" },
      },
      answer_agent: {
        kind: "agent",
        name: "Answer Agent",
        description: "",
        ui: { position: { x: 240, y: 0 }, collapsed: false },
        reads: [{ state: "state_1", required: true }],
        writes: [{ state: "state_2", mode: "replace" }],
        config: {
          skillKey: "",
          modelSource: "override",
          model: "gpt-5-mini",
          thinkingMode: "off",
          temperature: 0.2,
          taskInstruction: "Answer.",
        },
      },
      output_answer: {
        kind: "output",
        name: "Answer",
        description: "",
        ui: { position: { x: 480, y: 0 }, collapsed: false },
        reads: [{ state: "state_2", required: true }],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [
      { source: "input_question", target: "answer_agent" },
      { source: "answer_agent", target: "output_answer" },
    ],
    conditional_edges: [],
    metadata: {},
  };
}

function createRun(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    run_id: "run_1",
    graph_id: null,
    graph_name: "Preview persistence",
    status: "completed",
    runtime_backend: "langgraph",
    lifecycle: { updated_at: "2026-04-27T00:00:00Z", resume_count: 0 },
    checkpoint_metadata: { available: false },
    revision_round: 0,
    started_at: "2026-04-27T00:00:00Z",
    metadata: {},
    selected_skills: [],
    skill_outputs: [],
    evaluation_result: {},
    memory_summary: "",
    final_result: "# Answer\n\nPersist me.",
    node_status_map: {},
    node_executions: [],
    warnings: [],
    errors: [],
    output_previews: [],
    artifacts: {
      skill_outputs: [],
      output_previews: [],
      saved_outputs: [],
      exported_outputs: [
        {
          node_id: "output_answer",
          label: "answer",
          source_kind: "state",
          source_key: "state_2",
          display_mode: "markdown",
          persist_enabled: false,
          persist_format: "auto",
          value: "# Answer\n\nPersist me.",
          saved_file: null,
        },
      ],
      node_outputs: {},
      active_edge_ids: [],
      state_events: [
        {
          state_key: "state_1",
          node_id: "input_question",
          output_key: "state_1",
          mode: "replace",
          value: "old run input",
          created_at: "2026-04-27T00:00:00Z",
        },
        {
          state_key: "state_2",
          node_id: "answer_agent",
          output_key: "state_2",
          mode: "replace",
          value: "# Answer\n\nPersist me.",
          created_at: "2026-04-27T00:00:01Z",
        },
      ],
      state_values: {
        state_1: "old run input",
        state_2: "# Answer\n\nPersist me.",
      },
      cycle_iterations: [],
      cycle_summary: {
        has_cycle: false,
        back_edges: [],
        iteration_count: 0,
        max_iterations: 0,
        stop_reason: null,
      },
    },
    state_snapshot: {
      values: {
        state_1: "old run input",
        state_2: "# Answer\n\nPersist me.",
      },
      last_writers: {},
    },
    graph_snapshot: {},
    cycle_summary: {
      has_cycle: false,
      back_edges: [],
      iteration_count: 0,
      max_iterations: 0,
      stop_reason: null,
    },
    ...overrides,
  };
}

test("applyRunWrittenStateValuesToDocument persists non-input run outputs into state schema values", () => {
  const document = createDocument();
  const nextDocument = applyRunWrittenStateValuesToDocument(document, createRun());

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.state_schema.state_2?.value, "# Answer\n\nPersist me.");
  assert.equal(nextDocument.state_schema.state_1?.value, "current user edit");
});

test("applyRunWrittenStateValuesToDocument returns the original document when no generated values changed", () => {
  const document = createDocument();
  document.state_schema.state_2.value = "# Answer\n\nPersist me.";

  assert.equal(applyRunWrittenStateValuesToDocument(document, createRun()), document);
});

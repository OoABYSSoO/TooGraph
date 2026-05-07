import test from "node:test";
import assert from "node:assert/strict";

import { buildStatePanelViewModel } from "./statePanelViewModel.ts";
import type { GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

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
          skillKey: "",
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
          skillKey: "",
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
          skillKey: "",
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
  assert.equal(view.emptyTitle, "还没有 State");
  assert.equal(view.emptyBody, "Graph State 对象会在图定义后出现在这里。");
});

test("buildStatePanelViewModel groups the latest run state timeline per state row", () => {
  const document: GraphPayload = {
    graph_id: "graph-1",
    name: "Timeline",
    metadata: {},
    state_schema: {
      draft: {
        name: "Draft",
        description: "Draft answer.",
        type: "text",
        value: "",
        color: "#d97706",
      },
      final: {
        name: "Final",
        description: "Final answer.",
        type: "text",
        value: "",
        color: "#2563eb",
      },
    },
    nodes: {
      planner: {
        kind: "agent",
        name: "planner",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "draft", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      reviser: {
        kind: "agent",
        name: "reviser",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "draft", required: true }],
        writes: [
          { state: "draft", mode: "replace" },
          { state: "final", mode: "replace" },
        ],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [{ source: "planner", target: "reviser" }],
    conditional_edges: [],
  };

  const run = createRunDetail({
    artifacts: {
      state_events: [
        {
          node_id: "planner",
          state_key: "draft",
          output_key: "draft",
          mode: "replace",
          value: "first draft",
          created_at: "2026-04-24T09:00:00Z",
        },
        {
          node_id: "reviser",
          state_key: "draft",
          output_key: "draft",
          mode: "replace",
          value: "second draft",
          created_at: "2026-04-24T09:00:05Z",
        },
        {
          node_id: "reviser",
          state_key: "final",
          output_key: "final",
          mode: "replace",
          value: "done",
          created_at: "2026-04-24T09:00:06Z",
        },
      ],
    },
  });

  const view = buildStatePanelViewModel(document, run);
  const draftRow = view.rows.find((row) => row.key === "draft");
  const finalRow = view.rows.find((row) => row.key === "final");

  assert.ok(draftRow);
  assert.ok(finalRow);
  assert.equal(draftRow.timelineSummary, "2 次变更 · 2 个节点");
  assert.deepEqual(
    draftRow.timelineEntries.map((entry) => ({
      nodeLabel: entry.nodeLabel,
      outputKey: entry.outputKey,
      previousValuePreview: entry.previousValuePreview,
      valuePreview: entry.valuePreview,
      sequence: entry.sequence,
    })),
    [
      {
        nodeLabel: "planner",
        outputKey: "draft",
        previousValuePreview: null,
        valuePreview: "first draft",
        sequence: 1,
      },
      {
        nodeLabel: "reviser",
        outputKey: "draft",
        previousValuePreview: "first draft",
        valuePreview: "second draft",
        sequence: 2,
      },
    ],
  );
  assert.equal(finalRow.timelineSummary, "1 次变更 · 1 个节点");
  assert.equal(finalRow.timelineEntries[0]?.nodeLabel, "reviser");
  assert.equal(finalRow.timelineEntries[0]?.valuePreview, "done");
});

function createRunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    run_id: "run-1",
    graph_id: "graph-1",
    graph_name: "Timeline",
    status: "completed",
    runtime_backend: "langgraph",
    lifecycle: {
      updated_at: "2026-04-24T09:00:06Z",
      resume_count: 0,
      pause_reason: null,
      paused_at: null,
      resumed_at: null,
      resumed_from_run_id: null,
    },
    checkpoint_metadata: {
      available: false,
      checkpoint_id: null,
      thread_id: null,
      checkpoint_ns: null,
      saver: null,
      resume_source: null,
    },
    current_node_id: null,
    revision_round: 0,
    started_at: "2026-04-24T09:00:00Z",
    completed_at: "2026-04-24T09:00:06Z",
    duration_ms: 6000,
    final_score: null,
    metadata: {},
    selected_skills: [],
    skill_outputs: [],
    evaluation_result: {},
    memory_summary: "",
    final_result: "",
    node_status_map: {},
    node_executions: [],
    warnings: [],
    errors: [],
    output_previews: [],
    artifacts: {
      skill_outputs: [],
      output_previews: [],
      saved_outputs: [],
      exported_outputs: [],
      node_outputs: {},
      active_edge_ids: [],
      state_events: [],
      state_values: {},
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
      values: {},
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

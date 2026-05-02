import assert from "node:assert/strict";
import test from "node:test";

import type { RunDetail } from "../types/run.ts";

import { buildRunStatusFacts, formatRunArtifactValue, listRunOutputArtifacts } from "./runDetailModel.ts";

function createRunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    run_id: "run_1",
    graph_id: "graph_1",
    graph_name: "Hello World",
    status: "completed",
    runtime_backend: "langgraph",
    lifecycle: {
      updated_at: "2026-04-18T00:00:00Z",
      resume_count: 0,
    },
    checkpoint_metadata: {
      available: false,
    },
    revision_round: 0,
    started_at: "2026-04-18T00:00:00Z",
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

test("formatRunArtifactValue keeps strings and pretty prints structured payloads", () => {
  assert.equal(formatRunArtifactValue("hello"), "hello");
  assert.equal(formatRunArtifactValue(null), "");
  assert.equal(
    formatRunArtifactValue({
      answer: "GraphiteUI",
    }),
    '{\n  "answer": "GraphiteUI"\n}',
  );
});

test("listRunOutputArtifacts maps exported outputs into renderable cards", () => {
  const artifacts = listRunOutputArtifacts(
    createRunDetail({
      artifacts: {
        skill_outputs: [],
        output_previews: [],
        saved_outputs: [],
        exported_outputs: [
          {
            node_id: "output_answer",
            label: "Answer",
            source_kind: "node_output",
            source_key: "answer",
            display_mode: "markdown",
            persist_enabled: true,
            persist_format: "md",
            value: "# 完成",
            saved_file: {
              node_id: "output_answer",
              source_key: "answer",
              path: "/tmp/answer.md",
              format: "md",
              file_name: "answer.md",
            },
          },
        ],
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
    }),
  );

  assert.deepEqual(artifacts, [
    {
      key: "output_answer-answer-0",
      title: "Answer",
      text: "# 完成",
      displayMode: "markdown",
      persistLabel: "persist md",
      fileName: "answer.md",
    },
  ]);
});

test("buildRunStatusFacts keeps the primary run facts compact and status-first", () => {
  const facts = buildRunStatusFacts(
    createRunDetail({
      status: "awaiting_human",
      current_node_id: "draft_writer",
      duration_ms: 125_000,
      revision_round: 2,
    }),
  );

  assert.deepEqual(facts, [
    { key: "status", label: "状态", value: "awaiting_human", tone: "status" },
    { key: "current", label: "当前节点", value: "draft_writer", tone: "default" },
    { key: "duration", label: "耗时", value: "2m 5s", tone: "default" },
    { key: "revision", label: "修订", value: "2", tone: "default" },
  ]);
});

import assert from "node:assert/strict";
import test from "node:test";

import type { RunDetail } from "../../types/run.ts";

import { buildRunNodeArtifactsModel } from "./runNodeArtifactsModel.ts";

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
    knowledge_summary: "",
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

test("buildRunNodeArtifactsModel extracts output previews and failed node messages from run detail", () => {
  const model = buildRunNodeArtifactsModel(
    createRunDetail({
      status: "failed",
      artifacts: {
        skill_outputs: [],
        output_previews: [],
        saved_outputs: [],
        exported_outputs: [
          {
            node_id: "output_answer",
            label: "answer",
            source_kind: "node_output",
            source_key: "answer",
            display_mode: "markdown",
            persist_enabled: false,
            persist_format: "auto",
            value: {
              summary: "完成",
            },
            saved_file: null,
          },
        ],
        node_outputs: {},
        active_edge_ids: ["answer_helper->output_answer"],
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
      node_executions: [
        {
          node_id: "answer_helper",
          node_type: "agent",
          status: "failed",
          duration_ms: 42,
          input_summary: "",
          output_summary: "",
          artifacts: {
            inputs: {},
            outputs: {},
            family: "agent",
            iteration: null,
            selected_branch: null,
            response: null,
            reasoning: null,
            runtime_config: null,
            state_reads: [],
            state_writes: [],
          },
          warnings: [],
          errors: ["Tool execution crashed."],
        },
      ],
    }),
  );

  assert.deepEqual(model.outputPreviewByNodeId, {
    output_answer: {
      text: '{\n  "summary": "完成"\n}',
      displayMode: "markdown",
    },
  });
  assert.deepEqual(model.failedMessageByNodeId, {
    answer_helper: "Tool execution crashed.",
  });
  assert.deepEqual(model.activeEdgeIds, ["answer_helper->output_answer"]);
});

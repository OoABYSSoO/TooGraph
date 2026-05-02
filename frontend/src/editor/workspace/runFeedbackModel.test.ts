import assert from "node:assert/strict";
import test from "node:test";

import type { GraphValidationResponse } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

import {
  formatRunFeedback,
  formatValidationFeedback,
  summarizeRunNodeStates,
} from "./runFeedbackModel.ts";

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
    artifacts: {},
    state_snapshot: {
      values: {},
      last_writers: {},
    },
    graph_snapshot: {},
    ...overrides,
  };
}

test("summarizeRunNodeStates counts idle, running, paused, success, and failed nodes", () => {
  assert.deepEqual(
    summarizeRunNodeStates(["input_question", "answer_helper", "route_result", "output_answer"], {
      input_question: "success",
      answer_helper: "running",
      route_result: "failed",
      output_answer: "paused",
    }),
    {
      idle: 0,
      running: 1,
      paused: 1,
      success: 1,
      failed: 1,
    },
  );
});

test("formatValidationFeedback follows success and issue-list semantics", () => {
  const passing: GraphValidationResponse = {
    valid: true,
    issues: [],
  };
  const failing: GraphValidationResponse = {
    valid: false,
    issues: [
      { code: "missing_state", message: "State question is required." },
      { code: "dangling_output", message: "Output answer is not wired." },
    ],
  };

  assert.deepEqual(formatValidationFeedback(passing), {
    tone: "success",
    message: "校验通过。",
  });
  assert.deepEqual(formatValidationFeedback(failing), {
    tone: "danger",
    message: "State question is required.; Output answer is not wired.",
  });
});

test("formatRunFeedback formats queued runs with pending node counts", () => {
  const feedback = formatRunFeedback(
    createRunDetail({
      status: "queued",
      node_status_map: {},
    }),
    {
      nodeIds: ["input_question", "answer_helper", "output_answer"],
      nodeLabelLookup: {
        input_question: "Input",
        answer_helper: "Answer Helper",
        output_answer: "Output",
      },
    },
  );

  assert.equal(feedback.tone, "warning");
  assert.equal(feedback.message, "Run run_1 queued. Pending 3 nodes.");
  assert.equal(feedback.currentNodeLabel, null);
  assert.deepEqual(feedback.summary, {
    idle: 3,
    running: 0,
    paused: 0,
    success: 0,
    failed: 0,
  });
});

test("formatRunFeedback formats active runs with current node and cycle summary", () => {
  const feedback = formatRunFeedback(
    createRunDetail({
      status: "running",
      current_node_id: "answer_helper",
      node_status_map: {
        input_question: "success",
        answer_helper: "running",
      },
      cycle_summary: {
        has_cycle: true,
        iteration_count: 2,
        max_iterations: -1,
        stop_reason: null,
      },
    }),
    {
      nodeIds: ["input_question", "answer_helper", "output_answer"],
      nodeLabelLookup: {
        input_question: "Input",
        answer_helper: "Answer Helper",
        output_answer: "Output",
      },
    },
  );

  assert.equal(feedback.tone, "warning");
  assert.equal(feedback.currentNodeLabel, "Answer Helper");
  assert.equal(
    feedback.message,
    "Running Answer Helper. Done 1 · Active 1 · Pending 1 · Failed 0. Iterations 2/无限制.",
  );
});

test("formatRunFeedback formats failed runs with error detail", () => {
  const feedback = formatRunFeedback(
    createRunDetail({
      status: "failed",
      current_node_id: "output_answer",
      errors: ["Output serialization failed."],
      node_status_map: {
        input_question: "success",
        answer_helper: "success",
        output_answer: "failed",
      },
    }),
    {
      nodeIds: ["input_question", "answer_helper", "output_answer"],
      nodeLabelLookup: {
        output_answer: "Output",
      },
    },
  );

  assert.equal(feedback.tone, "danger");
  assert.equal(feedback.message, "Run failed at Output. Output serialization failed.");
});

test("formatRunFeedback formats completed runs with summary counts", () => {
  const feedback = formatRunFeedback(
    createRunDetail({
      status: "completed",
      node_status_map: {
        input_question: "success",
        answer_helper: "success",
        output_answer: "success",
      },
    }),
    {
      nodeIds: ["input_question", "answer_helper", "output_answer"],
      nodeLabelLookup: {},
    },
  );

  assert.equal(feedback.tone, "success");
  assert.equal(feedback.message, "Run completed. OK 3 · Pending 0 · Failed 0.");
});

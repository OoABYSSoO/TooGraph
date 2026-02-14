import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHumanReviewRows,
  buildHumanReviewResumePayload,
  formatHumanReviewDraftValue,
} from "./humanReviewPanelModel.ts";
import type { GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

function createDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Review Demo",
    state_schema: {
      question: {
        name: "question",
        description: "User question",
        type: "text",
        value: "",
        color: "#d97706",
      },
      score: {
        name: "score",
        description: "Confidence score",
        type: "number",
        value: 0,
        color: "#2563eb",
      },
      draft: {
        name: "draft",
        description: "Draft answer",
        type: "text",
        value: "",
        color: "#10b981",
      },
      manual_feedback: {
        name: "manual_feedback",
        description: "Human feedback",
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
        writes: [{ state: "draft", mode: "replace" }],
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
          { state: "draft", required: true },
          { state: "manual_feedback", required: true },
          { state: "score", required: true },
        ],
        writes: [],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [
      { source: "input_question", target: "draft_writer" },
      { source: "draft_writer", target: "revision_writer" },
    ],
    conditional_edges: [],
    metadata: {},
  };
}

function createRun(): RunDetail {
  return {
    run_id: "run-1",
    graph_id: "graph-1",
    graph_name: "Review Demo",
    status: "awaiting_human",
    runtime_backend: "langgraph",
    lifecycle: { updated_at: "", resume_count: 0, pause_reason: "breakpoint" },
    checkpoint_metadata: { available: true, checkpoint_id: "cp-1", thread_id: "thread-1" },
    current_node_id: "answer_helper",
    revision_round: 0,
    started_at: "",
    metadata: {},
    selected_skills: [],
    skill_outputs: [],
    evaluation_result: {},
    knowledge_summary: "",
    memory_summary: "",
    final_result: "",
    node_status_map: { answer_helper: "paused" },
    node_executions: [],
    warnings: [],
    errors: [],
    output_previews: [],
    artifacts: {
      state_values: {
        question: "What is GraphiteUI?",
        draft: "GraphiteUI is a visual graph editor.",
        score: 0.8,
        manual_feedback: "",
      },
    },
    state_snapshot: {
      values: {},
      last_writers: {},
    },
    graph_snapshot: {},
  };
}

test("buildHumanReviewRows lists runtime state values with graph metadata", () => {
  const rows = buildHumanReviewRows(createRun(), createDocument());

  assert.deepEqual(
    rows.map((row) => [row.key, row.label, row.type, row.color, row.draft]),
    [
      ["manual_feedback", "manual_feedback", "text", "#7c3aed", ""],
      ["score", "score", "number", "#2563eb", "0.8"],
      ["question", "question", "text", "#d97706", "What is GraphiteUI?"],
      ["draft", "draft", "text", "#10b981", "GraphiteUI is a visual graph editor."],
    ],
  );
});

test("buildHumanReviewResumePayload returns only changed parsed state values", () => {
  const rows = buildHumanReviewRows(createRun(), createDocument());
  const payload = buildHumanReviewResumePayload(rows, {
    question: "What is GraphiteUI?",
    score: "0.95",
  });

  assert.deepEqual(payload, { score: 0.95 });
});

test("formatHumanReviewDraftValue keeps structured values readable", () => {
  assert.equal(formatHumanReviewDraftValue("object", { ok: true }), '{\n  "ok": true\n}');
});

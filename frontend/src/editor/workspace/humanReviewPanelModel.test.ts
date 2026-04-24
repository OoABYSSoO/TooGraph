import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHumanReviewPanelModel,
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
    current_node_id: "draft_writer",
    revision_round: 0,
    started_at: "",
    metadata: {},
    selected_skills: [],
    skill_outputs: [],
    evaluation_result: {},
    knowledge_summary: "",
    memory_summary: "",
    final_result: "",
    node_status_map: { draft_writer: "paused" },
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

test("buildHumanReviewPanelModel promotes downstream missing inputs into requiredNow", () => {
  const panel = buildHumanReviewPanelModel(createRun(), createDocument());

  assert.deepEqual(
    panel.requiredNow.map((row) => row.key),
    ["manual_feedback", "score"],
  );
  assert.deepEqual(
    panel.otherRows.map((row) => row.key),
    ["question", "draft"],
  );
  assert.equal(panel.requiredCount, 2);
  assert.equal(panel.summaryText, "到下一个断点前，需人工填写 2 项输入");
  assert.equal(panel.hasBlockingEmptyRequiredField, true);
  assert.equal(panel.firstBlockingRequiredKey, "manual_feedback");
});

test("buildHumanReviewPanelModel does not block continue when required fields already have values", () => {
  const run = createBranchingRun();
  run.artifacts = {
    state_values: {
      question: "What is GraphiteUI?",
      draft: "GraphiteUI is a visual graph editor.",
      score: 0.8,
      manual_feedback: "Tighten the product wording.",
    },
  };

  const panel = buildHumanReviewPanelModel(run, createBranchingDocument());

  assert.equal(panel.hasBlockingEmptyRequiredField, false);
  assert.equal(panel.firstBlockingRequiredKey, null);
});

test("buildHumanReviewPanelModel returns the no-input summary when nothing is required", () => {
  const document = createDocument();
  document.nodes.revision_writer.reads = [{ state: "draft", required: true }];

  const panel = buildHumanReviewPanelModel(createRun(), document);

  assert.equal(panel.requiredCount, 0);
  assert.equal(panel.summaryText, "当前断点后没有需要人工补充的输入");
});

function createBranchingDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Branch Review",
    state_schema: {
      question: { name: "question", description: "User question", type: "text", value: "", color: "#d97706" },
      draft: { name: "draft", description: "Draft answer", type: "text", value: "", color: "#10b981" },
      score: { name: "score", description: "Condition score", type: "number", value: 0, color: "#2563eb" },
      manual_feedback: { name: "manual_feedback", description: "Human feedback", type: "text", value: "", color: "#7c3aed" },
      approval_note: { name: "approval_note", description: "Used only after the next breakpoint", type: "text", value: "", color: "#ea580c" },
      branch_context: { name: "branch_context", description: "Written on every branch", type: "text", value: "", color: "#0f766e" },
      pass_only_note: { name: "pass_only_note", description: "Written only on the pass branch", type: "text", value: "", color: "#1d4ed8" },
      retry_only_note: { name: "retry_only_note", description: "Written only on the retry branch", type: "text", value: "", color: "#be123c" },
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
        config: { skills: [], taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      score_gate: {
        kind: "condition",
        name: "score_gate",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "score", required: true }],
        writes: [],
        config: { branches: ["pass", "retry"], loopLimit: 1, branchMapping: { pass: "pass", retry: "retry" }, rule: { source: "score", operator: ">=", value: 0.7 } },
      },
      branch_writer_pass: {
        kind: "agent",
        name: "branch_writer_pass",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "draft", required: true }],
        writes: [
          { state: "branch_context", mode: "replace" },
          { state: "pass_only_note", mode: "replace" },
        ],
        config: { skills: [], taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      branch_writer_retry: {
        kind: "agent",
        name: "branch_writer_retry",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "draft", required: true }],
        writes: [
          { state: "branch_context", mode: "replace" },
          { state: "retry_only_note", mode: "replace" },
        ],
        config: { skills: [], taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      revision_writer: {
        kind: "agent",
        name: "revision_writer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [
          { state: "draft", required: true },
          { state: "manual_feedback", required: true },
          { state: "branch_context", required: true },
          { state: "pass_only_note", required: true },
          { state: "retry_only_note", required: true },
        ],
        writes: [],
        config: { skills: [], taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      followup_writer: {
        kind: "agent",
        name: "followup_writer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "approval_note", required: true }],
        writes: [],
        config: { skills: [], taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
    },
    edges: [
      { source: "input_question", target: "draft_writer" },
      { source: "draft_writer", target: "score_gate" },
      { source: "branch_writer_pass", target: "revision_writer" },
      { source: "branch_writer_retry", target: "revision_writer" },
      { source: "revision_writer", target: "followup_writer" },
    ],
    conditional_edges: [
      { source: "score_gate", branches: { pass: "branch_writer_pass", retry: "branch_writer_retry" } },
    ],
    metadata: {
      interrupt_after: ["draft_writer", "followup_writer"],
    },
  };
}

function createBranchingRun(): RunDetail {
  return {
    ...createRun(),
    current_node_id: "draft_writer",
    node_status_map: { draft_writer: "paused" },
    artifacts: {
      state_values: {
        question: "What is GraphiteUI?",
        draft: "GraphiteUI is a visual graph editor.",
      },
    },
  };
}

test("buildHumanReviewPanelModel includes condition reads and stops before the next breakpoint", () => {
  const panel = buildHumanReviewPanelModel(createBranchingRun(), createBranchingDocument());

  assert.deepEqual(
    panel.requiredNow.map((row) => row.key).sort(),
    ["manual_feedback", "pass_only_note", "retry_only_note", "score"].sort(),
  );
  assert.equal(panel.requiredNow.some((row) => row.key === "approval_note"), false);
});

test("buildHumanReviewPanelModel treats a state written on every branch as non-required", () => {
  const panel = buildHumanReviewPanelModel(createBranchingRun(), createBranchingDocument());

  assert.equal(panel.requiredNow.some((row) => row.key === "branch_context"), false);
  assert.equal(panel.otherRows.some((row) => row.key === "branch_context"), true);
});

test("buildHumanReviewPanelModel ignores optional downstream reads", () => {
  const document = createDocument();
  document.state_schema.optional_note = {
    name: "optional_note",
    description: "Optional note",
    type: "text",
    value: "",
    color: "#0891b2",
  };
  document.nodes.revision_writer.reads.push({ state: "optional_note", required: false });
  const run = createRun();
  run.artifacts = {
    ...run.artifacts,
    state_values: {
      ...(run.artifacts.state_values ?? {}),
      optional_note: "",
    },
  };

  const panel = buildHumanReviewPanelModel(run, document);

  assert.equal(panel.requiredNow.some((row) => row.key === "optional_note"), false);
});

function createInterruptBeforeDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Before Breakpoint",
    state_schema: {
      question: { name: "question", description: "User question", type: "text", value: "", color: "#d97706" },
      manual_feedback: { name: "manual_feedback", description: "Human feedback", type: "text", value: "", color: "#7c3aed" },
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
      review_writer: {
        kind: "agent",
        name: "review_writer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [
          { state: "question", required: true },
          { state: "manual_feedback", required: true },
        ],
        writes: [],
        config: { skills: [], taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
    },
    edges: [
      { source: "input_question", target: "review_writer" },
    ],
    conditional_edges: [],
    metadata: {
      interrupt_before: ["review_writer"],
    },
  };
}

function createInterruptBeforeRun(): RunDetail {
  return {
    ...createRun(),
    current_node_id: "review_writer",
    node_status_map: { review_writer: "paused" },
    artifacts: {
      state_values: {
        question: "What is GraphiteUI?",
        manual_feedback: "",
      },
    },
  };
}

function createLoopWithoutWriterDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Loop Without Writer",
    state_schema: {
      loop_note: { name: "loop_note", description: "Required loop state", type: "text", value: "", color: "#0f766e" },
    },
    nodes: {
      loop_entry: {
        kind: "agent",
        name: "loop_entry",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "loop_note", required: true }],
        writes: [],
        config: { skills: [], taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      loop_body: {
        kind: "agent",
        name: "loop_body",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "loop_note", required: true }],
        writes: [],
        config: { skills: [], taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
    },
    edges: [
      { source: "loop_entry", target: "loop_body" },
      { source: "loop_body", target: "loop_entry" },
    ],
    conditional_edges: [],
    metadata: {
      interrupt_before: ["loop_entry"],
    },
  };
}

function createLoopWithoutWriterRun(): RunDetail {
  return {
    ...createRun(),
    current_node_id: "loop_entry",
    node_status_map: { loop_entry: "paused" },
    artifacts: {
      state_values: {},
    },
  };
}

test("buildHumanReviewPanelModel keeps input-backed current reads out of requiredNow before the breakpoint window", () => {
  const panel = buildHumanReviewPanelModel(createInterruptBeforeRun(), createInterruptBeforeDocument());

  assert.deepEqual(
    panel.requiredNow.map((row) => row.key),
    ["manual_feedback"],
  );
  assert.equal(panel.requiredNow.some((row) => row.key === "question"), false);
});

test("buildHumanReviewPanelModel keeps loop reads required when a cycle has no stable writer", () => {
  const panel = buildHumanReviewPanelModel(createLoopWithoutWriterRun(), createLoopWithoutWriterDocument());

  assert.deepEqual(
    panel.requiredNow.map((row) => row.key),
    ["loop_note"],
  );
});

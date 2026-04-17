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
          { state: "draft", required: true },
          { state: "manual_feedback", required: true },
          { state: "score", required: true },
        ],
        writes: [],
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
    memory_summary: "",
    final_result: "",
    node_status_map: { draft_writer: "paused" },
    node_executions: [
      {
        node_id: "draft_writer",
        node_type: "agent",
        status: "success",
        started_at: "",
        finished_at: "",
        duration_ms: 12,
        input_summary: "",
        output_summary: "",
        artifacts: {
          inputs: {},
          outputs: {},
          family: "agent",
          state_reads: [{ state_key: "question", input_key: "question", value: "What is TooGraph?" }],
          state_writes: [
            {
              state_key: "draft",
              output_key: "draft",
              mode: "replace",
              value: "TooGraph is a visual graph editor.",
              changed: true,
            },
          ],
        },
        warnings: [],
        errors: [],
      },
    ],
    warnings: [],
    errors: [],
    output_previews: [],
    artifacts: {
      state_values: {
        question: "What is TooGraph?",
        draft: "TooGraph is a visual graph editor.",
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
      ["question", "question", "text", "#d97706", "What is TooGraph?"],
      ["draft", "draft", "text", "#10b981", "TooGraph is a visual graph editor."],
    ],
  );
});

test("buildHumanReviewResumePayload returns only changed parsed state values", () => {
  const rows = buildHumanReviewRows(createRun(), createDocument());
  const payload = buildHumanReviewResumePayload(rows, {
    question: "What is TooGraph?",
    score: "0.95",
  });

  assert.deepEqual(payload, { score: 0.95 });
});

test("formatHumanReviewDraftValue keeps structured values readable", () => {
  assert.equal(formatHumanReviewDraftValue("json", { ok: true }), '{\n  "ok": true\n}');
});

test("buildHumanReviewPanelModel promotes downstream missing inputs into requiredNow", () => {
  const panel = buildHumanReviewPanelModel(createRun(), createDocument());

  assert.deepEqual(
    panel.requiredNow.map((row) => row.key),
    ["manual_feedback", "score"],
  );
  assert.deepEqual(
    panel.producedRows.map((row) => row.key),
    ["draft"],
  );
  assert.deepEqual(
    panel.contextRows.map((row) => row.key),
    ["question"],
  );
  assert.deepEqual(
    panel.otherRows.map((row) => row.key),
    [],
  );
  assert.equal(panel.requiredCount, 2);
  assert.equal(panel.summaryText, "到下一个断点前，需人工填写 2 项输入");
  assert.equal(panel.hasBlockingEmptyRequiredField, true);
  assert.equal(panel.firstBlockingRequiredKey, "manual_feedback");
});

test("buildHumanReviewPanelModel extracts pending permission approval details", () => {
  const run = createRun();
  run.lifecycle.pause_reason = "permission_approval";
  run.metadata = {
    pending_permission_approval: {
      kind: "skill_permission_approval",
      skill_key: "local_workspace_executor",
      skill_name: "Local Workspace Executor",
      permissions: ["file_write", "subprocess"],
      input_preview: '{\n  "path": "skill/user/demo/SKILL.md"\n}',
      reason: "Skill declares risky permissions.",
    },
  };

  const panel = buildHumanReviewPanelModel(run, createDocument());

  assert.equal(panel.permissionApproval?.skillKey, "local_workspace_executor");
  assert.equal(panel.permissionApproval?.skillName, "Local Workspace Executor");
  assert.deepEqual(panel.permissionApproval?.permissions, ["file_write", "subprocess"]);
  assert.equal(panel.permissionApproval?.inputPreview, '{\n  "path": "skill/user/demo/SKILL.md"\n}');
  assert.equal(panel.summaryText, "Local Workspace Executor 需要确认：file_write、subprocess");
});

test("buildHumanReviewPanelModel extracts permission approval from scoped subgraph metadata", () => {
  const document = createDocument();
  document.state_schema.selected_capability = {
    name: "selected_capability",
    description: "",
    type: "capability",
    value: { kind: "skill", key: "local_workspace_executor" },
    color: "#2563eb",
  };
  document.state_schema.dynamic_result = {
    name: "dynamic_result",
    description: "",
    type: "result_package",
    value: {},
    color: "#0284c7",
  };
  document.nodes.run_capability_cycle = {
    kind: "subgraph",
    name: "能力循环",
    description: "",
    ui: { position: { x: 0, y: 0 } },
    reads: [],
    writes: [],
    config: {
      graph: {
        graph_id: null,
        name: "Capability Cycle",
        state_schema: {
          selected_capability: document.state_schema.selected_capability,
          dynamic_result: document.state_schema.dynamic_result,
        },
        nodes: {
          execute_capability: {
            kind: "agent",
            name: "执行能力",
            description: "",
            ui: { position: { x: 0, y: 0 } },
            reads: [{ state: "selected_capability", required: true }],
            writes: [{ state: "dynamic_result", mode: "replace" }],
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
        edges: [],
        conditional_edges: [],
        metadata: {},
      },
    },
  };
  const run = createRun();
  run.current_node_id = "run_capability_cycle";
  run.metadata = {
    pending_subgraph_breakpoint: {
      subgraph_node_id: "run_capability_cycle",
      subgraph_node_name: "能力循环",
      inner_node_id: "execute_capability",
      inner_node_name: "执行能力",
      state_values: {
        selected_capability: { kind: "skill", key: "local_workspace_executor" },
      },
      node_status_map: { execute_capability: "paused" },
      node_executions: [],
      metadata: {
        pending_permission_approval: {
          kind: "skill_permission_approval",
          skill_key: "local_workspace_executor",
          skill_name: "Local Workspace Executor",
          permissions: ["file_write"],
          input_preview: '{\n  "operation": "write"\n}',
        },
      },
    },
  };

  const panel = buildHumanReviewPanelModel(run, document);

  assert.deepEqual(panel.scopePath, ["能力循环", "执行能力"]);
  assert.equal(panel.permissionApproval?.skillKey, "local_workspace_executor");
  assert.equal(panel.summaryText, "Local Workspace Executor 需要确认：file_write");
});

test("buildHumanReviewPanelModel renders an inner subgraph breakpoint against the embedded graph", () => {
  const document: GraphPayload = {
    graph_id: "parent_graph",
    name: "Parent Graph",
    state_schema: {
      question: { name: "Question", description: "", type: "text", value: "", color: "#d97706" },
      answer: { name: "Answer", description: "", type: "text", value: "", color: "#2563eb" },
    },
    nodes: {
      nested_research: {
        kind: "subgraph",
        name: "Nested Research",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          graph: {
            state_schema: {
              internal_question: {
                name: "Internal Question",
                description: "Question inside the subgraph",
                type: "text",
                value: "",
                color: "#10b981",
              },
              manual_feedback: {
                name: "Manual Feedback",
                description: "Review note",
                type: "text",
                value: "",
                color: "#7c3aed",
              },
            },
            nodes: {
              inner_input: {
                kind: "input",
                name: "Inner Input",
                description: "",
                ui: { position: { x: 0, y: 0 } },
                reads: [],
                writes: [{ state: "internal_question", mode: "replace" }],
                config: { value: "" },
              },
              inner_review: {
                kind: "agent",
                name: "Inner Review",
                description: "",
                ui: { position: { x: 240, y: 0 } },
                reads: [
                  { state: "internal_question", required: true },
                  { state: "manual_feedback", required: true },
                ],
                writes: [],
                config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
              },
            },
            edges: [{ source: "inner_input", target: "inner_review" }],
            conditional_edges: [],
            metadata: { interrupt_after: ["inner_input"] },
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
  const run: RunDetail = {
    ...createRun(),
    current_node_id: "nested_research",
    node_status_map: { nested_research: "paused" },
    subgraph_status_map: { nested_research: { inner_input: "paused", inner_review: "idle" } },
    metadata: {
      pending_subgraph_breakpoint: {
        subgraph_node_id: "nested_research",
        inner_node_id: "inner_input",
        subgraph_path: ["nested_research"],
        state_values: {
          internal_question: "What is TooGraph?",
          manual_feedback: "",
        },
        node_status_map: {
          inner_input: "paused",
          inner_review: "idle",
        },
        node_executions: [
          {
            node_id: "inner_input",
            node_type: "input",
            status: "success",
            duration_ms: 1,
            input_summary: "",
            output_summary: "",
            artifacts: {
              inputs: {},
              outputs: {},
              family: "input",
              state_reads: [],
              state_writes: [
                {
                  state_key: "internal_question",
                  output_key: "internal_question",
                  mode: "replace",
                  value: "What is TooGraph?",
                  changed: true,
                },
              ],
            },
            warnings: [],
            errors: [],
          },
        ],
      },
    },
  };

  const panel = buildHumanReviewPanelModel(run, document);

  assert.deepEqual(panel.scopePath, ["Nested Research", "Inner Input"]);
  assert.deepEqual(panel.producedRows.map((row) => row.key), ["internal_question"]);
  assert.deepEqual(panel.requiredNow.map((row) => row.key), ["manual_feedback"]);
});

test("buildHumanReviewPanelModel renders a dynamic subgraph breakpoint from the pending graph snapshot", () => {
  const document = createDocument();
  document.state_schema.selected_capability = {
    name: "Selected Capability",
    description: "",
    type: "capability",
    value: { kind: "subgraph", key: "dynamic_breakpoint_subgraph" },
    color: "#475569",
  };
  document.state_schema.dynamic_result = {
    name: "Dynamic Result",
    description: "",
    type: "result_package",
    value: null,
    color: "#0891b2",
  };
  document.nodes.dynamic_executor = {
    kind: "agent",
    name: "Execute Capability",
    description: "",
    ui: { position: { x: 0, y: 0 } },
    reads: [
      { state: "selected_capability", required: true },
      { state: "question", required: true },
    ],
    writes: [{ state: "dynamic_result", mode: "replace" }],
    config: {
      skillKey: "",
      taskInstruction: "",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };
  const run: RunDetail = {
    ...createRun(),
    current_node_id: "dynamic_executor",
    node_status_map: { dynamic_executor: "paused" },
    subgraph_status_map: { dynamic_executor: { inner_agent: "paused", inner_output: "idle" } },
    metadata: {
      pending_subgraph_breakpoint: {
        subgraph_node_id: "dynamic_executor",
        subgraph_node_name: "Dynamic Breakpoint Subgraph",
        capability_kind: "subgraph",
        capability_key: "dynamic_breakpoint_subgraph",
        inner_node_id: "inner_agent",
        inner_node_name: "Inner Agent",
        subgraph_path: ["dynamic_executor"],
        state_values: {
          final_reply: "dynamic pause input",
          approval_note: "",
        },
        node_status_map: {
          inner_agent: "paused",
          inner_output: "idle",
        },
        node_executions: [
          {
            node_id: "inner_agent",
            node_type: "agent",
            status: "success",
            duration_ms: 1,
            input_summary: "",
            output_summary: "",
            artifacts: {
              inputs: {},
              outputs: {},
              family: "agent",
              state_reads: [{ state_key: "final_reply", input_key: "final_reply", value: "dynamic pause input" }],
              state_writes: [
                {
                  state_key: "final_reply",
                  output_key: "final_reply",
                  mode: "replace",
                  value: "dynamic pause input",
                  changed: false,
                },
              ],
            },
            warnings: [],
            errors: [],
          },
        ],
        graph_snapshot: {
          graph_id: "dynamic_subgraph_dynamic_breakpoint_subgraph",
          name: "Dynamic Breakpoint Subgraph",
          state_schema: {
            final_reply: {
              name: "Final Reply",
              description: "The dynamic subgraph output",
              type: "markdown",
              value: "",
              color: "#2563eb",
            },
            approval_note: {
              name: "Approval Note",
              description: "Human approval note",
              type: "text",
              value: "",
              color: "#7c3aed",
            },
          },
          nodes: {
            inner_agent: {
              kind: "agent",
              name: "Inner Agent",
              description: "",
              ui: { position: { x: 0, y: 0 } },
              reads: [{ state: "final_reply", required: true }],
              writes: [{ state: "final_reply", mode: "replace" }],
              config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
            },
            inner_output: {
              kind: "agent",
              name: "Inner Output",
              description: "",
              ui: { position: { x: 240, y: 0 } },
              reads: [
                { state: "final_reply", required: true },
                { state: "approval_note", required: true },
              ],
              writes: [],
              config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
            },
          },
          edges: [{ source: "inner_agent", target: "inner_output" }],
          conditional_edges: [],
          metadata: { interrupt_after: ["inner_agent"] },
        },
      },
    },
  };

  const panel = buildHumanReviewPanelModel(run, document);

  assert.deepEqual(panel.scopePath, ["Dynamic Breakpoint Subgraph", "Inner Agent"]);
  assert.deepEqual(panel.producedRows.map((row) => row.key), ["final_reply"]);
  assert.deepEqual(panel.requiredNow.map((row) => row.key), ["approval_note"]);
});

test("buildHumanReviewPanelModel restores buddy clarification pause from run metadata", () => {
  const document: GraphPayload = {
    graph_id: "buddy_loop",
    name: "Buddy Loop",
    state_schema: {
      request_understanding: { name: "Request Understanding", description: "", type: "json", value: {}, color: "#16a34a" },
      final_reply: { name: "Final Reply", description: "", type: "markdown", value: "", color: "#16a34a" },
    },
    nodes: {
      intake_request: {
        kind: "subgraph",
        name: "请求理解",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "request_understanding", mode: "replace" }],
        config: {
          graph: {
            graph_id: "buddy_turn_intake",
            name: "请求理解",
            state_schema: {
              user_message: { name: "User Message", description: "", type: "text", value: "", color: "#d97706" },
              request_understanding: { name: "Request Understanding", description: "", type: "json", value: {}, color: "#16a34a" },
              clarification_prompt: { name: "Clarification Prompt", description: "需要用户回答的澄清问题。", type: "markdown", value: "", color: "#0891b2" },
              clarification_answer: { name: "Clarification Answer", description: "用户对澄清问题的回答。", type: "markdown", value: "", color: "#d97706" },
            },
            nodes: {
              input_user_message: {
                kind: "input",
                name: "用户消息",
                description: "",
                ui: { position: { x: -480, y: 0 } },
                reads: [],
                writes: [{ state: "user_message", mode: "replace" }],
                config: { value: "", boundaryType: "text" },
              },
              understand_request: {
                kind: "agent",
                name: "理解请求",
                description: "",
                ui: { position: { x: -240, y: 0 } },
                reads: [{ state: "user_message", required: true }],
                writes: [{ state: "request_understanding", mode: "replace" }],
                config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
              },
              ask_clarification: {
                kind: "agent",
                name: "询问澄清",
                description: "",
                ui: { position: { x: 0, y: 0 } },
                reads: [
                  { state: "user_message", required: true },
                  { state: "request_understanding", required: true },
                ],
                writes: [{ state: "clarification_prompt", mode: "replace" }],
                config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
              },
              merge_clarification: {
                kind: "agent",
                name: "合并澄清",
                description: "",
                ui: { position: { x: 240, y: 0 } },
                reads: [
                  { state: "request_understanding", required: true },
                  { state: "clarification_prompt", required: true },
                  { state: "clarification_answer", required: true },
                ],
                writes: [{ state: "request_understanding", mode: "replace" }],
                config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
              },
            },
            edges: [
              { source: "input_user_message", target: "understand_request" },
              { source: "understand_request", target: "ask_clarification" },
              { source: "ask_clarification", target: "merge_clarification" },
            ],
            conditional_edges: [],
            metadata: { interrupt_after: ["ask_clarification"] },
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
  const run: RunDetail = {
    ...createRun(),
    current_node_id: "intake_request",
    node_status_map: { intake_request: "paused" },
    metadata: {
      pending_subgraph_breakpoint: {
        subgraph_node_id: "intake_request",
        inner_node_id: "ask_clarification",
        subgraph_path: ["intake_request"],
        state_values: {
          user_message: "帮我继续",
          request_understanding: { needs_clarification: true },
          clarification_prompt: "请选择先执行哪个方案。",
          clarification_answer: "",
        },
        node_status_map: { ask_clarification: "paused", merge_clarification: "idle" },
        node_executions: [
          {
            node_id: "ask_clarification",
            node_type: "agent",
            status: "success",
            duration_ms: 1,
            input_summary: "",
            output_summary: "",
            artifacts: {
              inputs: {},
              outputs: {},
              family: "agent",
              state_reads: [
                { state_key: "user_message", input_key: "user_message", value: "帮我继续" },
                { state_key: "request_understanding", input_key: "request_understanding", value: { needs_clarification: true } },
              ],
              state_writes: [
                {
                  state_key: "clarification_prompt",
                  output_key: "clarification_prompt",
                  mode: "replace",
                  value: "请选择先执行哪个方案。",
                  changed: true,
                },
              ],
            },
            warnings: [],
            errors: [],
          },
        ],
      },
    },
  };

  const panel = buildHumanReviewPanelModel(run, document);
  const resumePayload = buildHumanReviewResumePayload(panel.allRows, {
    clarification_answer: "先执行方案一",
  });

  assert.deepEqual(panel.scopePath, ["请求理解", "询问澄清"]);
  assert.deepEqual(panel.producedRows.map((row) => row.key), ["clarification_prompt"]);
  assert.deepEqual(panel.requiredNow.map((row) => row.key), ["clarification_answer"]);
  assert.equal(panel.hasBlockingEmptyRequiredField, true);
  assert.deepEqual(resumePayload, { clarification_answer: "先执行方案一" });
});

test("buildHumanReviewPanelModel does not block continue when required fields already have values", () => {
  const run = createBranchingRun();
  run.artifacts = {
    state_values: {
      question: "What is TooGraph?",
      draft: "TooGraph is a visual graph editor.",
      score: 0.8,
      manual_feedback: "Tighten the product wording.",
      pass_only_note: "Proceed with the approved branch.",
      retry_only_note: "Revise using the retry branch.",
      approval_note: "Ship the approved follow-up.",
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

test("buildHumanReviewPanelModel ignores required reads on downstream output nodes", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Output Node Review",
    state_schema: {
      question: { name: "question", description: "User question", type: "text", value: "", color: "#d97706" },
      output_note: { name: "output_note", description: "Output-only note", type: "text", value: "", color: "#1d4ed8" },
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
      output_writer: {
        kind: "output",
        name: "output_writer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "output_note", required: true }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [{ source: "input_question", target: "output_writer" }],
    conditional_edges: [],
    metadata: {},
  };
  const run: RunDetail = {
    ...createRun(),
    current_node_id: "input_question",
    node_status_map: { input_question: "paused" },
    artifacts: {
      state_values: {
        question: "What is TooGraph?",
      },
    },
  };

  const panel = buildHumanReviewPanelModel(run, document);

  assert.equal(panel.requiredNow.some((row) => row.key === "output_note"), false);
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
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
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
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
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
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
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
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      followup_writer: {
        kind: "agent",
        name: "followup_writer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "approval_note", required: true }],
        writes: [],
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
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
        question: "What is TooGraph?",
        draft: "TooGraph is a visual graph editor.",
      },
    },
  };
}

test("buildHumanReviewPanelModel includes condition reads through the next interrupt-after breakpoint node", () => {
  const panel = buildHumanReviewPanelModel(createBranchingRun(), createBranchingDocument());

  assert.deepEqual(
    panel.requiredNow.map((row) => row.key),
    ["score", "manual_feedback", "pass_only_note", "retry_only_note", "approval_note"],
  );
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

function createPreNodeReviewDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Pre Node Review",
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
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      review_entry: {
        kind: "agent",
        name: "review_entry",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
    },
    edges: [
      { source: "input_question", target: "review_entry" },
      { source: "review_entry", target: "review_writer" },
    ],
    conditional_edges: [],
    metadata: {
      interrupt_after: ["review_entry"],
    },
  };
}

function createPreNodeReviewRun(): RunDetail {
  return {
    ...createRun(),
    current_node_id: "review_entry",
    node_status_map: { review_entry: "paused" },
    artifacts: {
      state_values: {
        question: "What is TooGraph?",
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
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      loop_body: {
        kind: "agent",
        name: "loop_body",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "loop_note", required: true }],
        writes: [],
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
    },
    edges: [
      { source: "loop_entry", target: "loop_body" },
      { source: "loop_body", target: "loop_entry" },
    ],
    conditional_edges: [],
    metadata: {
      interrupt_after: ["loop_entry"],
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

function createSharedUsagePriorityDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Shared Usage Priority",
    state_schema: {
      alpha_single: {
        name: "alpha_single",
        description: "Consumed once",
        type: "text",
        value: "",
        color: "#2563eb",
      },
      zeta_shared: {
        name: "zeta_shared",
        description: "Consumed twice",
        type: "text",
        value: "",
        color: "#7c3aed",
      },
    },
    nodes: {
      review_entry: {
        kind: "agent",
        name: "review_entry",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      consumer_one: {
        kind: "agent",
        name: "consumer_one",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [
          { state: "alpha_single", required: true },
          { state: "zeta_shared", required: true },
        ],
        writes: [],
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      consumer_two: {
        kind: "agent",
        name: "consumer_two",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "zeta_shared", required: true }],
        writes: [],
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
    },
    edges: [
      { source: "review_entry", target: "consumer_one" },
      { source: "consumer_one", target: "consumer_two" },
    ],
    conditional_edges: [],
    metadata: {
      interrupt_after: ["review_entry"],
    },
  };
}

function createSharedUsagePriorityRun(): RunDetail {
  return {
    ...createRun(),
    current_node_id: "review_entry",
    node_status_map: { review_entry: "paused" },
    artifacts: {
      state_values: {},
    },
  };
}

function createOffWindowJoinDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Off Window Join",
    state_schema: {
      auto_note: {
        name: "auto_note",
        description: "Written by a sibling machine node before the join",
        type: "text",
        value: "",
        color: "#0f766e",
      },
    },
    nodes: {
      start: {
        kind: "input",
        name: "start",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: { value: "" },
      },
      current_breakpoint: {
        kind: "agent",
        name: "current_breakpoint",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      side_writer: {
        kind: "agent",
        name: "side_writer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "auto_note", mode: "replace" }],
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
      join: {
        kind: "agent",
        name: "join",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "auto_note", required: true }],
        writes: [],
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "on", temperature: 0.2 },
      },
    },
    edges: [
      { source: "start", target: "current_breakpoint" },
      { source: "start", target: "side_writer" },
      { source: "current_breakpoint", target: "join" },
      { source: "side_writer", target: "join" },
    ],
    conditional_edges: [],
    metadata: {
      interrupt_after: ["current_breakpoint"],
    },
  };
}

function createOffWindowJoinRun(): RunDetail {
  return {
    ...createRun(),
    current_node_id: "current_breakpoint",
    node_status_map: { current_breakpoint: "paused" },
    artifacts: {
      state_values: {},
    },
  };
}

test("buildHumanReviewPanelModel uses an after breakpoint on a predecessor to review before the next node", () => {
  const panel = buildHumanReviewPanelModel(createPreNodeReviewRun(), createPreNodeReviewDocument());

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

test("buildHumanReviewPanelModel prioritizes shared required states when first consumed together", () => {
  const panel = buildHumanReviewPanelModel(createSharedUsagePriorityRun(), createSharedUsagePriorityDocument());

  assert.deepEqual(
    panel.requiredNow.map((row) => row.key),
    ["zeta_shared", "alpha_single"],
  );
});

test("buildHumanReviewPanelModel keeps off-window sibling writes available at a downstream join", () => {
  const panel = buildHumanReviewPanelModel(createOffWindowJoinRun(), createOffWindowJoinDocument());

  assert.equal(panel.requiredNow.some((row) => row.key === "auto_note"), false);
});

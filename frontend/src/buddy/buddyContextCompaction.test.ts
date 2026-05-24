import test from "node:test";
import assert from "node:assert/strict";

import type { TemplateRecord } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";

import {
  BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID,
  buildBuddyContextCompactionGraph,
  buildBuddyContextBudgetReport,
  formatBuddyHistoryWithSessionSummary,
  isContextOverflowError,
  shouldRunBuddyContextCompaction,
} from "./buddyContextCompaction.ts";

function createCompactionTemplate(): TemplateRecord {
  return {
    template_id: BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID,
    label: "上下文压缩",
    description: "Buddy context compaction",
    default_graph_name: "上下文压缩",
    state_schema: {
      trigger: { name: "trigger", description: "", type: "text", value: "", color: "#475569" },
      source_run_id: { name: "source_run_id", description: "", type: "text", value: "", color: "#475569" },
      current_session_id: { name: "current_session_id", description: "", type: "text", value: "", color: "#475569" },
      user_message: { name: "user_message", description: "", type: "text", value: "", color: "#d97706" },
      conversation_history: { name: "conversation_history", description: "", type: "markdown", value: "", color: "#64748b" },
      existing_session_summary: { name: "existing_session_summary", description: "", type: "markdown", value: "", color: "#4f46e5" },
      buddy_context: { name: "buddy_context", description: "", type: "file", value: {}, color: "#0f766e" },
      context_budget_report: { name: "context_budget_report", description: "", type: "json", value: {}, color: "#0e7490" },
      capability_result: { name: "capability_result", description: "", type: "result_package", value: {}, color: "#0284c7" },
      public_response: { name: "public_response", description: "", type: "markdown", value: "", color: "#16a34a" },
    },
    nodes: {
      input_trigger: inputNode("trigger", "trigger"),
      input_source_run_id: inputNode("source_run_id", "source_run_id"),
      input_current_session_id: inputNode("current_session_id", "current_session_id"),
      input_user_message: inputNode("user_message", "user_message"),
      input_conversation_history: inputNode("conversation_history", "conversation_history"),
      input_existing_session_summary: inputNode("existing_session_summary", "existing_session_summary"),
      input_buddy_context: inputNode("buddy_context", "buddy_context"),
      input_context_budget_report: inputNode("context_budget_report", "context_budget_report"),
      input_capability_result: inputNode("capability_result", "capability_result"),
      input_public_response: inputNode("public_response", "public_response"),
    },
    edges: [],
    conditional_edges: [],
    metadata: { internal: true, role: "buddy_context_compaction" },
  };
}

function inputNode(nodeName: string, state: string) {
  return {
    kind: "input" as const,
    name: nodeName,
    description: "",
    ui: { position: { x: 0, y: 0 }, collapsed: false },
    reads: [],
    writes: [{ state, mode: "replace" as const }],
    config: { value: "" },
  };
}

function runWithUsage(promptTokens: number): RunDetail {
  return {
    run_id: "run_visible_1",
    graph_id: null,
    graph_name: "伙伴自主循环",
    status: "completed",
    started_at: "",
    completed_at: "",
    duration_ms: 0,
    final_result: "",
    errors: [],
    node_status_map: {},
    state_snapshot: { values: {}, last_writers: {} },
    graph_snapshot: {},
    artifacts: {},
    output_previews: [],
    active_edge_ids: [],
    node_executions: [
      {
        node_id: "reply_and_select_capability",
        node_type: "agent",
        status: "completed",
        duration_ms: 1,
        input_summary: "",
        output_summary: "",
        warnings: [],
        errors: [],
        artifacts: {
          inputs: {},
          outputs: {},
          family: "agent",
          runtime_config: {
            provider_usage: {
              prompt_tokens: promptTokens,
            },
          },
          state_reads: [],
          state_writes: [],
        },
      },
    ],
    memory_summary: "",
  };
}

function runWithUsageSequence(promptTokens: number[]): RunDetail {
  const run = runWithUsage(promptTokens[0] ?? 0);
  run.node_executions = promptTokens.map((value, index) => ({
    node_id: `node_${index}`,
    node_type: "agent",
    status: "completed",
    duration_ms: 1,
    input_summary: "",
    output_summary: "",
    warnings: [],
    errors: [],
    artifacts: {
      inputs: {},
      outputs: {},
      family: "agent",
      runtime_config: {
        provider_usage: {
          prompt_tokens: value,
        },
      },
      state_reads: [],
      state_writes: [],
    },
  }));
  return run;
}

test("formatBuddyHistoryWithSessionSummary prepends durable summary before recent original turns", () => {
  const history = Array.from({ length: 16 }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? "user" as const : "assistant" as const,
    content: `第 ${index} 条消息`,
    createdAt: "",
    includeInContext: true,
  }));

  const formatted = formatBuddyHistoryWithSessionSummary(history, "用户正在设计 Hermes 风格上下文压缩。");

  assert.match(formatted, /^## 会话摘要\n用户正在设计 Hermes 风格上下文压缩。/);
  assert.match(formatted, /## 最近原文/);
  assert.match(formatted, /省略的历史对话:/);
  assert.doesNotMatch(formatted, /第 0 条消息\n用户/);
});

test("shouldRunBuddyContextCompaction triggers on raw history pressure and high provider usage", () => {
  const longHistory = Array.from({ length: 18 }, (_, index) => ({
    role: index % 2 === 0 ? "user" as const : "assistant" as const,
    content: "很长的历史。".repeat(500),
  }));
  const report = buildBuddyContextBudgetReport({
    history: longHistory,
    userMessage: "继续",
    sessionSummary: "",
    trigger: "preflight",
  });

  assert.equal(shouldRunBuddyContextCompaction(report).shouldCompact, true);
  assert.equal(shouldRunBuddyContextCompaction(report).reason, "history_pressure");

  const usageReport = buildBuddyContextBudgetReport({
    history: [],
    userMessage: "继续",
    sessionSummary: "",
    trigger: "background",
    sourceRun: runWithUsage(70000),
    modelContextWindowTokens: 100000,
  });
  assert.equal(shouldRunBuddyContextCompaction(usageReport).shouldCompact, true);
  assert.equal(shouldRunBuddyContextCompaction(usageReport).reason, "provider_usage_pressure");

  const resultReport = buildBuddyContextBudgetReport({
    history: [],
    userMessage: "continue",
    sessionSummary: "",
    trigger: "background",
    publicResponse: "large result ".repeat(800),
  });
  assert.equal(shouldRunBuddyContextCompaction(resultReport).shouldCompact, true);
  assert.equal(shouldRunBuddyContextCompaction(resultReport).reason, "result_pressure");

  const maxUsageReport = buildBuddyContextBudgetReport({
    history: [],
    userMessage: "continue",
    sessionSummary: "",
    trigger: "background",
    sourceRun: runWithUsageSequence([1000, 75000, 2000]),
    modelContextWindowTokens: 100000,
  });
  assert.equal(maxUsageReport.provider_prompt_tokens, 75000);
});

test("buildBuddyContextCompactionGraph wires runtime sources into the internal compaction template", () => {
  const graph = buildBuddyContextCompactionGraph(createCompactionTemplate(), {
    trigger: "preflight",
    sourceRunId: "",
    currentSessionId: "session_live_1",
    userMessage: "继续讨论压缩",
    history: [{ role: "user", content: "之前说过要保护最近原文。" }],
    sessionSummary: "已有摘要",
    buddyModel: "global/gpt-5.3-codex",
  });

  assert.equal(graph.metadata.buddy_context_compaction_run, true);
  assert.equal(graph.metadata.buddy_template_id, BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID);
  assert.equal(graph.state_schema.trigger.value, "preflight");
  assert.equal(graph.state_schema.current_session_id.value, "session_live_1");
  assert.equal(graph.state_schema.existing_session_summary.value, "已有摘要");
  assert.equal(graph.state_schema.buddy_context.value?.["root"], "buddy_home");
  assert.equal(graph.nodes.input_user_message.config.value, "继续讨论压缩");
});

test("isContextOverflowError recognizes provider request-size failures", () => {
  assert.equal(isContextOverflowError(new Error("context length exceeded")), true);
  assert.equal(isContextOverflowError(new Error("HTTP 413 Request Entity Too Large")), true);
  assert.equal(isContextOverflowError(new Error("quota exceeded")), false);
});

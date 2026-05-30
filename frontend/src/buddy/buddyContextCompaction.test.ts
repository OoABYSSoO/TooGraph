import test from "node:test";
import assert from "node:assert/strict";

import type { TemplateRecord } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";

import {
  BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID,
  buildBuddyContextBudgetReport,
  buildBuddyContextCompactionGraph,
  formatBuddyHistoryWithSessionSummary,
  isContextOverflowError,
  shouldRunBuddyContextCompaction,
} from "./buddyContextCompaction.ts";

function createCompactionTemplate(): TemplateRecord {
  return {
    template_id: BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID,
    label: "Context Compaction",
    description: "Buddy history-only context compaction",
    default_graph_name: "Context Compaction",
    state_schema: {
      conversation_history: {
        name: "conversation_history",
        description: "",
        type: "json",
        value: "",
        color: "#64748b",
      },
      compaction_plan: { name: "compaction_plan", description: "", type: "json", value: {}, color: "#9333ea" },
    },
    nodes: {
      input_conversation_history: inputNode("conversation_history", "conversation_history"),
      plan_compaction: {
        kind: "agent",
        name: "Plan Compaction",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [{ state: "conversation_history", required: true }],
        writes: [{ state: "compaction_plan", mode: "replace" }],
        config: {
          actionKey: "",
          actionBindings: [],
          actionInstructionBlocks: {},
          taskInstruction: "Plan history compaction.",
          modelSource: "global",
          model: "",
          thinkingMode: "low",
          temperature: 0.1,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: { role: "buddy_context_compaction" },
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
    config: { value: "", boundaryType: "json" },
  };
}

function runWithUsage(promptTokens: number): RunDetail {
  return {
    run_id: "run_visible_1",
    graph_id: null,
    graph_name: "Buddy Autonomous Loop",
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
    content: `message ${index}`,
    includeInContext: true,
  }));

  const formatted = formatBuddyHistoryWithSessionSummary(history, "durable summary");

  assert.match(formatted, /^## /);
  assert.match(formatted, /durable summary/);
  assert.match(formatted, /omitted_count:/);
  assert.doesNotMatch(formatted, /\n用户: message 0\n/);
});

test("shouldRunBuddyContextCompaction only triggers when session history can be compacted", () => {
  const longHistory = Array.from({ length: 18 }, (_, index) => ({
    role: index % 2 === 0 ? "user" as const : "assistant" as const,
    content: "long history ".repeat(500),
  }));
  const report = buildBuddyContextBudgetReport({
    history: longHistory,
    userMessage: "continue",
    sessionSummary: "",
    trigger: "preflight",
  });

  assert.equal(shouldRunBuddyContextCompaction(report).shouldCompact, true);
  assert.equal(shouldRunBuddyContextCompaction(report).reason, "history_pressure");

  const usageWithoutHistory = buildBuddyContextBudgetReport({
    history: [],
    userMessage: "continue",
    sessionSummary: "",
    trigger: "background",
    sourceRun: runWithUsage(70000),
    modelContextWindowTokens: 100000,
  });
  assert.equal(shouldRunBuddyContextCompaction(usageWithoutHistory).shouldCompact, false);

  const usageWithHistory = buildBuddyContextBudgetReport({
    history: Array.from({ length: 4 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: "history worth compacting ".repeat(60),
    })),
    userMessage: "continue",
    sessionSummary: "",
    trigger: "background",
    sourceRun: runWithUsage(70000),
    modelContextWindowTokens: 100000,
  });
  assert.equal(shouldRunBuddyContextCompaction(usageWithHistory).shouldCompact, true);
  assert.equal(shouldRunBuddyContextCompaction(usageWithHistory).reason, "provider_usage_pressure");

  const resultReport = buildBuddyContextBudgetReport({
    history: [],
    userMessage: "continue",
    sessionSummary: "",
    trigger: "background",
    publicResponse: "large result ".repeat(800),
  });
  assert.equal(shouldRunBuddyContextCompaction(resultReport).shouldCompact, false);

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

test("buildBuddyContextBudgetReport preserves source refs for summary compaction", () => {
  const history = Array.from({ length: 14 }, (_, index) => ({
    id: `msg_${index}`,
    role: index % 2 === 0 ? "user" as const : "assistant" as const,
    content: `traceable history ${index}`,
    sourceRevisionId: `rev_${index}`,
  }));

  const report = buildBuddyContextBudgetReport({
    trigger: "preflight",
    history,
    userMessage: "continue",
    sessionSummary: "existing summary",
  });

  assert.deepEqual(report.omitted_refs.map((ref) => ref.source_id), ["msg_0", "msg_1"]);
  assert.deepEqual(report.protected_recent_history_refs.map((ref) => ref.source_id), history.slice(-12).map((message) => message.id));
  assert.equal(report.summary_source_refs[0]?.source_kind, "buddy_session_summary");
  assert.equal(report.summary_source_refs[0]?.source_id, "session_summary");
  assert.equal(report.summary_source_refs.at(-1)?.source_revision_id, "rev_13");
});

test("buildBuddyContextCompactionGraph only wires conversation history into the compaction template", () => {
  const graph = buildBuddyContextCompactionGraph(createCompactionTemplate(), {
    trigger: "preflight",
    sourceRunId: "run_visible_1",
    currentSessionId: "session_live_1",
    history: [{ id: "msg_source_1", role: "user", content: "preserve recent source", sourceRevisionId: "rev_source_1" }],
    sessionSummary: "existing summary",
    buddyModel: "global/gpt-5.3-codex",
  });

  const historyPackage = graph.nodes.input_conversation_history.config.value;
  assert.equal(graph.metadata.buddy_context_compaction_run, true);
  assert.equal(graph.metadata.buddy_template_id, BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID);
  assert.equal(historyPackage.kind, "context_package");
  assert.equal(historyPackage.authority, "history");
  assert.equal(historyPackage.metadata.current_session_id, "session_live_1");
  assert.equal(historyPackage.metadata.source_run_id, "run_visible_1");
  assert.equal(historyPackage.source_refs[1].source_id, "msg_source_1");
  assert.equal(historyPackage.source_refs[1].source_revision_id, "rev_source_1");
  assert.equal(graph.state_schema.conversation_history.value.kind, "context_package");
  assert.equal(graph.nodes.input_user_message, undefined);
  assert.equal(graph.nodes.input_buddy_context, undefined);
  assert.equal(graph.nodes.input_context_budget_report, undefined);
  assert.equal(graph.nodes.input_capability_result, undefined);
  assert.equal(graph.nodes.input_public_response, undefined);
  assert.equal(graph.nodes.plan_compaction.kind === "agent" ? graph.nodes.plan_compaction.config.modelSource : "", "override");
});

test("isContextOverflowError recognizes provider request-size failures", () => {
  assert.equal(isContextOverflowError(new Error("context length exceeded")), true);
  assert.equal(isContextOverflowError(new Error("HTTP 413 Request Entity Too Large")), true);
  assert.equal(isContextOverflowError(new Error("quota exceeded")), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import type { RunDetail } from "../types/run.ts";

import { buildAgentDiagnostic } from "./agentDiagnosticModel.ts";

function createRun(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    run_id: "run_1",
    graph_id: "graph_1",
    graph_name: "Buddy",
    status: "completed",
    runtime_backend: "langgraph",
    lifecycle: { updated_at: "2026-05-27T00:00:00Z", resume_count: 0 },
    checkpoint_metadata: { available: false },
    revision_round: 0,
    started_at: "2026-05-27T00:00:00Z",
    stop_reason: "",
    metadata: {},
    selected_actions: [],
    action_outputs: [],
    selected_tools: [],
    tool_outputs: [],
    selected_capabilities: [],
    capability_outputs: [],
    evaluation_result: {},
    memory_summary: "",
    final_result: "",
    node_status_map: {},
    node_executions: [],
    warnings: [],
    errors: [],
    output_previews: [],
    artifacts: { state_values: {}, node_outputs: {}, activity_events: [] },
    state_snapshot: { values: {}, last_writers: {} },
    graph_snapshot: {},
    cycle_summary: { has_cycle: false, iteration_count: 0, max_iterations: 0, stop_reason: null },
    ...overrides,
  } as RunDetail;
}

test("buildAgentDiagnostic reads loop report from run state values", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      stop_reason: "capability_budget_exhausted",
      artifacts: {
        state_values: {
          agent_loop_report: {
            decision: "stop",
            stop_reason: "capability_budget_exhausted",
            iteration_index: 4,
            max_iterations: 6,
            capability_call_count: 4,
            max_capability_calls: 4,
            selected_capability_ref: "tool:search",
            warnings: ["budget reached"],
          },
        },
      },
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.stopReason, "capability_budget_exhausted");
  assert.equal(diagnostic.iterationLabel, "4 / 6");
  assert.equal(diagnostic.capabilityBudgetLabel, "4 / 4");
  assert.deepEqual(diagnostic.badges, ["stop: capability_budget_exhausted", "decision: stop", "capability: tool:search"]);
  assert.deepEqual(diagnostic.warnings, ["budget reached"]);
});

test("buildAgentDiagnostic reads loop evidence from projected agent loop events", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      stop_reason: "",
      agent_loop_events: [
        {
          event_id: "loop_event_1",
          run_id: "run_1",
          node_id: "guard_agent_loop",
          iteration_index: 4,
          event_kind: "stop",
          capability_kind: "action",
          capability_key: "web_search",
          stop_reason: "capability_budget_exhausted",
          budget_snapshot: {
            iteration_index: 4,
            max_iterations: 6,
            capability_call_count: 4,
            max_capability_calls: 4,
            retry_budget: 1,
          },
          detail: {
            decision: "stop",
            selected_capability_ref: "action:web_search",
            warnings: ["budget reached"],
          },
          created_at: "2026-05-26T00:01:01Z",
        },
      ],
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.stopReason, "capability_budget_exhausted");
  assert.equal(diagnostic.decision, "stop");
  assert.equal(diagnostic.iterationLabel, "4 / 6");
  assert.equal(diagnostic.capabilityBudgetLabel, "4 / 4");
  assert.deepEqual(diagnostic.badges, ["stop: capability_budget_exhausted", "decision: stop", "capability: action:web_search"]);
  assert.deepEqual(diagnostic.warnings, ["budget reached"]);
});

test("buildAgentDiagnostic surfaces structured failure detail from projected agent loop events", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      agent_loop_events: [
        {
          event_id: "loop_event_provider_failed",
          run_id: "run_1",
          node_id: "guard_agent_loop",
          iteration_index: 2,
          event_kind: "stop",
          capability_kind: "action",
          capability_key: "web_search",
          stop_reason: "provider_failed",
          budget_snapshot: {
            iteration_index: 2,
            max_iterations: 6,
            capability_call_count: 1,
            max_capability_calls: 4,
          },
          detail: {
            decision: "stop",
            selected_capability_ref: "action:web_search",
            error_type: "rate_limit",
            error_message: "Provider returned 429.",
            warnings: ["provider call failed"],
          },
          created_at: "2026-05-26T00:01:01Z",
        },
      ],
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.stopReason, "provider_failed");
  assert.equal(diagnostic.stopReasonTitleKey, "runDetail.agentStopReasons.provider_failed.title");
  assert.equal(diagnostic.iterationLabel, "2 / 6");
  assert.equal(diagnostic.capabilityBudgetLabel, "1 / 4");
  assert.equal(diagnostic.selectedCapabilityRef, "action:web_search");
  assert.deepEqual(diagnostic.warnings, ["provider call failed", "rate_limit: Provider returned 429."]);
});

test("buildAgentDiagnostic maps standard stop reasons to user-facing explanation keys", () => {
  const reasons = ["provider_failed", "permission_required", "context_budget_exhausted"] as const;

  for (const reason of reasons) {
    const diagnostic = buildAgentDiagnostic(createRun({ stop_reason: reason }));

    assert.equal(diagnostic.visible, true);
    assert.equal(diagnostic.stopReason, reason);
    assert.equal(diagnostic.stopReasonTitleKey, `runDetail.agentStopReasons.${reason}.title`);
    assert.equal(diagnostic.stopReasonDescriptionKey, `runDetail.agentStopReasons.${reason}.description`);
  }
});

test("buildAgentDiagnostic summarizes pending permission approval", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      status: "awaiting_human",
      stop_reason: "permission_required",
      lifecycle: { updated_at: "2026-05-27T00:00:00Z", pause_reason: "permission_approval", resume_count: 0 },
      metadata: {
        pending_permission_approval: {
          kind: "capability_permission_approval",
          approval_id: "approval_1",
          capability_kind: "action",
          capability_key: "local_workspace_executor",
          capability_name: "Local Workspace Executor",
          permissions: ["file_write"],
          reason: "Action declares risky permission.",
          binding_source: "capability_state",
          requested_at: "2026-05-27T00:00:01Z",
        },
      },
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.permissionApproval.visible, true);
  assert.equal(diagnostic.permissionApproval.actionable, true);
  assert.equal(diagnostic.permissionApproval.status, "pending");
  assert.equal(diagnostic.permissionApproval.capabilityRef, "action:local_workspace_executor");
  assert.equal(diagnostic.permissionApproval.capabilityName, "Local Workspace Executor");
  assert.equal(diagnostic.permissionApproval.permissionLabel, "file_write");
  assert.deepEqual(diagnostic.permissionApproval.evidenceLabels, [
    "status: pending",
    "capability: action:local_workspace_executor",
    "permissions: file_write",
    "source: capability_state",
  ]);
  assert.deepEqual(diagnostic.permissionApproval.warnings, ["Action declares risky permission."]);
});

test("buildAgentDiagnostic summarizes latest completed permission approval", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      permission_approvals: [
        {
          kind: "capability_permission_approval",
          approval_id: "approval_old",
          capability_kind: "action",
          capability_key: "old_action",
          permissions: ["file_write"],
          status: "approved",
          approved_at: "2026-05-27T00:00:01Z",
        },
        {
          kind: "capability_permission_approval",
          approval_id: "approval_new",
          capability_kind: "action",
          capability_key: "local_workspace_executor",
          permissions: ["subprocess"],
          status: "denied",
          denial_reason: "不执行 shell。",
          denied_at: "2026-05-27T00:00:02Z",
        },
      ],
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.permissionApproval.visible, true);
  assert.equal(diagnostic.permissionApproval.actionable, false);
  assert.equal(diagnostic.permissionApproval.status, "denied");
  assert.equal(diagnostic.permissionApproval.approvalId, "approval_new");
  assert.equal(diagnostic.permissionApproval.capabilityRef, "action:local_workspace_executor");
  assert.equal(diagnostic.permissionApproval.permissionLabel, "subprocess");
  assert.deepEqual(diagnostic.permissionApproval.warnings, ["不执行 shell。"]);
});

test("buildAgentDiagnostic summarizes capability selection trace from state values", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      artifacts: {
        state_values: {
          capability_selection_reason: "需要公开网页资料。",
          capability_selection_trace: {
            requested: { kind: "action", key: "raw_search" },
            selected: { kind: "subgraph", key: "advanced_web_research_loop" },
            selection_reason: "Need current public sources.",
            rejected_candidates: [
              { kind: "action", key: "raw_search", reason: "higher_level_capability_preferred" },
            ],
            fallback_candidates: [
              { kind: "tool", key: "web_search" },
            ],
            usage_summary: {
              selected: {
                use_count: 8,
                success_rate: 0.75,
                recent_failure_count: 1,
              },
            },
            budget_after_call: {
              capability_call_count_after: 4,
              max_capability_calls: 4,
              remaining_capability_calls_after: 0,
              capability_budget_exhausted_after: true,
            },
            permission_summary: {
              permissions: ["network"],
              requires_approval: true,
              permission_tier: "external",
              approval_reason: "permission_tier_requires_approval",
            },
          },
        },
      },
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.deepEqual(diagnostic.capabilitySelection, {
    visible: true,
    requestedRef: "action:raw_search",
    selectedRef: "subgraph:advanced_web_research_loop",
    selectionReason: "需要公开网页资料。",
    permissionLabel: "permission: external approval",
    usageLabel: "usage: 8 uses, 75% success, 1 recent failure",
    budgetLabel: "budget: capability calls 4 / 4, remaining 0, exhausted",
    rejectedLabels: ["rejected: action:raw_search (higher_level_capability_preferred)"],
    fallbackLabels: ["fallback: tool:web_search"],
    evidenceLabels: [
      "selected: subgraph:advanced_web_research_loop",
      "requested: action:raw_search",
      "permission: external approval",
      "usage: 8 uses, 75% success, 1 recent failure",
      "budget: capability calls 4 / 4, remaining 0, exhausted",
    ],
  });
});

test("buildAgentDiagnostic summarizes provider fallback trace from state values", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      artifacts: {
        state_values: {
          provider_fallback_trace: {
            kind: "provider_fallback_trace",
            decision: "fallback_selected",
            fallback_used: true,
            requested: { provider_id: "openai", model: "gpt-primary", model_ref: "openai/gpt-primary" },
            selected: { provider_id: "local", model: "backup-model", model_ref: "local/backup-model" },
            failed_candidates: [
              {
                provider_id: "openai",
                model: "gpt-primary",
                model_ref: "openai/gpt-primary",
                error_type: "provider_timeout",
              },
            ],
            fallback_candidates: [
              {
                provider_id: "local",
                model: "backup-model",
                model_ref: "local/backup-model",
                reason: "compatible_fallback",
              },
            ],
            rejected_candidates: [
              {
                provider_id: "web-gateway",
                model: "browsing-model",
                model_ref: "web-gateway/browsing-model",
                reason: "permission_scope_expanded",
              },
            ],
            required_capabilities: ["chat", "structured_output"],
            required_permissions: ["text_generation"],
            warnings: ["primary provider timed out"],
          },
        },
      },
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.deepEqual(diagnostic.providerFallback, {
    visible: true,
    decision: "fallback_selected",
    fallbackUsed: true,
    requestedRef: "openai/gpt-primary",
    selectedRef: "local/backup-model",
    capabilityLabel: "capabilities: chat, structured_output",
    permissionLabel: "permissions: text_generation",
    failedLabels: ["failed: openai/gpt-primary (provider_timeout)"],
    fallbackLabels: ["fallback: local/backup-model (compatible_fallback)"],
    rejectedLabels: ["rejected: web-gateway/browsing-model (permission_scope_expanded)"],
    evidenceLabels: [
      "decision: fallback_selected",
      "selected: local/backup-model",
      "requested: openai/gpt-primary",
      "capabilities: chat, structured_output",
      "permissions: text_generation",
    ],
    warnings: ["primary provider timed out"],
  });
});

test("buildAgentDiagnostic summarizes provider fallback trace from node runtime config", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      node_executions: [
        {
          node_id: "agent",
          node_type: "agent",
          status: "success",
          duration_ms: 1200,
          input_summary: "",
          output_summary: "",
          warnings: [],
          errors: [],
          artifacts: {
            inputs: {},
            outputs: {},
            family: "agent",
            state_reads: [],
            state_writes: [],
            runtime_config: {
              structured_output_repair_provider_fallback_trace: {
                kind: "provider_fallback_trace",
                decision: "fallback_selected",
                fallback_used: true,
                requested: { provider_id: "openai", model: "gpt-primary", model_ref: "openai/gpt-primary" },
                selected: { provider_id: "fallback", model: "gpt-repair", model_ref: "fallback/gpt-repair" },
                failed_candidates: [
                  {
                    provider_id: "openai",
                    model: "gpt-primary",
                    model_ref: "openai/gpt-primary",
                    error_type: "provider_timeout",
                  },
                ],
                fallback_candidates: [
                  {
                    provider_id: "fallback",
                    model: "gpt-repair",
                    model_ref: "fallback/gpt-repair",
                    reason: "compatible_fallback",
                  },
                ],
                rejected_candidates: [],
                required_capabilities: ["chat", "structured_output"],
                required_permissions: ["text_generation"],
                warnings: ["repair provider fallback used"],
              },
            },
          },
        },
      ],
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.providerFallback.visible, true);
  assert.equal(diagnostic.providerFallback.selectedRef, "fallback/gpt-repair");
  assert.equal(diagnostic.providerFallback.requestedRef, "openai/gpt-primary");
  assert.deepEqual(diagnostic.providerFallback.warnings, ["repair provider fallback used"]);
});

test("buildAgentDiagnostic summarizes provider profile from node runtime config", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      node_executions: [
        {
          node_id: "agent",
          node_type: "agent",
          status: "success",
          duration_ms: 1200,
          input_summary: "",
          output_summary: "",
          warnings: [],
          errors: [],
          artifacts: {
            inputs: {},
            outputs: {},
            family: "agent",
            state_reads: [],
            state_writes: [],
            runtime_config: {
              provider_profile: {
                request_timeout_seconds: 12.5,
                cache_policy: "disabled",
                cost_budget: { limit_usd: 1.25, window: "run" },
                rate_profile: {
                  requests_per_minute: 30,
                  tokens_per_minute: 12000,
                  concurrency: 2,
                  wait_strategy: "wait",
                  max_wait_seconds: 3.5,
                },
              },
              provider_request_timeout_seconds: 12.5,
              provider_cache_policy: "disabled",
              provider_cost_budget: { limit_usd: 1.25, window: "run" },
              provider_rate_profile: {
                requests_per_minute: 30,
                tokens_per_minute: 12000,
                concurrency: 2,
                wait_strategy: "wait",
                max_wait_seconds: 3.5,
              },
              prompt_snapshots: [
                {
                  kind: "llm_prompt_snapshot",
                  phase: "agent_response",
                  prompt_cache_policy: {
                    kind: "prompt_cache_policy",
                    requested_policy: "disabled",
                    mode: "disabled",
                    provider_cache_control: "disabled",
                    eligible: false,
                    reason: "node_provider_cache_policy_disabled",
                  },
                },
              ],
            },
          },
        },
      ],
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.deepEqual(diagnostic.providerProfile, {
    visible: true,
    requestTimeoutLabel: "12.5s",
    cachePolicyLabel: "disabled",
    cacheDecisionLabel: "disabled / disabled / ineligible (node_provider_cache_policy_disabled)",
    costBudgetLabel: "$1.25 / run",
    rateProfileLabel: "30 rpm, 12000 tpm, concurrency 2, wait up to 3.5s",
    evidenceLabels: [
      "timeout: 12.5s",
      "cache policy: disabled",
      "cache decision: disabled / disabled / ineligible (node_provider_cache_policy_disabled)",
      "cost budget: $1.25 / run",
      "rate: 30 rpm, 12000 tpm, concurrency 2, wait up to 3.5s",
    ],
  });
});

test("buildAgentDiagnostic summarizes delegation worker result packages from run state", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      artifacts: {
        state_values: {
          worker_result_package: {
            kind: "worker_result_package",
            task_id: "task_research",
            status: "succeeded",
            summary: "Collected evidence and drafted notes.",
            outputs: {
              research_notes: { name: "Research notes", type: "markdown", value: "notes" },
            },
            artifacts: [{ path: "runs/run_1/research.md" }],
            errors: [],
            followups: ["Review citations"],
            source_refs: [
              { source_kind: "context_package", source_id: "ctx_1" },
              { source_kind: "graph_run", source_id: "run_worker_from_ref" },
            ],
            allowed_capabilities: [{ kind: "tool", key: "web_search" }],
            budget: { used_steps: 3, max_steps: 5 },
            child_run_id: "run_worker_from_package",
            child_run_status: "completed",
          },
        },
      },
      children: [
        {
          run_id: "run_worker_child_a",
          graph_name: "Research Worker",
          status: "completed",
          runtime_backend: "langgraph",
          lifecycle: { updated_at: "2026-05-27T00:00:00Z", resume_count: 0 },
          checkpoint_metadata: { available: false },
          revision_round: 0,
          started_at: "2026-05-27T00:00:00Z",
          parent_run_id: "run_1",
          root_run_id: "run_1",
          parent_node_id: "delegate_research",
          invocation_kind: "batch_subgraph_worker",
          invocation_key: "research_worker",
          run_depth: 1,
          run_path: ["run_1", "run_worker_child_a"],
          batch_group_id: "delegate_research",
          batch_item_index: 0,
          batch_item_label: "article-a",
        },
      ],
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.deepEqual(diagnostic.delegationWorker, {
    visible: true,
    taskId: "task_research",
    status: "succeeded",
    summary: "Collected evidence and drafted notes.",
    outputLabels: ["output: research_notes (markdown)"],
    artifactLabels: ["artifact: runs/run_1/research.md"],
    errorLabels: [],
    followupLabels: ["followup: Review citations"],
    sourceRefLabels: ["source: context_package:ctx_1"],
    workerRunLabels: [
      "run: run_worker_from_package completed",
      "run: run_worker_from_ref",
      "run: run_worker_child_a completed",
    ],
    workerRunLinks: [
      { runId: "run_worker_from_package", label: "run_worker_from_package", href: "/runs/run_worker_from_package", status: "completed" },
      { runId: "run_worker_from_ref", label: "run_worker_from_ref", href: "/runs/run_worker_from_ref", status: "" },
      { runId: "run_worker_child_a", label: "Research Worker", href: "/runs/run_worker_child_a", status: "completed" },
    ],
    budgetLabels: ["budget: used_steps=3", "budget: max_steps=5"],
    capabilityLabels: ["capability: tool:web_search"],
    evidenceLabels: [
      "worker: task_research",
      "status: succeeded",
      "output: research_notes (markdown)",
      "run: run_worker_from_package completed",
      "run: run_worker_from_ref",
      "run: run_worker_child_a completed",
      "budget: used_steps=3",
      "budget: max_steps=5",
      "capability: tool:web_search",
    ],
  });
});

test("buildAgentDiagnostic summarizes delegation board snapshots from run state", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      artifacts: {
        state_values: {
          delegation_board_snapshot: {
            kind: "delegation_board_snapshot",
            board_id: "hermes_parity_delegation",
            title: "Hermes parity delegation work",
            status: "blocked",
            status_counts: { blocked: 1, review: 1 },
            cards: [
              {
                task_id: "worker_eval_research_1",
                lane: "review",
                worker_status: "succeeded",
                retry_attempts: 2,
              },
              {
                task_id: "worker_eval_research_2",
                lane: "blocked",
                worker_status: "partial",
                block_reason: "budget_exhausted",
                recommended_next_action: "tighten_budget_or_split_task",
              },
            ],
            next_actions: [
              {
                task_id: "worker_eval_research_2",
                lane: "blocked",
                action: "tighten_budget_or_split_task",
                reason: "budget_exhausted",
              },
            ],
            source_refs: [
              { source_kind: "graph_run", source_id: "run_worker_1" },
              { source_kind: "graph_run", source_id: "run_worker_2" },
            ],
          },
        },
      },
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.deepEqual(diagnostic.delegationBoard, {
    visible: true,
    boardId: "hermes_parity_delegation",
    title: "Hermes parity delegation work",
    status: "blocked",
    cardCount: 2,
    statusLabels: ["lane: blocked=1", "lane: review=1"],
    blockedLabels: ["blocked: worker_eval_research_2 (budget_exhausted)"],
    reviewLabels: ["review: worker_eval_research_1"],
    nextActionLabels: ["next: worker_eval_research_2=tighten_budget_or_split_task"],
    sourceRefLabels: ["source: graph_run:run_worker_1", "source: graph_run:run_worker_2"],
    evidenceLabels: [
      "board: hermes_parity_delegation",
      "status: blocked",
      "cards: 2",
      "lane: blocked=1",
      "lane: review=1",
      "next: worker_eval_research_2=tighten_budget_or_split_task",
    ],
  });
});

test("buildAgentDiagnostic falls back to cycle summary", () => {
  const diagnostic = buildAgentDiagnostic(
    createRun({
      cycle_summary: {
        has_cycle: true,
        iteration_count: 5,
        max_iterations: 5,
        stop_reason: "max_iterations_exceeded",
      },
    }),
  );

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.stopReason, "max_iterations_reached");
  assert.equal(diagnostic.iterationLabel, "5 / 5");
});

test("buildAgentDiagnostic hides completed-only runs without loop evidence", () => {
  const diagnostic = buildAgentDiagnostic(createRun({ stop_reason: "completed" }));

  assert.equal(diagnostic.visible, false);
  assert.equal(diagnostic.stopReason, "completed");
});

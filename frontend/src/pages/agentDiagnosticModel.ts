import type { RunDetail } from "../types/run.ts";
import { buildDelegationBoardDiagnostic, type DelegationBoardDiagnostic } from "../lib/delegationBoardDiagnostic.ts";
import { buildDelegationWorkerDiagnostic, type DelegationWorkerDiagnostic } from "../lib/delegationWorkerDiagnostic.ts";

const PROVIDER_FALLBACK_TRACE_RUNTIME_KEYS = [
  "provider_fallback_trace",
  "structured_output_repair_provider_fallback_trace",
  "action_input_provider_fallback_trace",
  "action_input_structured_output_repair_provider_fallback_trace",
  "subgraph_input_provider_fallback_trace",
  "subgraph_input_structured_output_repair_provider_fallback_trace",
] as const;

const PROVIDER_COST_BUDGET_DEGRADATION_RUNTIME_KEYS = [
  "provider_cost_budget_degradation",
  "structured_output_repair_provider_cost_budget_degradation",
  "action_input_provider_cost_budget_degradation",
  "action_input_structured_output_repair_provider_cost_budget_degradation",
  "subgraph_input_provider_cost_budget_degradation",
  "subgraph_input_structured_output_repair_provider_cost_budget_degradation",
] as const;

export type AgentDiagnostic = {
  visible: boolean;
  stopReason: string;
  stopReasonTitleKey: string;
  stopReasonDescriptionKey: string;
  decision: string;
  iterationLabel: string;
  capabilityBudgetLabel: string;
  selectedCapabilityRef: string;
  warnings: string[];
  badges: string[];
  providerProfile: ProviderProfileDiagnostic;
  providerFallback: ProviderFallbackDiagnostic;
  providerCostBudgetDegradation: ProviderCostBudgetDegradationDiagnostic;
  permissionApproval: PermissionApprovalDiagnostic;
  delegationWorker: DelegationWorkerDiagnostic;
  delegationBoard: DelegationBoardDiagnostic;
};

export type ProviderProfileDiagnostic = {
  visible: boolean;
  requestTimeoutLabel: string;
  cachePolicyLabel: string;
  cacheDecisionLabel: string;
  costBudgetLabel: string;
  rateProfileLabel: string;
  evidenceLabels: string[];
};

export type ProviderFallbackDiagnostic = {
  visible: boolean;
  decision: string;
  fallbackUsed: boolean;
  requestedRef: string;
  selectedRef: string;
  capabilityLabel: string;
  permissionLabel: string;
  failedLabels: string[];
  fallbackLabels: string[];
  rejectedLabels: string[];
  evidenceLabels: string[];
  warnings: string[];
};

export type ProviderCostBudgetDegradationDiagnostic = {
  visible: boolean;
  status: string;
  requestedRef: string;
  selectedRef: string;
  reason: string;
  preflightStatus: string;
  preflightReason: string;
  budgetLimitLabel: string;
  previousWindowCostLabel: string;
  cumulativeCostLabel: string;
  windowLabel: string;
  onExceededLabel: string;
  evidenceLabels: string[];
};

export type PermissionApprovalDiagnostic = {
  visible: boolean;
  actionable: boolean;
  approvalId: string;
  status: string;
  capabilityRef: string;
  capabilityName: string;
  permissionLabel: string;
  sourceLabel: string;
  evidenceLabels: string[];
  warnings: string[];
};

export function buildAgentDiagnostic(run: RunDetail): AgentDiagnostic {
  const stateValues = {
    ...recordFromUnknown(run.state_snapshot?.values),
    ...recordFromUnknown(run.artifacts?.state_values),
  };
  const stateReport = recordFromUnknown(stateValues.agent_loop_report);
  const projectedReport = reportFromAgentLoopEvent(latestAgentLoopEvent(run.agent_loop_events));
  const report = Object.keys(projectedReport).length > 0 ? { ...stateReport, ...projectedReport } : stateReport;
  const explicitStateStopReason = normalizeStopReason(stateValues.agent_loop_stop_reason);
  const cycleSummary = run.cycle_summary ?? run.artifacts?.cycle_summary;
  const hasCycleSummary = Boolean(cycleSummary?.has_cycle);
  const runStopReason = normalizeStopReason(run.stop_reason);
  const stopReason =
    (runStopReason && runStopReason !== "completed" ? runStopReason : "") ||
    normalizeStopReason(report.stop_reason) ||
    explicitStateStopReason ||
    runStopReason ||
    (hasCycleSummary ? normalizeCycleStopReason(cycleSummary?.stop_reason) : "");
  const iterationIndex = numberFromUnknown(report.iteration_index) ?? (hasCycleSummary ? numberFromUnknown(cycleSummary?.iteration_count) : null);
  const maxIterations = numberFromUnknown(report.max_iterations) ?? (hasCycleSummary ? numberFromUnknown(cycleSummary?.max_iterations) : null);
  const capabilityCallCount = numberFromUnknown(report.capability_call_count);
  const maxCapabilityCalls = numberFromUnknown(report.max_capability_calls);
  const decision = textFromUnknown(report.decision);
  const providerProfile = buildProviderProfileDiagnostic(resolveProviderProfileRuntimeConfig(run));
  const providerFallback = buildProviderFallbackDiagnostic(resolveProviderFallbackTrace(run, stateValues));
  const providerCostBudgetDegradation = buildProviderCostBudgetDegradationDiagnostic(
    resolveProviderCostBudgetDegradation(run, stateValues),
  );
  const permissionApproval = buildPermissionApprovalDiagnostic(run);
  const delegationWorker = buildDelegationWorkerDiagnostic(
    resolveDelegationWorkerPackage(run, stateValues),
    { workerRuns: resolveDelegationWorkerRuns(run) },
  );
  const delegationBoard = buildDelegationBoardDiagnostic(resolveDelegationBoardSnapshot(run, stateValues));
  const selectedCapabilityRef = textFromUnknown(report.selected_capability_ref);
  const warnings = diagnosticWarningsFromReport(report);
  const hasLoopEvidence = Boolean(
    decision
    || iterationIndex !== null
    || capabilityCallCount !== null
    || warnings.length > 0
    || providerProfile.visible
    || providerFallback.visible
    || providerCostBudgetDegradation.visible
    || permissionApproval.visible
    || delegationWorker.visible
    || delegationBoard.visible
  );
  const hasNonDefaultStopReason = Boolean(stopReason && stopReason !== "completed");
  const badges = [
    stopReason ? `stop: ${stopReason}` : "",
    decision ? `decision: ${decision}` : "",
    selectedCapabilityRef ? `capability: ${selectedCapabilityRef}` : "",
  ].filter(Boolean);

  return {
    visible: hasLoopEvidence || hasNonDefaultStopReason,
    stopReason,
    stopReasonTitleKey: stopReasonI18nKey(stopReason, "title"),
    stopReasonDescriptionKey: stopReasonI18nKey(stopReason, "description"),
    decision,
    iterationLabel: formatBudget(iterationIndex, maxIterations),
    capabilityBudgetLabel: formatBudget(capabilityCallCount, maxCapabilityCalls),
    selectedCapabilityRef,
    warnings,
    badges,
    providerProfile,
    providerFallback,
    providerCostBudgetDegradation,
    permissionApproval,
    delegationWorker,
    delegationBoard,
  };
}

function resolveProviderProfileRuntimeConfig(run: RunDetail) {
  for (const execution of [...listNodeExecutionsDeep(run.node_executions)].reverse()) {
    const runtimeConfig = recordFromUnknown(execution.artifacts?.runtime_config);
    if (runtimeConfigHasProviderProfileEvidence(runtimeConfig)) {
      return runtimeConfig;
    }
  }
  return {};
}

function runtimeConfigHasProviderProfileEvidence(runtimeConfig: Record<string, unknown>) {
  return buildProviderProfileDiagnostic(runtimeConfig).visible;
}

function buildProviderProfileDiagnostic(value: unknown): ProviderProfileDiagnostic {
  const runtimeConfig = recordFromUnknown(value);
  const profile = recordFromUnknown(runtimeConfig.provider_profile);
  const requestTimeout =
    numberFromUnknown(runtimeConfig.provider_request_timeout_seconds)
    ?? numberFromUnknown(profile.request_timeout_seconds);
  const requestTimeoutLabel = requestTimeout !== null ? `${formatCompactNumber(requestTimeout)}s` : "";
  const cachePolicyLabel =
    textFromUnknown(runtimeConfig.provider_cache_policy)
    || textFromUnknown(profile.cache_policy);
  const cacheDecisionLabel = formatProviderCacheDecision(resolveProviderCacheDecision(runtimeConfig));
  const costBudgetLabel = formatProviderCostBudget(
    firstNonEmptyRecord(runtimeConfig.provider_cost_budget, profile.cost_budget),
  );
  const rateProfileLabel = formatProviderRateProfile(
    firstNonEmptyRecord(runtimeConfig.provider_rate_profile, profile.rate_profile),
  );
  const visible = Boolean(
    requestTimeoutLabel
    || (cachePolicyLabel && cachePolicyLabel !== "default")
    || cacheDecisionLabel
    || costBudgetLabel
    || rateProfileLabel
  );
  const evidenceLabels = [
    requestTimeoutLabel ? `timeout: ${requestTimeoutLabel}` : "",
    cachePolicyLabel && cachePolicyLabel !== "default" ? `cache policy: ${cachePolicyLabel}` : "",
    cacheDecisionLabel ? `cache decision: ${cacheDecisionLabel}` : "",
    costBudgetLabel ? `cost budget: ${costBudgetLabel}` : "",
    rateProfileLabel ? `rate: ${rateProfileLabel}` : "",
  ].filter(Boolean);

  return {
    visible,
    requestTimeoutLabel,
    cachePolicyLabel,
    cacheDecisionLabel,
    costBudgetLabel,
    rateProfileLabel,
    evidenceLabels,
  };
}

function firstNonEmptyRecord(...values: unknown[]) {
  for (const value of values) {
    const record = recordFromUnknown(value);
    if (Object.keys(record).length > 0) {
      return record;
    }
  }
  return {};
}

function resolveProviderCacheDecision(runtimeConfig: Record<string, unknown>) {
  const directDecision = recordFromUnknown(runtimeConfig.provider_cache_decision);
  if (Object.keys(directDecision).length > 0) {
    return normalizeProviderCacheDecision(directDecision);
  }
  const snapshots = recordList(runtimeConfig.prompt_snapshots);
  for (const snapshot of [...snapshots].reverse()) {
    const policy = recordFromUnknown(snapshot.prompt_cache_policy);
    if (Object.keys(policy).length > 0) {
      return normalizeProviderCacheDecision(policy);
    }
  }
  return normalizeProviderCacheDecision({});
}

function normalizeProviderCacheDecision(record: Record<string, unknown>) {
  const requestedPolicy = textFromUnknown(record.requested_policy);
  const mode = textFromUnknown(record.mode);
  const providerCacheControl = textFromUnknown(record.provider_cache_control);
  const eligible = typeof record.eligible === "boolean" ? record.eligible : null;
  const reason = textFromUnknown(record.reason);
  return { requestedPolicy, mode, providerCacheControl, eligible, reason };
}

function formatProviderCacheDecision(decision: ReturnType<typeof normalizeProviderCacheDecision>) {
  const policy = decision.requestedPolicy || decision.mode;
  if (
    (policy === "" || policy === "default")
    && (!decision.providerCacheControl || decision.providerCacheControl === "not_applied")
  ) {
    return "";
  }
  if (!policy && !decision.providerCacheControl && decision.eligible === null && !decision.reason) {
    return "";
  }
  const eligibility = decision.eligible === null ? "" : decision.eligible ? "eligible" : "ineligible";
  const parts = [policy, decision.providerCacheControl, eligibility].filter(Boolean);
  const base = parts.join(" / ");
  return decision.reason ? `${base} (${decision.reason})` : base;
}

function formatProviderCostBudget(record: Record<string, unknown>) {
  const limitUsd = numberFromUnknown(record.limit_usd);
  if (limitUsd === null) {
    return "";
  }
  const window = textFromUnknown(record.window) || "run";
  const onExceeded = textFromUnknown(record.on_exceeded) || textFromUnknown(record.onExceeded);
  const strategy = onExceeded && onExceeded !== "block" ? onExceeded.replace(/_/g, " ") : "";
  return [`$${formatCompactNumber(limitUsd)} / ${window}`, strategy].filter(Boolean).join(", ");
}

function formatProviderRateProfile(record: Record<string, unknown>) {
  const labels = [
    formatRateLimit(numberFromUnknown(record.requests_per_minute), "rpm"),
    formatRateLimit(numberFromUnknown(record.tokens_per_minute), "tpm"),
    formatRateLimit(numberFromUnknown(record.concurrency), "concurrency", { prefix: true }),
    formatProviderRateWaitStrategy(record),
  ].filter(Boolean);
  return labels.join(", ");
}

function formatProviderRateWaitStrategy(record: Record<string, unknown>) {
  const waitStrategy = textFromUnknown(record.wait_strategy);
  if (waitStrategy !== "wait") {
    return "";
  }
  const maxWaitSeconds = numberFromUnknown(record.max_wait_seconds);
  return maxWaitSeconds === null ? "wait" : `wait up to ${formatCompactNumber(maxWaitSeconds)}s`;
}

function formatRateLimit(value: number | null, unit: string, options: { prefix?: boolean } = {}) {
  if (value === null) {
    return "";
  }
  const formatted = formatCompactNumber(value);
  return options.prefix ? `${unit} ${formatted}` : `${formatted} ${unit}`;
}

function formatCompactNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function resolveDelegationWorkerPackage(run: RunDetail, stateValues: Record<string, unknown>) {
  const statePackage = recordFromUnknown(stateValues.worker_result_package);
  if (Object.keys(statePackage).length > 0) {
    return statePackage;
  }
  for (const execution of [...listNodeExecutionsDeep(run.node_executions)].reverse()) {
    const outputs = recordFromUnknown(execution.artifacts?.outputs);
    const outputPackage = recordFromUnknown(outputs.worker_result_package);
    if (Object.keys(outputPackage).length > 0) {
      return outputPackage;
    }
    const stateWritePackage = recordFromUnknown(findStateWriteValue(execution, "worker_result_package"));
    if (Object.keys(stateWritePackage).length > 0) {
      return stateWritePackage;
    }
  }
  return {};
}

function resolveDelegationBoardSnapshot(run: RunDetail, stateValues: Record<string, unknown>) {
  const stateBoard = recordFromUnknown(stateValues.delegation_board_snapshot);
  if (Object.keys(stateBoard).length > 0) {
    return stateBoard;
  }
  for (const execution of [...listNodeExecutionsDeep(run.node_executions)].reverse()) {
    const outputs = recordFromUnknown(execution.artifacts?.outputs);
    const outputBoard = recordFromUnknown(outputs.delegation_board_snapshot);
    if (Object.keys(outputBoard).length > 0) {
      return outputBoard;
    }
    const stateWriteBoard = recordFromUnknown(findStateWriteValue(execution, "delegation_board_snapshot"));
    if (Object.keys(stateWriteBoard).length > 0) {
      return stateWriteBoard;
    }
  }
  return {};
}

function resolveDelegationWorkerRuns(run: RunDetail) {
  return (run.children ?? []).filter((child) => {
    const invocationKind = textFromUnknown(child.invocation_kind);
    return invocationKind === "batch_subgraph_worker" || invocationKind === "delegation_worker";
  });
}

function findStateWriteValue(execution: NonNullable<RunDetail["node_executions"]>[number], stateKey: string) {
  return (execution.artifacts?.state_writes ?? []).find((write) => textFromUnknown(write.state_key) === stateKey)?.value;
}

function buildPermissionApprovalDiagnostic(run: RunDetail): PermissionApprovalDiagnostic {
  const { approval, actionable } = resolvePermissionApprovalRecord(run);
  const approvalId = textFromUnknown(approval.approval_id);
  const rawStatus = textFromUnknown(approval.status);
  const status = rawStatus || (Object.keys(approval).length > 0 ? "pending" : "");
  const capabilityKind = textFromUnknown(approval.capability_kind) || "action";
  const capabilityKey = textFromUnknown(approval.capability_key);
  const capabilityName = textFromUnknown(approval.capability_name) || capabilityKey;
  const capabilityRef = capabilityKey ? `${capabilityKind}:${capabilityKey}` : "";
  const permissions = stringList(approval.permissions);
  const permissionLabel = permissions.join(", ");
  const permissionEvidenceLabel = permissionLabel ? `permissions: ${permissionLabel}` : "";
  const bindingSource = textFromUnknown(approval.binding_source);
  const sourceLabel = bindingSource ? `source: ${bindingSource}` : "";
  const reason = textFromUnknown(approval.reason);
  const denialReason = textFromUnknown(approval.denial_reason);
  const evidenceLabels = [
    status ? `status: ${status}` : "",
    capabilityRef ? `capability: ${capabilityRef}` : "",
    permissionEvidenceLabel,
    sourceLabel,
  ].filter(Boolean);
  const warnings = [denialReason || reason].filter(Boolean);
  const visible = Boolean(status || capabilityRef || permissionLabel || reason || denialReason || approvalId);

  return {
    visible,
    actionable: actionable && status === "pending",
    approvalId,
    status,
    capabilityRef,
    capabilityName,
    permissionLabel,
    sourceLabel,
    evidenceLabels,
    warnings,
  };
}

function resolvePermissionApprovalRecord(run: RunDetail): { approval: Record<string, unknown>; actionable: boolean } {
  const metadata = recordFromUnknown(run.metadata);
  const pending = recordFromUnknown(metadata.pending_permission_approval);
  if (textFromUnknown(pending.kind) === "capability_permission_approval") {
    return { approval: pending, actionable: true };
  }
  const pendingSubgraph = recordFromUnknown(metadata.pending_subgraph_breakpoint);
  const pendingSubgraphMetadata = recordFromUnknown(pendingSubgraph.metadata);
  const pendingSubgraphApproval = recordFromUnknown(pendingSubgraphMetadata.pending_permission_approval);
  if (textFromUnknown(pendingSubgraphApproval.kind) === "capability_permission_approval") {
    return { approval: pendingSubgraphApproval, actionable: true };
  }
  const approvals = recordList(run.permission_approvals)
    .filter((approval) => textFromUnknown(approval.kind) === "capability_permission_approval");
  return {
    approval: approvals.sort((left, right) => permissionApprovalTime(right).localeCompare(permissionApprovalTime(left)))[0] ?? {},
    actionable: false,
  };
}

function permissionApprovalTime(approval: Record<string, unknown>) {
  return (
    textFromUnknown(approval.denied_at)
    || textFromUnknown(approval.approved_at)
    || textFromUnknown(approval.requested_at)
    || textFromUnknown(approval.created_at)
  );
}

function resolveProviderFallbackTrace(run: RunDetail, stateValues: Record<string, unknown>) {
  const stateTrace = recordFromUnknown(stateValues.provider_fallback_trace);
  if (Object.keys(stateTrace).length > 0) {
    return stateTrace;
  }
  for (const execution of listNodeExecutionsDeep(run.node_executions)) {
    const runtimeConfig = recordFromUnknown(execution.artifacts?.runtime_config);
    for (const key of PROVIDER_FALLBACK_TRACE_RUNTIME_KEYS) {
      const trace = recordFromUnknown(runtimeConfig[key]);
      if (Object.keys(trace).length > 0) {
        return trace;
      }
    }
  }
  return {};
}

function resolveProviderCostBudgetDegradation(run: RunDetail, stateValues: Record<string, unknown>) {
  const stateDegradation = recordFromUnknown(stateValues.provider_cost_budget_degradation);
  if (Object.keys(stateDegradation).length > 0) {
    return stateDegradation;
  }
  for (const execution of listNodeExecutionsDeep(run.node_executions)) {
    const runtimeConfig = recordFromUnknown(execution.artifacts?.runtime_config);
    for (const key of PROVIDER_COST_BUDGET_DEGRADATION_RUNTIME_KEYS) {
      const degradation = recordFromUnknown(runtimeConfig[key]);
      if (Object.keys(degradation).length > 0) {
        return degradation;
      }
    }
  }
  return {};
}

function listNodeExecutionsDeep(executions: RunDetail["node_executions"]): RunDetail["node_executions"] {
  const result: RunDetail["node_executions"] = [];
  for (const execution of executions ?? []) {
    result.push(execution);
    const childExecutions = execution.artifacts?.subgraph?.node_executions;
    if (Array.isArray(childExecutions)) {
      result.push(...listNodeExecutionsDeep(childExecutions));
    }
  }
  return result;
}

function buildProviderFallbackDiagnostic(value: unknown): ProviderFallbackDiagnostic {
  const trace = recordFromUnknown(value);
  const requestedRef = providerModelRef(trace.requested);
  const selectedRef = providerModelRef(trace.selected);
  const decision = textFromUnknown(trace.decision);
  const requiredCapabilities = stringList(trace.required_capabilities);
  const requiredPermissions = stringList(trace.required_permissions);
  const capabilityLabel = requiredCapabilities.length > 0 ? `capabilities: ${requiredCapabilities.join(", ")}` : "";
  const permissionLabel = requiredPermissions.length > 0 ? `permissions: ${requiredPermissions.join(", ")}` : "";
  const failedLabels = recordList(trace.failed_candidates).map((candidate) => providerCandidateLabel("failed", candidate, "error_type"));
  const fallbackLabels = recordList(trace.fallback_candidates).map((candidate) => providerCandidateLabel("fallback", candidate, "reason"));
  const rejectedLabels = recordList(trace.rejected_candidates).map((candidate) => providerCandidateLabel("rejected", candidate, "reason"));
  const evidenceLabels = [
    decision ? `decision: ${decision}` : "",
    selectedRef ? `selected: ${selectedRef}` : "",
    requestedRef ? `requested: ${requestedRef}` : "",
    capabilityLabel,
    permissionLabel,
  ].filter(Boolean);
  const warnings = stringList(trace.warnings);
  const visible = Boolean(
    decision ||
    requestedRef ||
    selectedRef ||
    failedLabels.length > 0 ||
    fallbackLabels.length > 0 ||
    rejectedLabels.length > 0 ||
    capabilityLabel ||
    permissionLabel ||
    warnings.length > 0
  );

  return {
    visible,
    decision,
    fallbackUsed: trace.fallback_used === true,
    requestedRef,
    selectedRef,
    capabilityLabel,
    permissionLabel,
    failedLabels,
    fallbackLabels,
    rejectedLabels,
    evidenceLabels,
    warnings,
  };
}

function buildProviderCostBudgetDegradationDiagnostic(value: unknown): ProviderCostBudgetDegradationDiagnostic {
  const degradation = recordFromUnknown(value);
  const preflight = recordFromUnknown(degradation.provider_cost_budget_preflight);
  const status = textFromUnknown(degradation.status) || textFromUnknown(preflight.status);
  const requestedRef = textFromUnknown(degradation.requested_model_ref);
  const selectedRef = textFromUnknown(degradation.selected_model_ref);
  const reason = textFromUnknown(degradation.reason);
  const preflightStatus = textFromUnknown(preflight.status);
  const preflightReason = textFromUnknown(preflight.reason);
  const budgetLimitLabel = formatUsdLabel(numberFromUnknown(preflight.budget_limit_usd));
  const previousWindowCostLabel = formatUsdLabel(numberFromUnknown(preflight.previous_window_cost_usd));
  const cumulativeCostLabel = formatUsdLabel(numberFromUnknown(preflight.cumulative_cost_usd));
  const windowLabel = textFromUnknown(preflight.budget_window);
  const onExceededLabel = textFromUnknown(preflight.on_exceeded);
  const evidenceLabels = [
    status ? `status: ${status}` : "",
    reason ? `reason: ${reason}` : "",
    preflightStatus ? `preflight: ${preflightStatus}` : "",
    preflightReason ? `preflight reason: ${preflightReason}` : "",
    windowLabel ? `window: ${windowLabel}` : "",
    onExceededLabel ? `on exceeded: ${onExceededLabel}` : "",
  ].filter(Boolean);
  const visible = Boolean(
    status ||
    requestedRef ||
    selectedRef ||
    reason ||
    preflightStatus ||
    preflightReason ||
    budgetLimitLabel ||
    previousWindowCostLabel ||
    cumulativeCostLabel ||
    windowLabel ||
    onExceededLabel
  );

  return {
    visible,
    status,
    requestedRef,
    selectedRef,
    reason,
    preflightStatus,
    preflightReason,
    budgetLimitLabel,
    previousWindowCostLabel,
    cumulativeCostLabel,
    windowLabel,
    onExceededLabel,
    evidenceLabels,
  };
}

function providerCandidateLabel(prefix: string, candidate: Record<string, unknown>, reasonKey: string) {
  const ref = providerModelRef(candidate);
  const reason = textFromUnknown(candidate[reasonKey]) || textFromUnknown(candidate.reason);
  return `${prefix}: ${ref || "unknown"}${reason ? ` (${reason})` : ""}`;
}

function providerModelRef(value: unknown) {
  const record = recordFromUnknown(value);
  const modelRef = textFromUnknown(record.model_ref) || textFromUnknown(record.modelRef);
  if (modelRef) {
    return modelRef;
  }
  const providerId = textFromUnknown(record.provider_id) || textFromUnknown(record.providerId);
  const model = textFromUnknown(record.model);
  if (providerId && model) {
    return `${providerId}/${model}`;
  }
  return model || providerId;
}

function formatUsdLabel(value: number | null) {
  return value === null ? "" : `$${formatCompactNumber(value)}`;
}

const USER_FACING_STOP_REASONS = new Set([
  "needs_user_clarification",
  "max_iterations_reached",
  "capability_budget_exhausted",
  "permission_required",
  "provider_failed",
  "tool_failed",
  "graph_validation_failed",
  "context_budget_exhausted",
]);

function stopReasonI18nKey(stopReason: string, field: "title" | "description") {
  return USER_FACING_STOP_REASONS.has(stopReason) ? `runDetail.agentStopReasons.${stopReason}.${field}` : "";
}

function latestAgentLoopEvent(events: RunDetail["agent_loop_events"]) {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }
  return [...events].sort((left, right) => compareAgentLoopEvents(right, left))[0] ?? null;
}

function compareAgentLoopEvents(left: NonNullable<RunDetail["agent_loop_events"]>[number], right: NonNullable<RunDetail["agent_loop_events"]>[number]) {
  const leftIteration = numberFromUnknown(left.iteration_index) ?? -1;
  const rightIteration = numberFromUnknown(right.iteration_index) ?? -1;
  if (leftIteration !== rightIteration) {
    return leftIteration - rightIteration;
  }
  return textFromUnknown(left.created_at).localeCompare(textFromUnknown(right.created_at));
}

function reportFromAgentLoopEvent(event: NonNullable<RunDetail["agent_loop_events"]>[number] | null): Record<string, unknown> {
  if (!event) {
    return {};
  }
  const detail = recordFromUnknown(event.detail);
  const budget = recordFromUnknown(event.budget_snapshot);
  const capabilityKind = textFromUnknown(event.capability_kind) || textFromUnknown(detail.selected_capability_kind);
  const capabilityKey = textFromUnknown(event.capability_key) || textFromUnknown(detail.selected_capability_key);
  return {
    decision: textFromUnknown(detail.decision) || textFromUnknown(event.event_kind),
    stop_reason: normalizeStopReason(event.stop_reason) || normalizeStopReason(detail.stop_reason),
    iteration_index: numberFromUnknown(event.iteration_index) ?? numberFromUnknown(budget.iteration_index) ?? numberFromUnknown(detail.iteration_index),
    max_iterations: numberFromUnknown(budget.max_iterations) ?? numberFromUnknown(detail.max_iterations),
    capability_call_count: numberFromUnknown(budget.capability_call_count) ?? numberFromUnknown(detail.capability_call_count),
    max_capability_calls: numberFromUnknown(budget.max_capability_calls) ?? numberFromUnknown(detail.max_capability_calls),
    selected_capability_kind: capabilityKind,
    selected_capability_key: capabilityKey,
    selected_capability_ref:
      textFromUnknown(detail.selected_capability_ref)
      || (capabilityKind && capabilityKey ? `${capabilityKind}:${capabilityKey}` : ""),
    error_type: textFromUnknown(detail.error_type),
    error_message: textFromUnknown(detail.error_message),
    warnings: Array.isArray(detail.warnings) ? detail.warnings : Array.isArray(budget.warnings) ? budget.warnings : [],
  };
}

function diagnosticWarningsFromReport(report: Record<string, unknown>) {
  const warnings = Array.isArray(report.warnings) ? report.warnings.map(textFromUnknown).filter(Boolean) : [];
  const errorType = textFromUnknown(report.error_type);
  const errorMessage = textFromUnknown(report.error_message);
  const errorDetail = errorType && errorMessage ? `${errorType}: ${errorMessage}` : errorMessage || errorType;
  return [...warnings, errorDetail].filter(Boolean).filter((item, index, items) => items.indexOf(item) === index);
}

function normalizeCycleStopReason(value: unknown) {
  const text = textFromUnknown(value);
  if (text === "max_iterations_exceeded" || text === "no_state_change") {
    return "max_iterations_reached";
  }
  return normalizeStopReason(text);
}

function normalizeStopReason(value: unknown) {
  return textFromUnknown(value);
}

function formatBudget(value: number | null, max: number | null) {
  if (value === null && max === null) {
    return "";
  }
  return `${value ?? "?"} / ${max === -1 ? "unlimited" : max ?? "?"}`;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.map(recordFromUnknown).filter((item) => Object.keys(item).length > 0) : [];
}

function stringList(value: unknown) {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }
  return Array.isArray(value) ? value.map(textFromUnknown).filter(Boolean) : [];
}

function textFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

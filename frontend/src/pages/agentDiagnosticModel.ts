import type { RunDetail } from "../types/run.ts";
import { buildCapabilitySelectionDiagnostic, type CapabilitySelectionDiagnostic } from "../lib/capabilitySelectionTrace.ts";

const PROVIDER_FALLBACK_TRACE_RUNTIME_KEYS = [
  "provider_fallback_trace",
  "structured_output_repair_provider_fallback_trace",
  "action_input_provider_fallback_trace",
  "action_input_structured_output_repair_provider_fallback_trace",
  "subgraph_input_provider_fallback_trace",
  "subgraph_input_structured_output_repair_provider_fallback_trace",
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
  capabilitySelection: CapabilitySelectionDiagnostic;
  providerFallback: ProviderFallbackDiagnostic;
  permissionApproval: PermissionApprovalDiagnostic;
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
  const capabilitySelection = buildCapabilitySelectionDiagnostic(
    stateValues.capability_selection_trace,
    stateValues.capability_selection_reason,
  );
  const providerFallback = buildProviderFallbackDiagnostic(resolveProviderFallbackTrace(run, stateValues));
  const permissionApproval = buildPermissionApprovalDiagnostic(run);
  const selectedCapabilityRef = textFromUnknown(report.selected_capability_ref) || capabilitySelection.selectedRef;
  const warnings = diagnosticWarningsFromReport(report);
  const hasLoopEvidence = Boolean(
    decision
    || iterationIndex !== null
    || capabilityCallCount !== null
    || warnings.length > 0
    || capabilitySelection.visible
    || providerFallback.visible
    || permissionApproval.visible
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
    capabilitySelection,
    providerFallback,
    permissionApproval,
  };
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

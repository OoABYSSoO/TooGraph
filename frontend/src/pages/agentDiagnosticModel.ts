import type { RunDetail } from "../types/run.ts";
import { buildCapabilitySelectionDiagnostic, type CapabilitySelectionDiagnostic } from "../lib/capabilitySelectionTrace.ts";

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
  const selectedCapabilityRef = textFromUnknown(report.selected_capability_ref) || capabilitySelection.selectedRef;
  const warnings = Array.isArray(report.warnings) ? report.warnings.map(textFromUnknown).filter(Boolean) : [];
  const hasLoopEvidence = Boolean(
    decision
    || iterationIndex !== null
    || capabilityCallCount !== null
    || warnings.length > 0
    || capabilitySelection.visible
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
  };
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
    warnings: Array.isArray(detail.warnings) ? detail.warnings : Array.isArray(budget.warnings) ? budget.warnings : [],
  };
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

function textFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

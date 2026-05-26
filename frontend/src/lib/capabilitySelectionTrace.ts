export type CapabilitySelectionDiagnostic = {
  visible: boolean;
  requestedRef: string;
  selectedRef: string;
  selectionReason: string;
  permissionLabel: string;
  usageLabel: string;
  budgetLabel: string;
  rejectedLabels: string[];
  fallbackLabels: string[];
  evidenceLabels: string[];
};

export function buildCapabilitySelectionDiagnostic(traceValue: unknown, reasonValue?: unknown): CapabilitySelectionDiagnostic {
  const trace = recordFromUnknown(traceValue);
  const requestedRef = formatCapabilityRef(trace?.requested);
  const selectedRef = formatCapabilityRef(trace?.selected);
  const selectionReason = textFromUnknown(reasonValue) || textFromUnknown(trace?.selection_reason);
  const permissionLabel = formatPermissionLabel(trace?.permission_summary);
  const usageLabel = formatUsageLabel(recordFromUnknown(trace?.usage_summary)?.selected);
  const budgetLabel = formatBudgetLabel(trace?.budget_after_call);
  const rejectedLabels = listRecordArray(trace?.rejected_candidates)
    .map((candidate) => formatCandidateLabel("rejected", candidate))
    .filter(Boolean);
  const fallbackLabels = listRecordArray(trace?.fallback_candidates)
    .map((candidate) => formatCandidateLabel("fallback", candidate))
    .filter(Boolean);
  const evidenceLabels = [
    selectedRef ? `selected: ${selectedRef}` : "",
    requestedRef && requestedRef !== selectedRef ? `requested: ${requestedRef}` : "",
    permissionLabel,
    usageLabel,
    budgetLabel,
  ].filter(Boolean);
  return {
    visible: Boolean(
      requestedRef
      || selectedRef
      || selectionReason
      || permissionLabel
      || usageLabel
      || budgetLabel
      || rejectedLabels.length > 0
      || fallbackLabels.length > 0
    ),
    requestedRef,
    selectedRef,
    selectionReason,
    permissionLabel,
    usageLabel,
    budgetLabel,
    rejectedLabels,
    fallbackLabels,
    evidenceLabels,
  };
}

export function listCapabilitySelectionTraceLabels(traceValue: unknown, reasonValue?: unknown) {
  const diagnostic = buildCapabilitySelectionDiagnostic(traceValue, reasonValue);
  return [
    ...diagnostic.evidenceLabels,
    ...diagnostic.rejectedLabels,
    ...diagnostic.fallbackLabels,
  ];
}

function formatCapabilityRef(value: unknown) {
  const record = recordFromUnknown(value);
  if (!record) {
    return "";
  }
  const kind = textFromUnknown(record.kind);
  const key = textFromUnknown(record.key);
  if (kind && key) {
    return `${kind}:${key}`;
  }
  return kind || key;
}

function formatPermissionLabel(value: unknown) {
  const record = recordFromUnknown(value);
  if (!record) {
    return "";
  }
  const permissionTier = textFromUnknown(record.permission_tier) || "none";
  const requiresApproval = record.requires_approval === true;
  if (!permissionTier && !requiresApproval) {
    return "";
  }
  return `permission: ${permissionTier}${requiresApproval ? " approval" : ""}`;
}

function formatUsageLabel(value: unknown) {
  const record = recordFromUnknown(value);
  if (!record) {
    return "";
  }
  const parts: string[] = [];
  const useCount = numberFromUnknown(record.use_count);
  const successRate = numberFromUnknown(record.success_rate);
  const recentFailureCount = numberFromUnknown(record.recent_failure_count);
  if (useCount !== null) {
    parts.push(`${useCount} ${useCount === 1 ? "use" : "uses"}`);
  }
  if (successRate !== null) {
    parts.push(`${formatPercent(successRate)} success`);
  }
  if (recentFailureCount !== null && recentFailureCount > 0) {
    parts.push(`${recentFailureCount} recent ${recentFailureCount === 1 ? "failure" : "failures"}`);
  }
  return parts.length > 0 ? `usage: ${parts.join(", ")}` : "";
}

function formatBudgetLabel(value: unknown) {
  const record = recordFromUnknown(value);
  if (!record) {
    return "";
  }
  const capabilityCallCountAfter = numberFromUnknown(record.capability_call_count_after);
  const maxCapabilityCalls = numberFromUnknown(record.max_capability_calls);
  const remaining = numberFromUnknown(record.remaining_capability_calls_after);
  const exhausted = record.capability_budget_exhausted_after === true;
  const parts: string[] = [];
  if (capabilityCallCountAfter !== null || maxCapabilityCalls !== null) {
    parts.push(`capability calls ${capabilityCallCountAfter ?? "?"} / ${maxCapabilityCalls ?? "?"}`);
  }
  if (remaining !== null) {
    parts.push(`remaining ${remaining}`);
  }
  if (exhausted) {
    parts.push("exhausted");
  }
  return parts.length > 0 ? `budget: ${parts.join(", ")}` : "";
}

function formatPercent(value: number) {
  const percent = value >= 0 && value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}%`;
}

function formatCandidateLabel(prefix: string, value: Record<string, unknown>) {
  const ref = formatCapabilityRef(value);
  if (!ref) {
    return "";
  }
  const reason = textFromUnknown(value.reason);
  return `${prefix}: ${ref}${reason ? ` (${reason})` : ""}`;
}

function listRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map(recordFromUnknown).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function textFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

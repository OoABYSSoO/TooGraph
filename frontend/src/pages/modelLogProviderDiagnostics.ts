export type ProviderRateReservationMetricKey = "provider" | "model" | "estimatedTokens" | "window";
export type ProviderRateReservationTimelineKey = "reservedAt" | "releasedAt" | "expiresAt";
export type ProviderRateReservationTone = "success" | "warning" | "danger" | "neutral";
export type ProviderCredentialMetricKey = "credential" | "source" | "status" | "failures";
export type ProviderCredentialTimelineKey = "lastUsedAt" | "cooldownUntil";
export type ProviderCredentialTone = ProviderRateReservationTone;
export type ProviderCostMetricKey = "estimatedCost" | "budgetLimit" | "window" | "tokens";
export type ProviderCostTone = ProviderRateReservationTone;
export type ProviderCostBudgetDegradationMetricKey = "requested" | "selected" | "budgetLimit" | "previousWindow";
export type ProviderCostBudgetDegradationTone = ProviderRateReservationTone;
export type ProviderRateDecisionMetricKey = "requests" | "tokens" | "concurrency" | "mode";
export type ProviderRateDecisionTone = ProviderRateReservationTone;
export type ProviderCacheMetricKey = "policy" | "mode" | "control" | "eligible";
export type ProviderCacheTone = ProviderRateReservationTone;
export type ProviderFallbackMetricKey = "requested" | "selected" | "failed" | "fallbacks";
export type ProviderFallbackTone = ProviderRateReservationTone;

export type ProviderRateReservationDiagnostic = {
  visible: boolean;
  status: string;
  tone: ProviderRateReservationTone;
  metrics: Array<{ key: ProviderRateReservationMetricKey; value: string }>;
  timeline: Array<{ key: ProviderRateReservationTimelineKey; value: string }>;
  evidenceLabels: string[];
};

type ProviderRateReservationSource = {
  provider_rate_reservation?: unknown;
};

export type ProviderCredentialDiagnostic = {
  visible: boolean;
  status: string;
  tone: ProviderCredentialTone;
  metrics: Array<{ key: ProviderCredentialMetricKey; value: string }>;
  timeline: Array<{ key: ProviderCredentialTimelineKey; value: string }>;
  evidenceLabels: string[];
};

type ProviderCredentialSource = {
  provider_credential?: unknown;
  provider_credential_state_update?: unknown;
};

export type ProviderCostDiagnostic = {
  visible: boolean;
  status: string;
  tone: ProviderCostTone;
  metrics: Array<{ key: ProviderCostMetricKey; value: string }>;
  evidenceLabels: string[];
};

type ProviderCostSource = {
  provider_cost_estimate?: unknown;
};

export type ProviderCostBudgetDegradationDiagnostic = {
  visible: boolean;
  status: string;
  tone: ProviderCostBudgetDegradationTone;
  metrics: Array<{ key: ProviderCostBudgetDegradationMetricKey; value: string }>;
  evidenceLabels: string[];
};

type ProviderCostBudgetDegradationSource = {
  provider_cost_budget_degradation?: unknown;
};

export type ProviderRateDecisionDiagnostic = {
  visible: boolean;
  status: string;
  tone: ProviderRateDecisionTone;
  metrics: Array<{ key: ProviderRateDecisionMetricKey; value: string }>;
  evidenceLabels: string[];
};

type ProviderRateDecisionSource = {
  provider_rate_decision?: unknown;
};

export type ProviderCacheDiagnostic = {
  visible: boolean;
  status: string;
  tone: ProviderCacheTone;
  metrics: Array<{ key: ProviderCacheMetricKey; value: string }>;
  evidenceLabels: string[];
};

type ProviderCacheSource = {
  provider_cache_policy?: unknown;
  provider_cache_decision?: unknown;
};

export type ProviderFallbackDiagnostic = {
  visible: boolean;
  status: string;
  tone: ProviderFallbackTone;
  metrics: Array<{ key: ProviderFallbackMetricKey; value: string }>;
  evidenceLabels: string[];
};

type ProviderFallbackSource = {
  provider_fallback_trace?: unknown;
};

export function buildProviderRateReservationDiagnostic(
  source: ProviderRateReservationSource,
): ProviderRateReservationDiagnostic {
  const reservation = recordFromUnknown(source.provider_rate_reservation);
  if (Object.keys(reservation).length === 0) {
    return emptyProviderRateReservationDiagnostic();
  }

  const decision = recordFromUnknown(reservation.decision);
  const status = textFromUnknown(reservation.status) || textFromUnknown(decision.status);
  const reason = textFromUnknown(reservation.reason) || textFromUnknown(decision.reason);
  const metrics = [
    metric("provider", textFromUnknown(reservation.provider_id)),
    metric("model", textFromUnknown(reservation.model)),
    metric("estimatedTokens", formatTokenCount(numberFromUnknown(reservation.estimated_request_tokens))),
    metric("window", formatSeconds(numberFromUnknown(decision.window_seconds))),
  ].filter((item): item is { key: ProviderRateReservationMetricKey; value: string } => Boolean(item));
  const timeline = [
    timelineItem("reservedAt", textFromUnknown(reservation.reserved_at)),
    timelineItem("releasedAt", textFromUnknown(reservation.released_at)),
    timelineItem("expiresAt", textFromUnknown(reservation.expires_at)),
  ].filter((item): item is { key: ProviderRateReservationTimelineKey; value: string } => Boolean(item));
  const observedRequests = numberFromUnknown(decision.observed_requests);
  const observedTokens = numberFromUnknown(decision.observed_total_tokens);
  const reservedRequests = numberFromUnknown(decision.reserved_requests);
  const reservedTokens = numberFromUnknown(decision.reserved_total_tokens);
  const projectedTokens = numberFromUnknown(decision.projected_total_tokens);
  const limitsExceeded = stringList(decision.limit_exceeded);
  const evidenceLabels = [
    textFromUnknown(decision.status) ? `decision: ${textFromUnknown(decision.status)}` : "",
    reason ? `reason: ${reason}` : "",
    observedRequests !== null || observedTokens !== null
      ? `observed: ${formatRequestCount(observedRequests)} / ${formatTokenCount(observedTokens)}`
      : "",
    reservedRequests !== null || reservedTokens !== null
      ? `reserved: ${formatRequestCount(reservedRequests)} / ${formatTokenCount(reservedTokens)}`
      : "",
    projectedTokens !== null ? `projected: ${formatTokenCount(projectedTokens)}` : "",
    limitsExceeded.length > 0 ? `limits: ${limitsExceeded.join(", ")}` : "",
  ].filter(Boolean);

  return {
    visible: true,
    status,
    tone: toneForReservationStatus(status),
    metrics,
    timeline,
    evidenceLabels,
  };
}

export function buildProviderCredentialDiagnostic(source: ProviderCredentialSource): ProviderCredentialDiagnostic {
  const credential = recordFromUnknown(source.provider_credential);
  const stateUpdate = recordFromUnknown(source.provider_credential_state_update);
  if (Object.keys(credential).length === 0 && Object.keys(stateUpdate).length === 0) {
    return emptyProviderCredentialDiagnostic();
  }

  const status = textFromUnknown(stateUpdate.status) || textFromUnknown(credential.status);
  const previousStatus = textFromUnknown(stateUpdate.previous_status) || textFromUnknown(credential.previous_status);
  const failureCount = numberFromUnknown(stateUpdate.failure_count) ?? numberFromUnknown(credential.failure_count);
  const previousFailureCount = numberFromUnknown(stateUpdate.previous_failure_count);
  const cooldownUntil = textFromUnknown(stateUpdate.cooldown_until) || textFromUnknown(credential.cooldown_until);
  const metrics = [
    credentialMetric("credential", textFromUnknown(stateUpdate.credential_id) || textFromUnknown(credential.credential_id)),
    credentialMetric("source", textFromUnknown(credential.source)),
    credentialMetric("status", status),
    credentialMetric("failures", formatFailureCount(failureCount)),
  ].filter((item): item is { key: ProviderCredentialMetricKey; value: string } => Boolean(item));
  const timeline = [
    credentialTimelineItem("lastUsedAt", textFromUnknown(stateUpdate.last_used_at) || textFromUnknown(credential.last_used_at)),
    credentialTimelineItem("cooldownUntil", cooldownUntil),
  ].filter((item): item is { key: ProviderCredentialTimelineKey; value: string } => Boolean(item));
  const evidenceLabels = [
    textFromUnknown(stateUpdate.outcome) ? `outcome: ${textFromUnknown(stateUpdate.outcome)}` : "",
    previousStatus && status ? `status: ${previousStatus} -> ${status}` : "",
    previousFailureCount !== null && failureCount !== null ? `failures: ${previousFailureCount} -> ${failureCount}` : "",
    hasOwn(stateUpdate, "cooldown_until") && stateUpdate.cooldown_until === null ? "cooldown: cleared" : "",
  ].filter(Boolean);

  return {
    visible: true,
    status,
    tone: toneForCredentialStatus(status),
    metrics,
    timeline,
    evidenceLabels,
  };
}

export function buildProviderCostDiagnostic(source: ProviderCostSource): ProviderCostDiagnostic {
  const estimate = recordFromUnknown(source.provider_cost_estimate);
  if (Object.keys(estimate).length === 0) {
    return emptyProviderCostDiagnostic();
  }

  const status =
    textFromUnknown(estimate.cumulative_budget_status)
    || textFromUnknown(estimate.budget_status)
    || textFromUnknown(estimate.status);
  const totalTokens = numberFromUnknown(estimate.total_tokens)
    ?? sumOptionalNumbers(numberFromUnknown(estimate.input_tokens), numberFromUnknown(estimate.output_tokens));
  const metrics = [
    costMetric("estimatedCost", formatUsd(numberFromUnknown(estimate.estimated_cost_usd))),
    costMetric("budgetLimit", formatUsd(numberFromUnknown(estimate.budget_limit_usd))),
    costMetric("window", textFromUnknown(estimate.budget_window)),
    costMetric("tokens", formatTokenCount(totalTokens)),
  ].filter((item): item is { key: ProviderCostMetricKey; value: string } => Boolean(item));
  const previousWindowCost = numberFromUnknown(estimate.previous_window_cost_usd);
  const cumulativeCost = numberFromUnknown(estimate.cumulative_cost_usd);
  const evidenceLabels = [
    textFromUnknown(estimate.status) ? `status: ${textFromUnknown(estimate.status)}` : "",
    textFromUnknown(estimate.single_call_budget_status)
      ? `single call: ${textFromUnknown(estimate.single_call_budget_status)}`
      : "",
    textFromUnknown(estimate.cumulative_budget_status)
      ? `cumulative: ${textFromUnknown(estimate.cumulative_budget_status)}`
      : "",
    previousWindowCost !== null ? `previous window: ${formatUsd(previousWindowCost)}` : "",
    cumulativeCost !== null ? `cumulative cost: ${formatUsd(cumulativeCost)}` : "",
  ].filter(Boolean);

  return {
    visible: true,
    status,
    tone: toneForBudgetStatus(status),
    metrics,
    evidenceLabels,
  };
}

export function buildProviderCostBudgetDegradationDiagnostic(
  source: ProviderCostBudgetDegradationSource,
): ProviderCostBudgetDegradationDiagnostic {
  const degradation = recordFromUnknown(source.provider_cost_budget_degradation);
  if (Object.keys(degradation).length === 0) {
    return emptyProviderCostBudgetDegradationDiagnostic();
  }

  const preflight = recordFromUnknown(degradation.provider_cost_budget_preflight);
  const status = textFromUnknown(degradation.status) || textFromUnknown(preflight.status);
  const metrics = [
    costBudgetDegradationMetric("requested", textFromUnknown(degradation.requested_model_ref)),
    costBudgetDegradationMetric("selected", textFromUnknown(degradation.selected_model_ref)),
    costBudgetDegradationMetric("budgetLimit", formatUsd(numberFromUnknown(preflight.budget_limit_usd))),
    costBudgetDegradationMetric("previousWindow", formatUsd(numberFromUnknown(preflight.previous_window_cost_usd))),
  ].filter((item): item is { key: ProviderCostBudgetDegradationMetricKey; value: string } => Boolean(item));
  const evidenceLabels = [
    textFromUnknown(degradation.reason) ? `reason: ${textFromUnknown(degradation.reason)}` : "",
    textFromUnknown(preflight.status) ? `preflight: ${textFromUnknown(preflight.status)}` : "",
    textFromUnknown(preflight.reason) ? `preflight reason: ${textFromUnknown(preflight.reason)}` : "",
    textFromUnknown(preflight.budget_window) ? `window: ${textFromUnknown(preflight.budget_window)}` : "",
    textFromUnknown(preflight.on_exceeded) ? `on exceeded: ${textFromUnknown(preflight.on_exceeded)}` : "",
    formatUsd(numberFromUnknown(preflight.cumulative_cost_usd))
      ? `cumulative cost: ${formatUsd(numberFromUnknown(preflight.cumulative_cost_usd))}`
      : "",
  ].filter(Boolean);

  return {
    visible: true,
    status,
    tone: toneForCostBudgetDegradation(status),
    metrics,
    evidenceLabels,
  };
}

export function buildProviderRateDecisionDiagnostic(
  source: ProviderRateDecisionSource,
): ProviderRateDecisionDiagnostic {
  const decision = recordFromUnknown(source.provider_rate_decision);
  if (Object.keys(decision).length === 0) {
    return emptyProviderRateDecisionDiagnostic();
  }

  const status = textFromUnknown(decision.status);
  const limitsExceeded = stringList(decision.limit_exceeded);
  const metrics = [
    rateDecisionMetric(
      "requests",
      formatLimitUsage(numberFromUnknown(decision.observed_requests), numberFromUnknown(decision.requests_per_minute), "req"),
    ),
    rateDecisionMetric(
      "tokens",
      formatLimitUsage(numberFromUnknown(decision.observed_total_tokens), numberFromUnknown(decision.tokens_per_minute), "tokens"),
    ),
    rateDecisionMetric("concurrency", formatCompactNumberFromUnknown(decision.concurrency)),
    rateDecisionMetric("mode", textFromUnknown(decision.mode)),
  ].filter((item): item is { key: ProviderRateDecisionMetricKey; value: string } => Boolean(item));
  const evidenceLabels = [
    textFromUnknown(decision.scope) ? `scope: ${textFromUnknown(decision.scope)}` : "",
    textFromUnknown(decision.reason) ? `reason: ${textFromUnknown(decision.reason)}` : "",
    limitsExceeded.length > 0 ? `limits: ${limitsExceeded.join(", ")}` : "",
  ].filter(Boolean);

  return {
    visible: true,
    status,
    tone: toneForRateDecisionStatus(status),
    metrics,
    evidenceLabels,
  };
}

export function buildProviderCacheDiagnostic(source: ProviderCacheSource): ProviderCacheDiagnostic {
  const decision = recordFromUnknown(source.provider_cache_decision);
  const policy = textFromUnknown(source.provider_cache_policy) || textFromUnknown(decision.requested_policy);
  if (!policy && Object.keys(decision).length === 0) {
    return emptyProviderCacheDiagnostic();
  }

  const mode = textFromUnknown(decision.mode);
  const providerCacheControl = textFromUnknown(decision.provider_cache_control);
  const eligible = booleanFromUnknown(decision.eligible);
  const providerUsage = Object.keys(recordFromUnknown(decision.provider_usage)).length > 0
    ? recordFromUnknown(decision.provider_usage)
    : recordFromUnknown(decision.usage);
  const cacheCreationTokens = numberFromUnknown(providerUsage.cache_creation_input_tokens);
  const cacheReadTokens = numberFromUnknown(providerUsage.cache_read_input_tokens);
  const invalidators = stringList(decision.invalidators);
  const cacheResourceStatus = textFromUnknown(decision.cache_resource_status);
  const cachedContentName = textFromUnknown(decision.cached_content_name);
  const cachedContentExpiresAt = textFromUnknown(decision.cached_content_expires_at);
  const metrics = [
    cacheMetric("policy", policy),
    cacheMetric("mode", mode),
    cacheMetric("control", providerCacheControl),
    cacheMetric("eligible", formatEligibility(eligible)),
  ].filter((item): item is { key: ProviderCacheMetricKey; value: string } => Boolean(item));
  const evidenceLabels = [
    textFromUnknown(decision.reason) ? `reason: ${textFromUnknown(decision.reason)}` : "",
    formatCharCount(numberFromUnknown(decision.stable_prefix_chars))
      ? `stable prefix: ${formatCharCount(numberFromUnknown(decision.stable_prefix_chars))}`
      : "",
    formatCharCount(numberFromUnknown(decision.dynamic_suffix_chars))
      ? `dynamic suffix: ${formatCharCount(numberFromUnknown(decision.dynamic_suffix_chars))}`
      : "",
    invalidators.length > 0 ? `invalidators: ${invalidators.join(", ")}` : "",
    cacheResourceStatus && cachedContentName ? `resource: ${cacheResourceStatus} ${cachedContentName}` : "",
    cachedContentExpiresAt ? `expires: ${cachedContentExpiresAt}` : "",
    formatCacheUsage(cacheCreationTokens, cacheReadTokens)
      ? `cache usage: ${formatCacheUsage(cacheCreationTokens, cacheReadTokens)}`
      : "",
  ].filter(Boolean);

  return {
    visible: true,
    status: providerCacheControl || mode || policy,
    tone: toneForCacheDecision(policy, mode, providerCacheControl, eligible),
    metrics,
    evidenceLabels,
  };
}

export function buildProviderFallbackDiagnostic(source: ProviderFallbackSource): ProviderFallbackDiagnostic {
  const trace = recordFromUnknown(source.provider_fallback_trace);
  if (Object.keys(trace).length === 0) {
    return emptyProviderFallbackDiagnostic();
  }

  const decision = textFromUnknown(trace.decision);
  const requestedRef = candidateRef(recordFromUnknown(trace.requested));
  const selectedRef = candidateRef(recordFromUnknown(trace.selected));
  const failedCandidates = recordList(trace.failed_candidates);
  const fallbackCandidates = recordList(trace.fallback_candidates);
  const rejectedCandidates = recordList(trace.rejected_candidates);
  const metrics = [
    fallbackMetric("requested", requestedRef),
    fallbackMetric("selected", selectedRef),
    fallbackMetric("failed", formatItemCount(failedCandidates.length, "failed")),
    fallbackMetric("fallbacks", formatItemCount(fallbackCandidates.length, "fallback")),
  ].filter((item): item is { key: ProviderFallbackMetricKey; value: string } => Boolean(item));
  const requiredCapabilities = stringList(trace.required_capabilities);
  const requiredPermissions = stringList(trace.required_permissions);
  const evidenceLabels = [
    ...failedCandidates.map((candidate) => candidateLabel("failed", candidate, "error_type")),
    ...fallbackCandidates.map((candidate) => candidateLabel("fallback", candidate, "reason")),
    ...rejectedCandidates.map((candidate) => candidateLabel("rejected", candidate, "reason")),
    requiredCapabilities.length > 0 ? `capabilities: ${requiredCapabilities.join(", ")}` : "",
    requiredPermissions.length > 0 ? `permissions: ${requiredPermissions.join(", ")}` : "",
    ...stringList(trace.warnings).map((warning) => `warning: ${warning}`),
  ].filter(Boolean);

  return {
    visible: true,
    status: decision,
    tone: toneForFallbackDecision(decision, booleanFromUnknown(trace.fallback_used)),
    metrics,
    evidenceLabels,
  };
}

function emptyProviderRateReservationDiagnostic(): ProviderRateReservationDiagnostic {
  return {
    visible: false,
    status: "",
    tone: "neutral",
    metrics: [],
    timeline: [],
    evidenceLabels: [],
  };
}

function emptyProviderCredentialDiagnostic(): ProviderCredentialDiagnostic {
  return {
    visible: false,
    status: "",
    tone: "neutral",
    metrics: [],
    timeline: [],
    evidenceLabels: [],
  };
}

function emptyProviderCostDiagnostic(): ProviderCostDiagnostic {
  return {
    visible: false,
    status: "",
    tone: "neutral",
    metrics: [],
    evidenceLabels: [],
  };
}

function emptyProviderCostBudgetDegradationDiagnostic(): ProviderCostBudgetDegradationDiagnostic {
  return {
    visible: false,
    status: "",
    tone: "neutral",
    metrics: [],
    evidenceLabels: [],
  };
}

function emptyProviderRateDecisionDiagnostic(): ProviderRateDecisionDiagnostic {
  return {
    visible: false,
    status: "",
    tone: "neutral",
    metrics: [],
    evidenceLabels: [],
  };
}

function emptyProviderCacheDiagnostic(): ProviderCacheDiagnostic {
  return {
    visible: false,
    status: "",
    tone: "neutral",
    metrics: [],
    evidenceLabels: [],
  };
}

function emptyProviderFallbackDiagnostic(): ProviderFallbackDiagnostic {
  return {
    visible: false,
    status: "",
    tone: "neutral",
    metrics: [],
    evidenceLabels: [],
  };
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanFromUnknown(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return null;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.map(recordFromUnknown).filter((item) => Object.keys(item).length > 0) : [];
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function metric(key: ProviderRateReservationMetricKey, value: string) {
  return value ? { key, value } : null;
}

function timelineItem(key: ProviderRateReservationTimelineKey, value: string) {
  return value ? { key, value } : null;
}

function credentialMetric(key: ProviderCredentialMetricKey, value: string) {
  return value ? { key, value } : null;
}

function credentialTimelineItem(key: ProviderCredentialTimelineKey, value: string) {
  return value ? { key, value } : null;
}

function costMetric(key: ProviderCostMetricKey, value: string) {
  return value ? { key, value } : null;
}

function costBudgetDegradationMetric(key: ProviderCostBudgetDegradationMetricKey, value: string) {
  return value ? { key, value } : null;
}

function rateDecisionMetric(key: ProviderRateDecisionMetricKey, value: string) {
  return value ? { key, value } : null;
}

function cacheMetric(key: ProviderCacheMetricKey, value: string) {
  return value ? { key, value } : null;
}

function fallbackMetric(key: ProviderFallbackMetricKey, value: string) {
  return value ? { key, value } : null;
}

function formatTokenCount(value: number | null) {
  return value === null ? "" : `${formatCompactNumber(value)} tokens`;
}

function formatRequestCount(value: number | null) {
  return value === null ? "0 req" : `${formatCompactNumber(value)} req`;
}

function formatSeconds(value: number | null) {
  return value === null ? "" : `${formatCompactNumber(value)}s`;
}

function formatFailureCount(value: number | null) {
  return value === null ? "" : `${formatCompactNumber(value)} failures`;
}

function formatUsd(value: number | null) {
  return value === null ? "" : `$${formatCompactNumber(value)}`;
}

function formatCharCount(value: number | null) {
  return value === null ? "" : `${formatCompactNumber(value)} chars`;
}

function formatEligibility(value: boolean | null) {
  if (value === true) {
    return "eligible";
  }
  if (value === false) {
    return "ineligible";
  }
  return "";
}

function formatCacheUsage(cacheCreationTokens: number | null, cacheReadTokens: number | null) {
  if (cacheCreationTokens === null && cacheReadTokens === null) {
    return "";
  }
  return `${formatCompactNumber(cacheCreationTokens ?? 0)} create / ${formatCompactNumber(cacheReadTokens ?? 0)} read`;
}

function formatItemCount(count: number, singular: string) {
  if (count <= 0) {
    return "";
  }
  return `${formatCompactNumber(count)} ${count === 1 ? singular : `${singular}s`}`;
}

function candidateRef(candidate: Record<string, unknown>) {
  return textFromUnknown(candidate.model_ref)
    || [textFromUnknown(candidate.provider_id), textFromUnknown(candidate.model)].filter(Boolean).join("/");
}

function candidateLabel(prefix: string, candidate: Record<string, unknown>, preferredReasonKey: string) {
  const ref = candidateRef(candidate);
  if (!ref) {
    return "";
  }
  const reason =
    textFromUnknown(candidate[preferredReasonKey])
    || textFromUnknown(candidate.reason)
    || textFromUnknown(candidate.status);
  return reason ? `${prefix}: ${ref} (${reason})` : `${prefix}: ${ref}`;
}

function formatLimitUsage(observed: number | null, limit: number | null, unit: string) {
  if (observed !== null && limit !== null) {
    return `${formatCompactNumber(observed)} / ${formatCompactNumber(limit)} ${unit}`;
  }
  if (observed !== null) {
    return `${formatCompactNumber(observed)} ${unit}`;
  }
  if (limit !== null) {
    return `${formatCompactNumber(limit)} ${unit} limit`;
  }
  return "";
}

function formatCompactNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function formatCompactNumberFromUnknown(value: unknown) {
  const number = numberFromUnknown(value);
  return number === null ? "" : formatCompactNumber(number);
}

function sumOptionalNumbers(...values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? present.reduce((total, value) => total + value, 0) : null;
}

function toneForReservationStatus(status: string): ProviderRateReservationTone {
  if (["released", "success", "within_profile"].includes(status)) {
    return "success";
  }
  if (["reserved", "active", "pending", "waiting"].includes(status)) {
    return "warning";
  }
  if (["blocked", "failed", "error", "exceeded"].includes(status)) {
    return "danger";
  }
  return "neutral";
}

function toneForCredentialStatus(status: string): ProviderCredentialTone {
  if (status === "active") {
    return "success";
  }
  if (status === "cooling_down") {
    return "warning";
  }
  if (["exhausted", "disabled"].includes(status)) {
    return "danger";
  }
  return "neutral";
}

function toneForBudgetStatus(status: string): ProviderCostTone {
  if (status === "within_budget") {
    return "success";
  }
  if (["over_budget", "blocked", "exceeded"].includes(status)) {
    return "danger";
  }
  return "neutral";
}

function toneForCostBudgetDegradation(status: string): ProviderCostBudgetDegradationTone {
  if (["applied", "degraded", "fallback_selected"].includes(status)) {
    return "warning";
  }
  if (["failed", "blocked", "exceeded"].includes(status)) {
    return "danger";
  }
  return "neutral";
}

function toneForRateDecisionStatus(status: string): ProviderRateDecisionTone {
  if (status === "within_profile") {
    return "success";
  }
  if (["over_limit", "blocked", "exceeded"].includes(status)) {
    return "danger";
  }
  return "neutral";
}

function toneForCacheDecision(
  policy: string,
  mode: string,
  providerCacheControl: string,
  eligible: boolean | null,
): ProviderCacheTone {
  if (mode === "provider_applied" || providerCacheControl === "anthropic_cache_control") {
    return "success";
  }
  if (policy === "prefer" && eligible === false) {
    return "warning";
  }
  if (["not_applied", "not_supported"].includes(providerCacheControl) || mode === "audit_only") {
    return "warning";
  }
  return "neutral";
}

function toneForFallbackDecision(decision: string, fallbackUsed: boolean | null): ProviderFallbackTone {
  if (fallbackUsed === true || decision === "fallback_selected") {
    return "warning";
  }
  if (["no_fallback", "fallback_failed", "all_fallbacks_failed"].includes(decision)) {
    return "danger";
  }
  return "neutral";
}

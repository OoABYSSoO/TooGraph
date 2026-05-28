export type ProviderRateReservationMetricKey = "provider" | "model" | "estimatedTokens" | "window";
export type ProviderRateReservationTimelineKey = "reservedAt" | "releasedAt" | "expiresAt";
export type ProviderRateReservationTone = "success" | "warning" | "danger" | "neutral";

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

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function metric(key: ProviderRateReservationMetricKey, value: string) {
  return value ? { key, value } : null;
}

function timelineItem(key: ProviderRateReservationTimelineKey, value: string) {
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

function formatCompactNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
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

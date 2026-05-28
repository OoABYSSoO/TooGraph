import assert from "node:assert/strict";
import test from "node:test";

import { buildProviderRateReservationDiagnostic } from "./modelLogProviderDiagnostics.ts";

test("buildProviderRateReservationDiagnostic hides when no reservation exists", () => {
  const diagnostic = buildProviderRateReservationDiagnostic({});

  assert.equal(diagnostic.visible, false);
  assert.equal(diagnostic.status, "");
  assert.deepEqual(diagnostic.metrics, []);
  assert.deepEqual(diagnostic.timeline, []);
  assert.deepEqual(diagnostic.evidenceLabels, []);
});

test("buildProviderRateReservationDiagnostic formats released reservation evidence", () => {
  const diagnostic = buildProviderRateReservationDiagnostic({
    provider_rate_reservation: {
      kind: "provider_rate_reservation",
      status: "released",
      provider_id: "local",
      model: "qwen3",
      estimated_request_tokens: 42,
      reserved_at: "2026-05-28T01:00:00Z",
      released_at: "2026-05-28T01:00:02Z",
      expires_at: "2026-05-28T01:01:00Z",
      decision: {
        status: "within_profile",
        observed_requests: 1,
        observed_total_tokens: 80,
        reserved_requests: 1,
        reserved_total_tokens: 42,
        projected_total_tokens: 122,
        window_seconds: 60,
      },
    },
  });

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.status, "released");
  assert.equal(diagnostic.tone, "success");
  assert.deepEqual(diagnostic.metrics, [
    { key: "provider", value: "local" },
    { key: "model", value: "qwen3" },
    { key: "estimatedTokens", value: "42 tokens" },
    { key: "window", value: "60s" },
  ]);
  assert.deepEqual(diagnostic.timeline, [
    { key: "reservedAt", value: "2026-05-28T01:00:00Z" },
    { key: "releasedAt", value: "2026-05-28T01:00:02Z" },
    { key: "expiresAt", value: "2026-05-28T01:01:00Z" },
  ]);
  assert.deepEqual(diagnostic.evidenceLabels, [
    "decision: within_profile",
    "observed: 1 req / 80 tokens",
    "reserved: 1 req / 42 tokens",
    "projected: 122 tokens",
  ]);
});

test("buildProviderRateReservationDiagnostic marks blocked reservations as danger", () => {
  const diagnostic = buildProviderRateReservationDiagnostic({
    provider_rate_reservation: {
      kind: "provider_rate_reservation",
      status: "blocked",
      reason: "provider_rate_profile_projected_window_exhausted",
      decision: {
        status: "blocked",
        limit_exceeded: ["tokens_per_minute"],
      },
    },
  });

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.status, "blocked");
  assert.equal(diagnostic.tone, "danger");
  assert.deepEqual(diagnostic.evidenceLabels, [
    "decision: blocked",
    "reason: provider_rate_profile_projected_window_exhausted",
    "limits: tokens_per_minute",
  ]);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProviderCacheDiagnostic,
  buildProviderCostBudgetDegradationDiagnostic,
  buildProviderCredentialDiagnostic,
  buildProviderCostDiagnostic,
  buildProviderFallbackDiagnostic,
  buildProviderRateDecisionDiagnostic,
  buildProviderRateReservationDiagnostic,
} from "./modelLogProviderDiagnostics.ts";

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

test("buildProviderCredentialDiagnostic hides when no credential evidence exists", () => {
  const diagnostic = buildProviderCredentialDiagnostic({});

  assert.equal(diagnostic.visible, false);
  assert.equal(diagnostic.status, "");
  assert.deepEqual(diagnostic.metrics, []);
  assert.deepEqual(diagnostic.timeline, []);
  assert.deepEqual(diagnostic.evidenceLabels, []);
});

test("buildProviderCredentialDiagnostic formats exhausted credential state updates", () => {
  const diagnostic = buildProviderCredentialDiagnostic({
    provider_credential: {
      credential_id: "primary",
      status: "active",
      source: "credential_pool",
      last_used_at: "2026-05-29T02:59:00Z",
    },
    provider_credential_state_update: {
      kind: "provider_credential_state_update",
      outcome: "failure",
      credential_id: "primary",
      previous_status: "cooling_down",
      status: "exhausted",
      previous_failure_count: 4,
      failure_count: 5,
      last_used_at: "2026-05-29T03:00:00Z",
      cooldown_until: null,
    },
  });

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.status, "exhausted");
  assert.equal(diagnostic.tone, "danger");
  assert.deepEqual(diagnostic.metrics, [
    { key: "credential", value: "primary" },
    { key: "source", value: "credential_pool" },
    { key: "status", value: "exhausted" },
    { key: "failures", value: "5 failures" },
  ]);
  assert.deepEqual(diagnostic.timeline, [
    { key: "lastUsedAt", value: "2026-05-29T03:00:00Z" },
  ]);
  assert.deepEqual(diagnostic.evidenceLabels, [
    "outcome: failure",
    "status: cooling_down -> exhausted",
    "failures: 4 -> 5",
    "cooldown: cleared",
  ]);
});

test("buildProviderCredentialDiagnostic explains selected active credentials", () => {
  const diagnostic = buildProviderCredentialDiagnostic({
    provider_credential: {
      credential_id: "backup",
      status: "active",
      source: "credential_pool",
      previous_status: "cooling_down",
      failure_count: 0,
      last_used_at: "2026-05-29T03:04:00Z",
      cooldown_until: "2026-05-29T03:03:00Z",
    },
  });

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.status, "active");
  assert.equal(diagnostic.tone, "success");
  assert.deepEqual(diagnostic.metrics, [
    { key: "credential", value: "backup" },
    { key: "source", value: "credential_pool" },
    { key: "status", value: "active" },
    { key: "failures", value: "0 failures" },
  ]);
  assert.deepEqual(diagnostic.timeline, [
    { key: "lastUsedAt", value: "2026-05-29T03:04:00Z" },
    { key: "cooldownUntil", value: "2026-05-29T03:03:00Z" },
  ]);
  assert.deepEqual(diagnostic.evidenceLabels, [
    "status: cooling_down -> active",
  ]);
});

test("buildProviderCostDiagnostic hides when no cost estimate exists", () => {
  const diagnostic = buildProviderCostDiagnostic({});

  assert.equal(diagnostic.visible, false);
  assert.equal(diagnostic.status, "");
  assert.deepEqual(diagnostic.metrics, []);
  assert.deepEqual(diagnostic.evidenceLabels, []);
});

test("buildProviderCostDiagnostic formats cumulative budget evidence", () => {
  const diagnostic = buildProviderCostDiagnostic({
    provider_cost_estimate: {
      kind: "provider_cost_estimate",
      status: "estimated",
      input_tokens: 1000,
      output_tokens: 500,
      total_tokens: 1500,
      input_cost_usd: 0.002,
      output_cost_usd: 0.004,
      estimated_cost_usd: 0.012,
      budget_limit_usd: 0.01,
      budget_window: "run",
      budget_status: "over_budget",
      single_call_budget_status: "within_budget",
      previous_window_cost_usd: 0.006,
      cumulative_cost_usd: 0.012,
      cumulative_budget_status: "over_budget",
    },
  });

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.status, "over_budget");
  assert.equal(diagnostic.tone, "danger");
  assert.deepEqual(diagnostic.metrics, [
    { key: "estimatedCost", value: "$0.012" },
    { key: "budgetLimit", value: "$0.01" },
    { key: "window", value: "run" },
    { key: "tokens", value: "1500 tokens" },
  ]);
  assert.deepEqual(diagnostic.evidenceLabels, [
    "status: estimated",
    "single call: within_budget",
    "cumulative: over_budget",
    "previous window: $0.006",
    "cumulative cost: $0.012",
  ]);
});

test("buildProviderCostBudgetDegradationDiagnostic hides when no degradation trace exists", () => {
  const diagnostic = buildProviderCostBudgetDegradationDiagnostic({});

  assert.equal(diagnostic.visible, false);
  assert.equal(diagnostic.status, "");
  assert.deepEqual(diagnostic.metrics, []);
  assert.deepEqual(diagnostic.evidenceLabels, []);
});

test("buildProviderCostBudgetDegradationDiagnostic formats selected budget fallback evidence", () => {
  const diagnostic = buildProviderCostBudgetDegradationDiagnostic({
    provider_cost_budget_degradation: {
      kind: "provider_cost_budget_degradation",
      status: "applied",
      reason: "provider_cost_budget_degradation_selected",
      requested_model_ref: "openai/gpt-primary",
      selected_model_ref: "local/gpt-economy",
      provider_cost_budget_preflight: {
        kind: "provider_cost_budget_preflight",
        status: "blocked",
        reason: "provider_cost_budget_already_exhausted",
        budget_limit_usd: 0.01,
        previous_window_cost_usd: 0.012,
        cumulative_cost_usd: 0.012,
        budget_window: "run",
        on_exceeded: "degrade_model",
      },
    },
  });

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.status, "applied");
  assert.equal(diagnostic.tone, "warning");
  assert.deepEqual(diagnostic.metrics, [
    { key: "requested", value: "openai/gpt-primary" },
    { key: "selected", value: "local/gpt-economy" },
    { key: "budgetLimit", value: "$0.01" },
    { key: "previousWindow", value: "$0.012" },
  ]);
  assert.deepEqual(diagnostic.evidenceLabels, [
    "reason: provider_cost_budget_degradation_selected",
    "preflight: blocked",
    "preflight reason: provider_cost_budget_already_exhausted",
    "window: run",
    "on exceeded: degrade_model",
    "cumulative cost: $0.012",
  ]);
});

test("buildProviderRateDecisionDiagnostic formats over-limit rate evidence", () => {
  const diagnostic = buildProviderRateDecisionDiagnostic({
    provider_rate_decision: {
      kind: "provider_rate_decision",
      mode: "audit_only",
      scope: "single_call",
      status: "over_limit",
      requests_per_minute: 30,
      tokens_per_minute: 1200,
      concurrency: 2,
      observed_requests: 1,
      observed_total_tokens: 1500,
      limit_exceeded: ["tokens_per_minute"],
      reason: "single_call_tokens_exceed_profile",
    },
  });

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.status, "over_limit");
  assert.equal(diagnostic.tone, "danger");
  assert.deepEqual(diagnostic.metrics, [
    { key: "requests", value: "1 / 30 req" },
    { key: "tokens", value: "1500 / 1200 tokens" },
    { key: "concurrency", value: "2" },
    { key: "mode", value: "audit_only" },
  ]);
  assert.deepEqual(diagnostic.evidenceLabels, [
    "scope: single_call",
    "reason: single_call_tokens_exceed_profile",
    "limits: tokens_per_minute",
  ]);
});

test("buildProviderCacheDiagnostic hides when no cache evidence exists", () => {
  const diagnostic = buildProviderCacheDiagnostic({});

  assert.equal(diagnostic.visible, false);
  assert.equal(diagnostic.status, "");
  assert.deepEqual(diagnostic.metrics, []);
  assert.deepEqual(diagnostic.evidenceLabels, []);
});

test("buildProviderCacheDiagnostic formats disabled prompt cache decisions", () => {
  const diagnostic = buildProviderCacheDiagnostic({
    provider_cache_policy: "disabled",
    provider_cache_decision: {
      kind: "prompt_cache_policy",
      requested_policy: "disabled",
      mode: "disabled",
      provider_cache_control: "disabled",
      eligible: false,
      reason: "node_provider_cache_policy_disabled",
      stable_prefix_chars: 1200,
      dynamic_suffix_chars: 320,
      invalidators: ["input_state_keys", "context_refs"],
    },
  });

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.status, "disabled");
  assert.equal(diagnostic.tone, "neutral");
  assert.deepEqual(diagnostic.metrics, [
    { key: "policy", value: "disabled" },
    { key: "mode", value: "disabled" },
    { key: "control", value: "disabled" },
    { key: "eligible", value: "ineligible" },
  ]);
  assert.deepEqual(diagnostic.evidenceLabels, [
    "reason: node_provider_cache_policy_disabled",
    "stable prefix: 1200 chars",
    "dynamic suffix: 320 chars",
    "invalidators: input_state_keys, context_refs",
  ]);
});

test("buildProviderCacheDiagnostic highlights provider-applied cache decisions", () => {
  const diagnostic = buildProviderCacheDiagnostic({
    provider_cache_policy: "prefer",
    provider_cache_decision: {
      kind: "prompt_cache_policy",
      requested_policy: "prefer",
      mode: "provider_applied",
      provider_cache_control: "anthropic_cache_control",
      eligible: true,
      reason: "provider_prompt_cache_control_applied",
      provider_usage: {
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 40,
      },
    },
  });

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.status, "anthropic_cache_control");
  assert.equal(diagnostic.tone, "success");
  assert.deepEqual(diagnostic.metrics, [
    { key: "policy", value: "prefer" },
    { key: "mode", value: "provider_applied" },
    { key: "control", value: "anthropic_cache_control" },
    { key: "eligible", value: "eligible" },
  ]);
  assert.deepEqual(diagnostic.evidenceLabels, [
    "reason: provider_prompt_cache_control_applied",
    "cache usage: 20 create / 40 read",
  ]);
});

test("buildProviderCacheDiagnostic formats provider cache resource lifecycle evidence", () => {
  const diagnostic = buildProviderCacheDiagnostic({
    provider_cache_policy: "prefer",
    provider_cache_decision: {
      kind: "prompt_cache_policy",
      requested_policy: "prefer",
      mode: "provider_applied",
      provider_cache_control: "gemini_cached_content",
      eligible: true,
      reason: "gemini_cached_content_reused",
      cache_resource_status: "reused",
      cached_content_name: "cachedContents/toograph-cache-reused",
      cached_content_expires_at: "2099-05-30T00:00:00Z",
      usage: {
        cache_read_input_tokens: 1234,
      },
    },
  });

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.status, "gemini_cached_content");
  assert.equal(diagnostic.tone, "success");
  assert.deepEqual(diagnostic.evidenceLabels, [
    "reason: gemini_cached_content_reused",
    "resource: reused cachedContents/toograph-cache-reused",
    "expires: 2099-05-30T00:00:00Z",
    "cache usage: 0 create / 1234 read",
  ]);
});

test("buildProviderFallbackDiagnostic hides when no fallback trace exists", () => {
  const diagnostic = buildProviderFallbackDiagnostic({});

  assert.equal(diagnostic.visible, false);
  assert.equal(diagnostic.status, "");
  assert.deepEqual(diagnostic.metrics, []);
  assert.deepEqual(diagnostic.evidenceLabels, []);
});

test("buildProviderFallbackDiagnostic formats selected fallback traces", () => {
  const diagnostic = buildProviderFallbackDiagnostic({
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
  });

  assert.equal(diagnostic.visible, true);
  assert.equal(diagnostic.status, "fallback_selected");
  assert.equal(diagnostic.tone, "warning");
  assert.deepEqual(diagnostic.metrics, [
    { key: "requested", value: "openai/gpt-primary" },
    { key: "selected", value: "local/backup-model" },
    { key: "failed", value: "1 failed" },
    { key: "fallbacks", value: "1 fallback" },
  ]);
  assert.deepEqual(diagnostic.evidenceLabels, [
    "failed: openai/gpt-primary (provider_timeout)",
    "fallback: local/backup-model (compatible_fallback)",
    "rejected: web-gateway/browsing-model (permission_scope_expanded)",
    "capabilities: chat, structured_output",
    "permissions: text_generation",
    "warning: primary provider timed out",
  ]);
});

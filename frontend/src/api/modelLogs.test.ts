import test from "node:test";
import assert from "node:assert/strict";

import { fetchModelLogs, updateModelLogRetention } from "./modelLogs.ts";

test("fetchModelLogs reads paginated model request logs", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        entries: [],
        run_trees: [],
        total: 0,
        page: 2,
        size: 5,
        pages: 0,
        retention: { max_root_runs: 200, cache_resource_retention_days: 30 },
        provider_cache_summary: {
          kind: "provider_cache_summary",
          decision_count: 2,
          provider_applied_count: 2,
          resource_created_count: 1,
          resource_reused_count: 1,
          resource_hit_rate: 0.5,
          cache_creation_input_tokens: 1000,
          cache_read_input_tokens: 2000,
          resource_status_counts: { active: 1, expired: 1 },
          resource_total: 2,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await fetchModelLogs({ page: 2, size: 5, query: "gemma" });
    assert.equal(requestedUrl, "/api/model-logs?page=2&size=5&q=gemma");
    assert.deepEqual(result, {
      entries: [],
      run_trees: [],
      total: 0,
      page: 2,
      size: 5,
      pages: 0,
      retention: { max_root_runs: 200, cache_resource_retention_days: 30 },
      provider_cache_summary: {
        kind: "provider_cache_summary",
        decision_count: 2,
        provider_applied_count: 2,
        resource_created_count: 1,
        resource_reused_count: 1,
        resource_hit_rate: 0.5,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 2000,
        resource_status_counts: { active: 1, expired: 1 },
        resource_total: 2,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateModelLogRetention saves the root-run and cache-resource retention limits", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedBody = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ max_root_runs: 25, cache_resource_retention_days: 45 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await updateModelLogRetention({ max_root_runs: 25, cache_resource_retention_days: 45 });
    assert.equal(requestedUrl, "/api/settings/model-logs");
    assert.equal(requestedBody, JSON.stringify({ max_root_runs: 25, cache_resource_retention_days: 45 }));
    assert.deepEqual(result, { max_root_runs: 25, cache_resource_retention_days: 45 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

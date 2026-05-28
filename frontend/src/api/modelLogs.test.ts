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
        retention: { max_root_runs: 200 },
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
      retention: { max_root_runs: 200 },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateModelLogRetention saves the root-run retention limit", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedBody = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ max_root_runs: 25 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await updateModelLogRetention({ max_root_runs: 25 });
    assert.equal(requestedUrl, "/api/settings/model-logs");
    assert.equal(requestedBody, JSON.stringify({ max_root_runs: 25 }));
    assert.deepEqual(result, { max_root_runs: 25 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

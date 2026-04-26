import test from "node:test";
import assert from "node:assert/strict";

import { fetchModelLogs } from "./modelLogs.ts";

test("fetchModelLogs reads paginated model request logs", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        entries: [],
        total: 0,
        page: 2,
        size: 5,
        pages: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await fetchModelLogs({ page: 2, size: 5, query: "gemma" });
    assert.equal(requestedUrl, "/api/model-logs?page=2&size=5&q=gemma");
    assert.deepEqual(result, { entries: [], total: 0, page: 2, size: 5, pages: 0 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import test from "node:test";
import assert from "node:assert/strict";

import { fetchOperationJournal } from "./operationJournal.ts";

const originalFetch = globalThis.fetch;

test("fetchOperationJournal queries journal entries with run filters and abort signals", async () => {
  let requestedUrl = "";
  let requestSignal: AbortSignal | null = null;
  const controller = new AbortController();

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestSignal = init?.signal ?? null;
    return new Response(
      JSON.stringify({
        entries: [],
        total: 0,
        page: 2,
        size: 10,
        pages: 0,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const response = await fetchOperationJournal(
      {
        page: 2,
        size: 10,
        runId: " run parent ",
        operationRequestId: " vop_123 ",
        status: " succeeded ",
      },
      { signal: controller.signal },
    );

    assert.equal(
      requestedUrl,
      "/api/operation-journal?page=2&size=10&run_id=run+parent&operation_request_id=vop_123&status=succeeded",
    );
    assert.equal(requestSignal, controller.signal);
    assert.deepEqual(response, { entries: [], total: 0, page: 2, size: 10, pages: 0 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

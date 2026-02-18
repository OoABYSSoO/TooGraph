import test from "node:test";
import assert from "node:assert/strict";

import { fetchRun, resumeRun } from "./runs.ts";

const originalFetch = globalThis.fetch;

test("resumeRun posts checkpoint state overrides to the run resume endpoint", async () => {
  let requestedUrl = "";
  let requestBody = "";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ run_id: "run-2", status: "resuming" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  const response = await resumeRun("run-1", { answer: "edited" });

  assert.equal(requestedUrl, "/api/runs/run-1/resume");
  assert.deepEqual(JSON.parse(requestBody), { resume: { answer: "edited" } });
  assert.deepEqual(response, { run_id: "run-2", status: "resuming" });

  globalThis.fetch = originalFetch;
});

test("fetchRun forwards abort signals to the run detail request", async () => {
  let requestedUrl = "";
  let requestSignal: AbortSignal | null = null;
  const controller = new AbortController();

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestSignal = init?.signal ?? null;
    return new Response(
      JSON.stringify({
        run_id: "run-1",
        graph_id: "graph-1",
        graph_name: "Demo",
        status: "completed",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  await fetchRun("run-1", { signal: controller.signal });

  assert.equal(requestedUrl, "/api/runs/run-1");
  assert.equal(requestSignal, controller.signal);

  globalThis.fetch = originalFetch;
});

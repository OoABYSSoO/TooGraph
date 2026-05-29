import test from "node:test";
import assert from "node:assert/strict";

import {
  createScheduledGraphJob,
  fetchScheduledGraphJobRuns,
  fetchScheduledGraphJobs,
  runScheduledGraphJob,
  setScheduledGraphJobEnabled,
  updateScheduledGraphJob,
} from "./scheduler.ts";

const originalFetch = globalThis.fetch;

test("fetchScheduledGraphJobs requests disabled official jobs by default", async () => {
  let requestedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await fetchScheduledGraphJobs();

  assert.equal(requestedUrl, "/api/scheduler/jobs?include_disabled=true");
  globalThis.fetch = originalFetch;
});

test("setScheduledGraphJobEnabled patches the enabled state", async () => {
  let requestedUrl = "";
  let requestBody = "";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ job_id: "job_1", enabled: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await setScheduledGraphJobEnabled("job_1", true);

  assert.equal(requestedUrl, "/api/scheduler/jobs/job_1/enabled");
  assert.deepEqual(JSON.parse(requestBody), { enabled: true });
  globalThis.fetch = originalFetch;
});

test("createScheduledGraphJob posts a graph job payload", async () => {
  let requestedUrl = "";
  let requestBody = "";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ job_id: "job_1", template_id: "template_1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await createScheduledGraphJob({
    name: "Daily job",
    template_id: "template_1",
    input_bindings: { prompt: "run" },
    schedule_kind: "interval",
    schedule_expr: "PT24H",
    timezone: "UTC",
    enabled: false,
    metadata: { source: "user" },
  });

  assert.equal(requestedUrl, "/api/scheduler/jobs");
  assert.deepEqual(JSON.parse(requestBody), {
    name: "Daily job",
    template_id: "template_1",
    input_bindings: { prompt: "run" },
    schedule_kind: "interval",
    schedule_expr: "PT24H",
    timezone: "UTC",
    enabled: false,
    metadata: { source: "user" },
  });
  globalThis.fetch = originalFetch;
});

test("updateScheduledGraphJob patches editable graph job fields", async () => {
  let requestedUrl = "";
  let requestBody = "";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ job_id: "job_1", template_id: "template_2" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await updateScheduledGraphJob("job_1", {
    name: "Daily job",
    template_id: "template_2",
    input_bindings: { prompt: "run" },
    schedule_kind: "interval",
    schedule_expr: "PT1H",
    timezone: "UTC",
    enabled: true,
    delivery_target: {
      kind: "message_outlet",
      outlet: "buddy",
      session_mode: "existing_session",
      buddy_session_id: "session_1",
    },
  });

  assert.equal(requestedUrl, "/api/scheduler/jobs/job_1");
  assert.deepEqual(JSON.parse(requestBody), {
    name: "Daily job",
    template_id: "template_2",
    input_bindings: { prompt: "run" },
    schedule_kind: "interval",
    schedule_expr: "PT1H",
    timezone: "UTC",
    enabled: true,
    delivery_target: {
      kind: "message_outlet",
      outlet: "buddy",
      session_mode: "existing_session",
      buddy_session_id: "session_1",
    },
  });
  globalThis.fetch = originalFetch;
});

test("runScheduledGraphJob requests a manual graph run through scheduler", async () => {
  let requestedUrl = "";
  let requestBody = "";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ run_id: "run_1", status: "queued", job_run: { job_run_id: "jr_1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await runScheduledGraphJob("job_1");

  assert.equal(requestedUrl, "/api/scheduler/jobs/job_1/run");
  assert.deepEqual(JSON.parse(requestBody), { trigger_reason: "manual", requested_by: "scheduler_page" });
  globalThis.fetch = originalFetch;
});

test("fetchScheduledGraphJobRuns requests run history for one job", async () => {
  let requestedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await fetchScheduledGraphJobRuns("job_1");

  assert.equal(requestedUrl, "/api/scheduler/jobs/job_1/runs");
  globalThis.fetch = originalFetch;
});

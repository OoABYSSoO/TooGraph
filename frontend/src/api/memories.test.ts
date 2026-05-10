import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPlatformMemoryCandidate,
  archivePlatformMemory,
  fetchPlatformMemories,
  fetchPlatformMemoryEvents,
  fetchPlatformMemoryRevisions,
  replacePlatformMemoryCandidate,
  restorePlatformMemoryRevision,
} from "./memories.ts";

const originalFetch = globalThis.fetch;

test("platform memory API lists candidate memories with explicit filters", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await fetchPlatformMemories({ scope: "project", status: "candidate", includeInactive: true });

  assert.deepEqual(requests, ["/api/memories?scope=project&status=candidate&include_inactive=true"]);
  globalThis.fetch = originalFetch;
});

test("platform memory API sends lifecycle review actions", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ id: "mem_1", status: "active" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await applyPlatformMemoryCandidate("mem 1", "Approved.");
  await replacePlatformMemoryCandidate("mem_2", "Replace old memory.", ["mem_old"]);
  await archivePlatformMemory("mem_3", "Archived.");

  assert.deepEqual(requests, [
    { url: "/api/memories/mem%201/apply", body: { change_reason: "Approved." } },
    { url: "/api/memories/mem_2/replace", body: { change_reason: "Replace old memory.", supersedes: ["mem_old"] } },
    { url: "/api/memories/mem_3/archive", body: { change_reason: "Archived." } },
  ]);
  globalThis.fetch = originalFetch;
});

test("platform memory API reads audit details and restores revisions", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await fetchPlatformMemoryRevisions("mem_1");
  await fetchPlatformMemoryEvents("mem_1");
  await restorePlatformMemoryRevision("mem_1", "rev 1", "previous", "Restore review.");

  assert.deepEqual(requests, [
    { url: "/api/memories/mem_1/revisions", body: null },
    { url: "/api/memories/mem_1/events", body: null },
    {
      url: "/api/memories/mem_1/revisions/rev%201/restore",
      body: { target: "previous", change_reason: "Restore review." },
    },
  ]);
  globalThis.fetch = originalFetch;
});

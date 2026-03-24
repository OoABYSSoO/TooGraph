import test from "node:test";
import assert from "node:assert/strict";

import { createCompanionMemory, fetchCompanionProfile, restoreCompanionRevision, updateCompanionProfile } from "./companion.ts";

const originalFetch = globalThis.fetch;

test("companion API reads and updates profile through backend routes", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ name: "小石墨" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await fetchCompanionProfile();
  await updateCompanionProfile({ name: "小石墨" }, "测试更新");

  assert.equal(requests[0].url, "/api/companion/profile");
  assert.equal(requests[1].url, "/api/companion/profile");
  assert.deepEqual(requests[1].body, { name: "小石墨", change_reason: "测试更新" });
  globalThis.fetch = originalFetch;
});

test("companion API creates memories and restores revisions", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await createCompanionMemory({ type: "preference", title: "偏好", content: "喜欢简短回答。" });
  await restoreCompanionRevision("rev_1");

  assert.equal(requests[0].url, "/api/companion/memories");
  assert.equal(requests[1].url, "/api/companion/revisions/rev_1/restore");
  globalThis.fetch = originalFetch;
});

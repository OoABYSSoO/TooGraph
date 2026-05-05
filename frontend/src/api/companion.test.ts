import test from "node:test";
import assert from "node:assert/strict";

import {
  createCompanionMemory,
  fetchCompanionProfile,
  restoreCompanionRevision,
  updateCompanionProfile,
} from "./companion.ts";

const originalFetch = globalThis.fetch;

test("companion API reads profile and sends profile writes through command flow", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    const responsePayload = init?.method === "POST" ? { result: { name: "Tutu" } } : { name: "Tutu" };
    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await fetchCompanionProfile();
  await updateCompanionProfile({ name: "Tutu" }, "Manual profile update.");

  assert.equal(requests[0].url, "/api/companion/profile");
  assert.equal(requests[1].url, "/api/companion/commands");
  assert.deepEqual(requests[1].body, {
    action: "profile.update",
    payload: { name: "Tutu" },
    change_reason: "Manual profile update.",
  });
  globalThis.fetch = originalFetch;
});

test("companion API creates memories and restores revisions through command flow", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ result: { ok: true } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await createCompanionMemory({ type: "preference", title: "Reply style", content: "Keep replies short." });
  await restoreCompanionRevision("rev_1");

  assert.equal(requests[0].url, "/api/companion/commands");
  assert.deepEqual(requests[0].body, {
    action: "memory.create",
    payload: { type: "preference", title: "Reply style", content: "Keep replies short." },
    change_reason: "User created companion memory from the Companion page.",
  });
  assert.equal(requests[1].url, "/api/companion/commands");
  assert.deepEqual(requests[1].body, {
    action: "revision.restore",
    target_id: "rev_1",
    payload: {},
    change_reason: "User restored a companion revision from the Companion page.",
  });
  globalThis.fetch = originalFetch;
});

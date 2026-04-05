import test from "node:test";
import assert from "node:assert/strict";

import {
  createBuddyMemory,
  createBuddyGraphPatchDraft,
  fetchBuddyProfile,
  restoreBuddyRevision,
  updateBuddyProfile,
} from "./buddy.ts";

const originalFetch = globalThis.fetch;

test("buddy API reads profile and sends profile writes through command flow", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    const responsePayload = init?.method === "POST" ? { result: { name: "Tutu" } } : { name: "Tutu" };
    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await fetchBuddyProfile();
  await updateBuddyProfile({ name: "Tutu" }, "Manual profile update.");

  assert.equal(requests[0].url, "/api/buddy/profile");
  assert.equal(requests[1].url, "/api/buddy/commands");
  assert.deepEqual(requests[1].body, {
    action: "profile.update",
    payload: { name: "Tutu" },
    change_reason: "Manual profile update.",
  });
  globalThis.fetch = originalFetch;
});

test("buddy API creates graph patch drafts through approval command flow", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ result: { draft_id: "cmd_1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await createBuddyGraphPatchDraft(
    {
      graph_id: "graph_buddy_loop",
      graph_name: "伙伴对话循环",
      summary: "增加记忆写入确认节点。",
      rationale: "让伙伴先提出图修改建议，再由用户审批。",
      patch: [{ op: "add", path: "/nodes/confirm_memory_write", value: { type: "approval" } }],
    },
    "Buddy suggested a graph patch.",
  );

  assert.equal(requests[0].url, "/api/buddy/commands");
  assert.deepEqual(requests[0].body, {
    action: "graph_patch.draft",
    payload: {
      graph_id: "graph_buddy_loop",
      graph_name: "伙伴对话循环",
      summary: "增加记忆写入确认节点。",
      rationale: "让伙伴先提出图修改建议，再由用户审批。",
      patch: [{ op: "add", path: "/nodes/confirm_memory_write", value: { type: "approval" } }],
    },
    change_reason: "Buddy suggested a graph patch.",
  });
  globalThis.fetch = originalFetch;
});

test("buddy API creates memories and restores revisions through command flow", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ result: { ok: true } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await createBuddyMemory({ type: "preference", title: "Reply style", content: "Keep replies short." });
  await restoreBuddyRevision("rev_1");

  assert.equal(requests[0].url, "/api/buddy/commands");
  assert.deepEqual(requests[0].body, {
    action: "memory.create",
    payload: { type: "preference", title: "Reply style", content: "Keep replies short." },
    change_reason: "User created buddy memory from the Buddy page.",
  });
  assert.equal(requests[1].url, "/api/buddy/commands");
  assert.deepEqual(requests[1].body, {
    action: "revision.restore",
    target_id: "rev_1",
    payload: {},
    change_reason: "User restored a buddy revision from the Buddy page.",
  });
  globalThis.fetch = originalFetch;
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  appendBuddyChatMessage,
  createBuddyChatSession,
  createBuddyMemory,
  createBuddyGraphPatchDraft,
  deleteBuddyChatSession,
  fetchBuddyRunTemplateBinding,
  fetchBuddyCommands,
  fetchBuddyChatMessages,
  fetchBuddyChatSessions,
  fetchBuddyProfile,
  restoreBuddyRevision,
  updateBuddyChatSession,
  updateBuddyProfile,
  updateBuddyRunTemplateBinding,
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

test("buddy API reads command audit records", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await fetchBuddyCommands();

  assert.deepEqual(requests, ["/api/buddy/commands"]);
  globalThis.fetch = originalFetch;
});

test("buddy API manages run template binding through command flow", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    const payload = init?.method === "POST"
      ? { result: { template_id: "custom_loop", input_bindings: { input_prompt: "current_message" } } }
      : { template_id: "custom_loop", input_bindings: { input_prompt: "current_message" } };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await fetchBuddyRunTemplateBinding();
  await updateBuddyRunTemplateBinding(
    { template_id: "custom_loop", input_bindings: { input_prompt: "current_message" } },
    "用户更新伙伴运行模板绑定。",
  );

  assert.equal(requests[0].url, "/api/buddy/run-template-binding");
  assert.equal(requests[1].url, "/api/buddy/commands");
  assert.deepEqual(requests[1].body, {
    action: "run_template_binding.update",
    payload: { template_id: "custom_loop", input_bindings: { input_prompt: "current_message" } },
    change_reason: "用户更新伙伴运行模板绑定。",
  });
  globalThis.fetch = originalFetch;
});

test("buddy API manages chat sessions and messages directly", async () => {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify({ session_id: "session_1", message_id: "msg_1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await fetchBuddyChatSessions();
  await createBuddyChatSession({ title: "需求讨论" });
  await updateBuddyChatSession("session_1", { title: "新标题" });
  await fetchBuddyChatMessages("session_1");
  await appendBuddyChatMessage("session_1", {
    role: "assistant",
    content: "我在。",
    include_in_context: false,
    run_id: "run_1",
    metadata: { kind: "output_trace", outputTrace: { segmentId: "segment_1" } },
  });
  await deleteBuddyChatSession("session_1");

  assert.equal(requests[0].url, "/api/buddy/sessions");
  assert.equal(requests[1].method, "POST");
  assert.equal(requests[1].url, "/api/buddy/sessions");
  assert.deepEqual(requests[1].body, { title: "需求讨论" });
  assert.equal(requests[2].method, "PATCH");
  assert.equal(requests[2].url, "/api/buddy/sessions/session_1");
  assert.deepEqual(requests[2].body, { title: "新标题" });
  assert.equal(requests[3].url, "/api/buddy/sessions/session_1/messages");
  assert.equal(requests[4].method, "POST");
  assert.deepEqual(requests[4].body, {
    role: "assistant",
    content: "我在。",
    include_in_context: false,
    run_id: "run_1",
    metadata: { kind: "output_trace", outputTrace: { segmentId: "segment_1" } },
  });
  assert.equal(requests[5].method, "DELETE");
  assert.equal(requests[5].url, "/api/buddy/sessions/session_1");
  globalThis.fetch = originalFetch;
});

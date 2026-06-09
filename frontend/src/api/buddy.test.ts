import test from "node:test";
import assert from "node:assert/strict";

import {
  appendBuddyChatMessage,
  createBuddyChatSession,
  deleteBuddyChatSession,
  fetchBuddyBackgroundReviews,
  fetchBuddyMemoryDocument,
  fetchBuddyRunTemplateBinding,
  fetchBuddyCommands,
  fetchBuddyHomeFiles,
  fetchBuddyChatMessages,
  fetchBuddyChatSessions,
  fetchBuddyIdentity,
  fetchBuddyUserContextDocument,
  restoreBuddyRevision,
  searchBuddyChatSessions,
  searchBuddyMemories,
  searchBuddyRunContext,
  updateBuddyChatSession,
  updateBuddyMemoryDocument,
  updateBuddyIdentity,
  updateBuddyRunTemplateBinding,
  updateBuddyUserContextDocument,
} from "./buddy.ts";

const originalFetch = globalThis.fetch;

test("buddy API reads identity and sends identity writes through command flow", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    const responsePayload = init?.method === "POST" ? { result: { name: "Tutu" } } : { name: "Tutu" };
    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await fetchBuddyIdentity();
  await updateBuddyIdentity({ name: "Tutu" }, "Manual buddy identity update.");

  assert.equal(requests[0].url, "/api/buddy/identity");
  assert.equal(requests[1].url, "/api/buddy/commands");
  assert.deepEqual(requests[1].body, {
    action: "buddy_identity.update",
    payload: { name: "Tutu" },
    change_reason: "Manual buddy identity update.",
  });
  globalThis.fetch = originalFetch;
});

test("buddy API updates USER.md through user context command flow", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ result: { path: "USER.md" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await fetchBuddyUserContextDocument();
  await updateBuddyUserContextDocument({ content: "# USER.md\n\n- Prefers direct Chinese." }, "Manual user context update.");

  assert.equal(requests[0].url, "/api/buddy/user-context");
  assert.equal(requests[1].url, "/api/buddy/commands");
  assert.deepEqual(requests[1].body, {
    action: "user_context.update",
    payload: { content: "# USER.md\n\n- Prefers direct Chinese." },
    change_reason: "Manual user context update.",
  });
  globalThis.fetch = originalFetch;
});

test("buddy API updates MEMORY.md and restores revisions through command flow", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ result: { ok: true } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await fetchBuddyMemoryDocument();
  await updateBuddyMemoryDocument({ content: "# MEMORY.md\n\n- Keep replies short." }, "Manual memory update.");
  await restoreBuddyRevision("rev_1");

  assert.equal(requests[0].url, "/api/buddy/memory-document");
  assert.equal(requests[1].url, "/api/buddy/commands");
  assert.deepEqual(requests[1].body, {
    action: "memory_document.update",
    payload: { content: "# MEMORY.md\n\n- Keep replies short." },
    change_reason: "Manual memory update.",
  });
  assert.equal(requests[2].url, "/api/buddy/commands");
  assert.deepEqual(requests[2].body, {
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

test("buddy API reads Buddy Home file inventory", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(JSON.stringify({ root: "buddy_home", files: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await fetchBuddyHomeFiles();

  assert.deepEqual(requests, ["/api/buddy/home-files"]);
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

test("buddy API lists background review runs", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await fetchBuddyBackgroundReviews("run_1");

  assert.equal(requests[0].url, "/api/buddy/background-reviews?source_run_id=run_1");
  assert.equal(requests[0].body, null);
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
    metadata: { source: "manual_note" },
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
    metadata: { source: "manual_note" },
  });
  assert.equal(requests[5].method, "DELETE");
  assert.equal(requests[5].url, "/api/buddy/sessions/session_1");
  globalThis.fetch = originalFetch;
});

test("buddy API searches session evidence and run context evidence", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(JSON.stringify({ kind: "search", sessions: [], matches: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await searchBuddyChatSessions({
    query: "alpha evidence",
    currentSessionId: "session_current",
    embeddingModelRef: "emodel_local_hashing",
    rerankerModelRef: "local-rerank/bge",
    limit: 7,
    window: 2,
    sort: "newest",
  });
  await searchBuddyRunContext({
    runId: "run_1",
    query: "context evidence",
    limit: 12,
  });

  assert.deepEqual(requests, [
    "/api/buddy/search/sessions?query=alpha+evidence&current_session_id=session_current&embedding_model_ref=emodel_local_hashing&reranker_model_ref=local-rerank%2Fbge&limit=7&window=2&sort=newest",
    "/api/buddy/search/run-context?run_id=run_1&query=context+evidence&limit=12",
  ]);
  globalThis.fetch = originalFetch;
});

test("buddy API searches memory evidence with embedding model filters", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(JSON.stringify({ kind: "memory_search", memories: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await searchBuddyMemories({
    query: "memory evidence",
    embeddingModelRef: "emodel_local_hashing",
    rerankerModelRef: "local-rerank/bge",
    scopeKind: "buddy",
    scopeId: "default",
    layer: "long_term",
    memoryType: "preference",
    status: "active",
    limit: 9,
  });

  assert.deepEqual(requests, [
    "/api/buddy/search/memories?query=memory+evidence&embedding_model_ref=emodel_local_hashing&reranker_model_ref=local-rerank%2Fbge&scope_kind=buddy&scope_id=default&layer=long_term&memory_type=preference&status=active&limit=9",
  ]);
  globalThis.fetch = originalFetch;
});

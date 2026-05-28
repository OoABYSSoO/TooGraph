import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import { formatBuddySessionSourceLabel, useBuddyChatSessions } from "./useBuddyChatSessions.ts";
import type { BuddyChatMessageRecord } from "../types/buddy.ts";

const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as unknown as { window?: unknown }).window;

test("formatBuddySessionSourceLabel names external message platform sessions", () => {
  assert.equal(formatBuddySessionSourceLabel("telegram"), "Telegram");
  assert.equal(formatBuddySessionSourceLabel("feishu"), "Feishu/Lark");
  assert.equal(formatBuddySessionSourceLabel("buddy"), "");
});

test("activateChatSession hydrates run display messages after loading assistant records with run_id", async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    },
    configurable: true,
  });
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(
      JSON.stringify([
        {
          message_id: "msg_assistant_1",
          session_id: "session_1",
          role: "assistant",
          content: "最终回复",
          client_order: 1,
          include_in_context: true,
          run_id: "run_1",
          metadata: {},
          created_at: "2026-05-26T00:00:00Z",
          updated_at: "2026-05-26T00:00:00Z",
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  const hydrated: BuddyChatMessageRecord[][] = [];
  const messages = ref<Array<{ id: string; role: "assistant"; content: string; runId: string | null }>>([]);
  const sessions = useBuddyChatSessions({
    messages,
    queuedTurns: ref([]),
    activeRunId: ref(null),
    errorMessage: ref(""),
    t: (key) => key,
    messageRecordToBuddyMessage: (record) => ({
      id: record.message_id,
      role: "assistant",
      content: record.content,
      runId: record.run_id,
    }),
    resetNextBuddyMessageClientOrder: () => {},
    resetVisibleBuddyRunState: () => {},
    scrollMessagesToBottom: async () => {},
    formatErrorMessage: (error) => String(error),
    hydrateLoadedRunDisplays: async (records) => {
      hydrated.push(records);
    },
  });

  try {
    await sessions.selectChatSession("session_1");
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  }

  assert.deepEqual(requests, ["/api/buddy/sessions/session_1/messages"]);
  assert.equal(messages.value[0].id, "msg_assistant_1");
  assert.equal(hydrated.length, 1);
  assert.equal(hydrated[0][0].run_id, "run_1");
});

test("refreshActiveChatSession imports externally appended platform messages into the active Buddy session", async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    },
    configurable: true,
  });
  const responses: BuddyChatMessageRecord[][] = [
    [
      {
        message_id: "msg_user_1",
        session_id: "session_1",
        role: "user",
        content: "你好",
        client_order: 1,
        include_in_context: true,
        run_id: null,
        metadata: {},
        created_at: "2026-05-26T00:00:00Z",
        updated_at: "2026-05-26T00:00:00Z",
      },
    ],
    [
      {
        message_id: "msg_user_1",
        session_id: "session_1",
        role: "user",
        content: "你好",
        client_order: 1,
        include_in_context: true,
        run_id: null,
        metadata: {},
        created_at: "2026-05-26T00:00:00Z",
        updated_at: "2026-05-26T00:00:00Z",
      },
      {
        message_id: "msg_user_2",
        session_id: "session_1",
        role: "user",
        content: "来自飞书的新消息",
        client_order: 2,
        include_in_context: true,
        run_id: null,
        metadata: { source_kind: "message_platform", platform_id: "feishu" },
        created_at: "2026-05-26T00:01:00Z",
        updated_at: "2026-05-26T00:01:00Z",
      },
      {
        message_id: "msg_assistant_2",
        session_id: "session_1",
        role: "assistant",
        content: "从 Buddy 回复。",
        client_order: 3,
        include_in_context: true,
        run_id: "run_2",
        metadata: { source_kind: "message_platform_reply", platform_id: "feishu" },
        created_at: "2026-05-26T00:02:00Z",
        updated_at: "2026-05-26T00:02:00Z",
      },
    ],
  ];
  globalThis.fetch = (async () => {
    const response = responses.shift() ?? responses[responses.length - 1] ?? [];
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const hydrated: BuddyChatMessageRecord[][] = [];
  const messages = ref<Array<{ id: string; role: "user" | "assistant"; content: string; runId: string | null }>>([]);
  const sessions = useBuddyChatSessions({
    messages,
    queuedTurns: ref([]),
    activeRunId: ref(null),
    errorMessage: ref(""),
    t: (key) => key,
    messageRecordToBuddyMessage: (record) => ({
      id: record.message_id,
      role: record.role,
      content: record.content,
      runId: record.run_id,
    }),
    resetNextBuddyMessageClientOrder: () => {},
    resetVisibleBuddyRunState: () => {},
    scrollMessagesToBottom: async () => {},
    formatErrorMessage: (error) => String(error),
    hydrateLoadedRunDisplays: async (records) => {
      hydrated.push(records);
    },
  });

  try {
    await sessions.selectChatSession("session_1");
    const refreshed = await sessions.refreshActiveChatSession();
    assert.equal(refreshed, true);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  }

  assert.deepEqual(messages.value.map((message) => message.id), ["msg_user_1", "msg_user_2", "msg_assistant_2"]);
  assert.equal(hydrated.length, 2);
  assert.equal(hydrated[1][2].run_id, "run_2");
});

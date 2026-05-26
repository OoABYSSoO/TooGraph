import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import { useBuddyChatSessions } from "./useBuddyChatSessions.ts";
import type { BuddyChatMessageRecord } from "../types/buddy.ts";

const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as unknown as { window?: unknown }).window;

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

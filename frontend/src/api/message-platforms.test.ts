import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchMessagePlatformSessions,
  pollFeishuAutoBinding,
  startFeishuAutoBinding,
  updateMessagePlatformBinding,
} from "./message-platforms.ts";

const originalFetch = globalThis.fetch;

test("startFeishuAutoBinding posts the display name and default websocket mode", async () => {
  let requestedUrl = "";
  let requestBody = "";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        job: {
          job_id: "mpfab_1",
          status: "waiting_for_scan",
          qr_url: "https://open.feishu.cn/page/launcher?user_code=ABCD",
          qr_expires_in: 600,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const response = await startFeishuAutoBinding({ display_name: "TooGraph Buddy", enabled: true });

    assert.equal(requestedUrl, "/api/message-platforms/feishu/auto-binding/start");
    assert.deepEqual(JSON.parse(requestBody), {
      display_name: "TooGraph Buddy",
      enabled: true,
      connection_mode: "websocket",
    });
    assert.equal(response.job.status, "waiting_for_scan");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pollFeishuAutoBinding fetches the current job status", async () => {
  let requestedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        job: {
          job_id: "mpfab_1",
          status: "completed",
          qr_url: "",
          qr_expires_in: 0,
          binding: { binding_id: "mpb_feishu" },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const response = await pollFeishuAutoBinding("mpfab_1");

    assert.equal(requestedUrl, "/api/message-platforms/feishu/auto-binding/mpfab_1");
    assert.equal(response.job.status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateMessagePlatformBinding can send Feishu App ID and App Secret", async () => {
  let requestBody = "";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        binding: {
          binding_id: "mpb_feishu",
          platform_id: "feishu",
          display_name: "TooGraph Buddy",
          enabled: true,
          configured: true,
          config: { app_id: "cli_x", connection_mode: "websocket" },
          secret_summary: { app_secret: "****cret" },
          created_at: "",
          updated_at: "",
        },
        status: {
          binding_id: "mpb_feishu",
          status: "not_connected",
          last_connected_at: "",
          last_disconnected_at: "",
          last_event_at: "",
          last_delivery_at: "",
          last_error_code: "",
          last_error_message: "",
          retry_count: 0,
          updated_at: "",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    await updateMessagePlatformBinding("mpb_feishu", {
      platform_id: "feishu",
      display_name: "TooGraph Buddy",
      enabled: true,
      config: { app_id: "cli_x", connection_mode: "websocket" },
      secrets: { app_secret: "secret" },
    });

    assert.deepEqual(JSON.parse(requestBody), {
      platform_id: "feishu",
      display_name: "TooGraph Buddy",
      enabled: true,
      config: { app_id: "cli_x", connection_mode: "websocket" },
      secrets: { app_secret: "secret" },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMessagePlatformSessions filters by platform and binding", async () => {
  let requestedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        sessions: [
          {
            platform_session_id: "mps_1",
            platform_id: "feishu",
            binding_id: "mpb_feishu",
            external_chat_id: "chat_1",
            external_thread_id: "",
            external_chat_type: "p2p",
            buddy_session_id: "buddy_1",
            display_name: "设计群",
            metadata: {},
            last_inbound_at: "",
            last_outbound_at: "",
            created_at: "",
            updated_at: "",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const response = await fetchMessagePlatformSessions({
      platformId: "feishu",
      bindingId: "mpb_feishu",
      limit: 20,
    });

    assert.equal(
      requestedUrl,
      "/api/message-platforms/sessions?platform_id=feishu&binding_id=mpb_feishu&limit=20",
    );
    assert.equal(response.sessions[0].buddy_session_id, "buddy_1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

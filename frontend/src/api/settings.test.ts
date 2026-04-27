import test from "node:test";
import assert from "node:assert/strict";

import {
  discoverModelProviderModels,
  fetchOpenAICodexAuthStatus,
  importOpenAICodexCliAuth,
  logoutOpenAICodexAuth,
  pollOpenAICodexAuth,
  pollOpenAICodexBrowserAuth,
  startOpenAICodexBrowserAuth,
  startOpenAICodexAuth,
  updateSettings,
} from "./settings.ts";

const originalFetch = globalThis.fetch;

test("updateSettings posts through the frontend api proxy", async () => {
  let requestedUrl = "";
  let requestedPayload: unknown = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedPayload = init?.body ? JSON.parse(String(init.body)) : null;
    return new Response(
      JSON.stringify({
        model: {
          text_model_ref: "text",
          video_model_ref: "video",
        },
        agent_runtime_defaults: {
          model: "model",
          thinking_enabled: true,
          thinking_level: "medium",
          temperature: 0.2,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  await updateSettings({
    model: {
      text_model_ref: "text",
      video_model_ref: "video",
    },
    agent_runtime_defaults: {
      model: "model",
      thinking_enabled: true,
      thinking_level: "medium",
      temperature: 0.2,
    },
    model_providers: {
      openai: {
        label: "OpenAI",
        transport: "openai-compatible",
        base_url: "https://api.openai.com/v1",
        api_key: "sk-openai",
        enabled: true,
        auth_header: "Authorization",
        auth_scheme: "Bearer",
        models: [
          {
            model: "gpt-4.1",
            label: "GPT 4.1",
            modalities: ["text"],
          },
        ],
      },
    },
  });

  assert.equal(requestedUrl, "/api/settings");
  assert.deepEqual(requestedPayload, {
    model: {
      text_model_ref: "text",
      video_model_ref: "video",
    },
    agent_runtime_defaults: {
      model: "model",
      thinking_enabled: true,
      thinking_level: "medium",
      temperature: 0.2,
    },
    model_providers: {
      openai: {
        label: "OpenAI",
        transport: "openai-compatible",
        base_url: "https://api.openai.com/v1",
        api_key: "sk-openai",
        enabled: true,
        auth_header: "Authorization",
        auth_scheme: "Bearer",
        models: [
          {
            model: "gpt-4.1",
            label: "GPT 4.1",
            modalities: ["text"],
          },
        ],
      },
    },
  });

  globalThis.fetch = originalFetch;
});

test("discoverModelProviderModels posts discovery payload", async () => {
  let requestedUrl = "";
  let requestedPayload: unknown = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedPayload = init?.body ? JSON.parse(String(init.body)) : null;
    return new Response(JSON.stringify({ models: ["gemma-4-26b-a4b-it"] }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  const result = await discoverModelProviderModels({
    provider_id: "anthropic",
    transport: "anthropic-messages",
    base_url: "https://api.anthropic.com/v1",
    api_key: "sk-ant",
    auth_header: "x-api-key",
    auth_scheme: "",
  });

  assert.equal(requestedUrl, "/api/settings/model-providers/discover");
  assert.deepEqual(requestedPayload, {
    provider_id: "anthropic",
    transport: "anthropic-messages",
    base_url: "https://api.anthropic.com/v1",
    api_key: "sk-ant",
    auth_header: "x-api-key",
    auth_scheme: "",
  });
  assert.deepEqual(result, { models: ["gemma-4-26b-a4b-it"] });

  globalThis.fetch = originalFetch;
});

test("OpenAI Codex auth helpers call login endpoints", async () => {
  const requested: Array<{ url: string; body: unknown }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requested.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (url.endsWith("/auth/browser/start")) {
      return new Response(JSON.stringify({ authorization_url: "https://auth.openai.com/oauth/authorize", state: "state-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/auth/browser/poll")) {
      return new Response(JSON.stringify({ authenticated: true, status: "authenticated", source: "browser-oauth" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/auth/codex-cli/import")) {
      return new Response(JSON.stringify({ authenticated: true, status: "authenticated", source: "codex-cli" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/auth/start")) {
      return new Response(JSON.stringify({ verification_url: "https://auth.openai.com/codex/device", user_code: "ABCD" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/auth/poll")) {
      return new Response(JSON.stringify({ authenticated: true, status: "authenticated" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/auth/status")) {
      return new Response(JSON.stringify({ configured: true, authenticated: true, auth_mode: "chatgpt" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ configured: false, authenticated: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await startOpenAICodexBrowserAuth();
  await pollOpenAICodexBrowserAuth({ state: "state-1" });
  await importOpenAICodexCliAuth();
  await startOpenAICodexAuth();
  await pollOpenAICodexAuth({ device_auth_id: "device-1", user_code: "ABCD" });
  await fetchOpenAICodexAuthStatus();
  await logoutOpenAICodexAuth();

  assert.deepEqual(requested, [
    { url: "/api/settings/model-providers/openai-codex/auth/browser/start", body: null },
    { url: "/api/settings/model-providers/openai-codex/auth/browser/poll", body: { state: "state-1" } },
    { url: "/api/settings/model-providers/openai-codex/auth/codex-cli/import", body: null },
    { url: "/api/settings/model-providers/openai-codex/auth/start", body: null },
    { url: "/api/settings/model-providers/openai-codex/auth/poll", body: { device_auth_id: "device-1", user_code: "ABCD" } },
    { url: "/api/settings/model-providers/openai-codex/auth/status", body: null },
    { url: "/api/settings/model-providers/openai-codex/auth/logout", body: null },
  ]);

  globalThis.fetch = originalFetch;
});

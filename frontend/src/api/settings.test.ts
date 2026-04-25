import test from "node:test";
import assert from "node:assert/strict";

import { discoverModelProviderModels, updateSettings } from "./settings.ts";

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

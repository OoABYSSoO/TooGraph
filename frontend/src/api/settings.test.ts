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
      local: {
        label: "Local Gateway",
        base_url: "http://127.0.0.1:8888/v1",
        api_key: "sk-local",
        models: [
          {
            model: "gemma-4-26b-a4b-it",
            label: "Gemma 4 26B",
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
      local: {
        label: "Local Gateway",
        base_url: "http://127.0.0.1:8888/v1",
        api_key: "sk-local",
        models: [
          {
            model: "gemma-4-26b-a4b-it",
            label: "Gemma 4 26B",
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
    base_url: "http://127.0.0.1:8888/v1",
    api_key: "sk-local",
  });

  assert.equal(requestedUrl, "/api/settings/model-providers/discover");
  assert.deepEqual(requestedPayload, {
    base_url: "http://127.0.0.1:8888/v1",
    api_key: "sk-local",
  });
  assert.deepEqual(result, { models: ["gemma-4-26b-a4b-it"] });

  globalThis.fetch = originalFetch;
});

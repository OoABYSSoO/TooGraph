import test from "node:test";
import assert from "node:assert/strict";

import { updateSettings } from "./settings.ts";

const originalFetch = globalThis.fetch;

test("updateSettings posts through the frontend api proxy", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
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
  });

  assert.equal(requestedUrl, "/api/settings");

  globalThis.fetch = originalFetch;
});

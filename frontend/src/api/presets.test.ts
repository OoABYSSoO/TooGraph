import test from "node:test";
import assert from "node:assert/strict";

import { deletePreset, fetchPreset, fetchPresets, savePreset, updatePresetStatus } from "./presets.ts";

const originalFetch = globalThis.fetch;

test("fetchPresets can request the management catalog including disabled presets", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    const presets = await fetchPresets({ includeDisabled: true });

    assert.equal(requestedUrl, "/api/presets?include_disabled=true");
    assert.deepEqual(presets, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchPresets defaults to active presets for creation surfaces", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    await fetchPresets();

    assert.equal(requestedUrl, "/api/presets");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preset management helpers call the expected endpoints and verbs", async () => {
  const requests: Array<{ url: string; method: string | undefined; body: string | null }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(JSON.stringify({ presetId: "input_question", status: "active" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    await fetchPreset("input_question");
    await updatePresetStatus("input_question", "disabled");
    await updatePresetStatus("input_question", "active");
    await deletePreset("input_question");

    assert.deepEqual(requests, [
      { url: "/api/presets/input_question", method: undefined, body: null },
      { url: "/api/presets/input_question/disable", method: "POST", body: "null" },
      { url: "/api/presets/input_question/enable", method: "POST", body: "null" },
      { url: "/api/presets/input_question", method: "DELETE", body: null },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("savePreset keeps using the create endpoint", async () => {
  let requestedUrl = "";
  let requestMethod: string | undefined;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestMethod = init?.method;
    return new Response(JSON.stringify({ presetId: "input_question", saved: true, updatedAt: null }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    await savePreset({
      presetId: "input_question",
      sourcePresetId: null,
      definition: {
        label: "Question",
        description: "",
        state_schema: {},
        node: {
          kind: "input",
          name: "Question",
          description: "",
          ui: { position: { x: 0, y: 0 } },
          reads: [],
          writes: [],
          config: { value: "" },
        },
      },
    });

    assert.equal(requestedUrl, "/api/presets");
    assert.equal(requestMethod, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

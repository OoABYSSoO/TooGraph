import assert from "node:assert/strict";
import test from "node:test";

import { clampSettingsTemperature, listProviderModelBadges } from "./settingsPageModel.ts";

test("clampSettingsTemperature keeps values inside the legacy 0-2 range", () => {
  assert.equal(clampSettingsTemperature(0.7), 0.7);
  assert.equal(clampSettingsTemperature(-1), 0);
  assert.equal(clampSettingsTemperature(5), 2);
  assert.equal(clampSettingsTemperature(Number.NaN), 0.2);
});

test("listProviderModelBadges falls back to example model refs when provider has no concrete models", () => {
  assert.deepEqual(
    listProviderModelBadges(
      {
        provider_id: "openai",
        label: "OpenAI",
        description: "",
        transport: "http",
        configured: false,
        base_url: "https://api.openai.com",
        models: [],
        example_model_refs: ["openai/gpt-5.4", "openai/gpt-5.4-mini"],
      },
      {},
    ),
    ["openai/gpt-5.4", "openai/gpt-5.4-mini"],
  );
});

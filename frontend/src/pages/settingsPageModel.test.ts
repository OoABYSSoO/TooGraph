import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProviderDraftsFromSettings,
  buildProviderSavePayload,
  clampSettingsTemperature,
  listAddableProviderTemplates,
  listProviderModelBadges,
} from "./settingsPageModel.ts";

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
        transport: "openai-compatible",
        configured: false,
        enabled: false,
        base_url: "https://api.openai.com",
        models: [],
        example_model_refs: ["openai/gpt-5.4", "openai/gpt-5.4-mini"],
      },
      {},
    ),
    ["openai/gpt-5.4", "openai/gpt-5.4-mini"],
  );
});

test("buildProviderDraftsFromSettings keeps stored API keys hidden", () => {
  const drafts = buildProviderDraftsFromSettings({
    model: {
      text_model: "gpt-4.1",
      text_model_ref: "openai/gpt-4.1",
      video_model: "gpt-4.1",
      video_model_ref: "openai/gpt-4.1",
    },
    agent_runtime_defaults: {
      model: "openai/gpt-4.1",
      thinking_enabled: false,
      temperature: 0.2,
    },
    model_catalog: {
      provider_templates: [],
      providers: [
        {
          provider_id: "openai",
          label: "OpenAI",
          description: "OpenAI",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          base_url: "https://api.openai.com/v1",
          auth_header: "Authorization",
          auth_scheme: "Bearer",
          api_key_configured: true,
          models: [{ model_ref: "openai/gpt-4.1", model: "gpt-4.1", label: "GPT 4.1" }],
          example_model_refs: [],
        },
      ],
    },
    revision: { max_revision_round: 1 },
    evaluator: { default_score_threshold: 7.8, routes: ["pass", "revise", "fail"] },
    tools: [],
  });

  assert.equal(drafts.openai.api_key, "");
  assert.equal(drafts.openai.api_key_configured, true);
});

test("buildProviderSavePayload includes enabled providers and omits blank api keys", () => {
  const payload = buildProviderSavePayload({
    openai: {
      provider_id: "openai",
      label: "OpenAI",
      transport: "openai-compatible",
      base_url: "https://api.openai.com/v1",
      enabled: true,
      auth_header: "Authorization",
      auth_scheme: "Bearer",
      api_key: "",
      api_key_configured: true,
      discovered_models: ["gpt-4.1"],
      selected_models: ["gpt-4.1"],
    },
  });

  assert.equal(payload.openai.api_key, undefined);
  assert.equal(payload.openai.enabled, true);
  assert.equal(payload.openai.transport, "openai-compatible");
});

test("listAddableProviderTemplates hides existing drafts", () => {
  const addable = listAddableProviderTemplates(
    {
      model: {
        text_model: "gpt-4.1",
        text_model_ref: "openai/gpt-4.1",
        video_model: "gpt-4.1",
        video_model_ref: "openai/gpt-4.1",
      },
      model_catalog: {
        providers: [],
        provider_templates: [
          {
            provider_id: "openai",
            label: "OpenAI",
            description: "OpenAI",
            transport: "openai-compatible",
            configured: false,
            enabled: false,
            base_url: "https://api.openai.com/v1",
            models: [],
            example_model_refs: [],
          },
          {
            provider_id: "anthropic",
            label: "Anthropic",
            description: "Anthropic",
            transport: "anthropic-messages",
            configured: false,
            enabled: false,
            base_url: "https://api.anthropic.com/v1",
            models: [],
            example_model_refs: [],
          },
        ],
      },
      revision: { max_revision_round: 1 },
      evaluator: { default_score_threshold: 7.8, routes: [] },
      tools: [],
    },
    {
      openai: {
        provider_id: "openai",
        label: "OpenAI",
        transport: "openai-compatible",
        base_url: "https://api.openai.com/v1",
        enabled: true,
        auth_header: "Authorization",
        auth_scheme: "Bearer",
        api_key: "",
        api_key_configured: false,
        discovered_models: [],
        selected_models: [],
      },
    },
  );

  assert.deepEqual(addable.map((provider) => provider.provider_id), ["anthropic"]);
});

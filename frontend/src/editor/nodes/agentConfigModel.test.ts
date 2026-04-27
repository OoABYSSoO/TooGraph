import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_AGENT_TEMPERATURE,
  buildAgentModelDisplayLookup,
  buildAgentModelSelectOptions,
  normalizeAgentTemperature,
  resolveAgentRuntimeCatalog,
  resolveAgentModelSelection,
} from "./agentConfigModel.ts";

test("normalizeAgentTemperature clamps finite values into the legacy 0-2 range", () => {
  assert.equal(normalizeAgentTemperature(0.7), 0.7);
  assert.equal(normalizeAgentTemperature(-1), 0);
  assert.equal(normalizeAgentTemperature(3), 2);
});

test("normalizeAgentTemperature falls back to legacy default for invalid values", () => {
  assert.equal(DEFAULT_AGENT_TEMPERATURE, 0.2);
  assert.equal(normalizeAgentTemperature(undefined), 0.2);
  assert.equal(normalizeAgentTemperature(Number.NaN), 0.2);
});

test("buildAgentModelDisplayLookup disambiguates duplicate concrete model labels", () => {
  const lookup = buildAgentModelDisplayLookup([
    {
      model_ref: "openai/gpt-5.4",
      model: "gpt-5.4",
      label: "GPT-5.4",
      route_target: "GPT-5.4",
    },
    {
      model_ref: "azure/gpt-5.4",
      model: "gpt-5.4",
      label: "GPT-5.4",
      route_target: "GPT-5.4",
    },
  ]);

  assert.deepEqual(lookup, {
    "openai/gpt-5.4": "GPT-5.4 · gpt-5.4",
    "azure/gpt-5.4": "GPT-5.4 · gpt-5.4",
  });
});

test("buildAgentModelSelectOptions only exposes currently available catalog models", () => {
  const options = buildAgentModelSelectOptions("custom/provider-model", ["openai/gpt-5.4"], {
    "openai/gpt-5.4": "GPT-5.4",
  });

  assert.deepEqual(options, [
    { value: "openai/gpt-5.4", label: "GPT-5.4" },
  ]);
});

test("resolveAgentModelSelection maps the global model to global source and others to override", () => {
  assert.deepEqual(resolveAgentModelSelection("openai/gpt-5.4", "openai/gpt-5.4"), {
    modelSource: "global",
    model: "",
  });
  assert.deepEqual(resolveAgentModelSelection("azure/gpt-5.4", "openai/gpt-5.4"), {
    modelSource: "override",
    model: "azure/gpt-5.4",
  });
});

test("resolveAgentRuntimeCatalog uses configured providers and the agent runtime default model", () => {
  const catalog = resolveAgentRuntimeCatalog({
    model: {
      text_model: "gpt-5.4",
      text_model_ref: "fallback/gpt-5.4",
      video_model: "veo",
      video_model_ref: "google/veo",
    },
    agent_runtime_defaults: {
      model: "openai/gpt-5.4",
      thinking_enabled: true,
      temperature: 0.2,
    },
    model_catalog: {
      providers: [
        {
          provider_id: "openai",
          label: "OpenAI",
          description: "",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          base_url: "https://api.openai.com",
          example_model_refs: [],
          models: [
            {
              model_ref: "openai/gpt-5.4",
              model: "gpt-5.4",
              label: "GPT-5.4",
              route_target: "GPT-5.4",
            },
          ],
        },
        {
          provider_id: "planned",
          label: "Planned",
          description: "",
          transport: "openai-compatible",
          configured: false,
          enabled: true,
          base_url: "",
          example_model_refs: [],
          models: [
            {
              model_ref: "planned/model",
              model: "model",
              label: "Planned model",
            },
          ],
        },
      ],
    },
    revision: {
      max_revision_round: 2,
    },
    evaluator: {
      default_score_threshold: 0.7,
      routes: [],
    },
    tools: [],
  });

  assert.equal(catalog.globalTextModelRef, "openai/gpt-5.4");
  assert.deepEqual(catalog.availableModelRefs, ["openai/gpt-5.4"]);
  assert.deepEqual(catalog.modelDisplayLookup, {
    "openai/gpt-5.4": "GPT-5.4",
  });
});

test("resolveAgentRuntimeCatalog only exposes enabled configured providers", () => {
  const catalog = resolveAgentRuntimeCatalog({
    model: {
      text_model: "gpt-5.4",
      text_model_ref: "openai/gpt-5.4",
      video_model: "veo",
      video_model_ref: "google/veo",
    },
    agent_runtime_defaults: {
      model: "openai/gpt-5.4",
      thinking_enabled: true,
      temperature: 0.2,
    },
    model_catalog: {
      providers: [
        {
          provider_id: "openai-codex",
          label: "ChatGPT",
          description: "",
          transport: "codex-responses",
          configured: true,
          enabled: false,
          base_url: "https://chatgpt.com/backend-api/codex",
          example_model_refs: [],
          models: [
            {
              model_ref: "openai-codex/gpt-5.5",
              model: "gpt-5.5",
              label: "GPT-5.5",
            },
          ],
        },
        {
          provider_id: "local",
          label: "Local",
          description: "",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          base_url: "http://127.0.0.1:8888/v1",
          example_model_refs: [],
          models: [
            {
              model_ref: "local/lm-local",
              model: "lm-local",
              label: "lm-local",
            },
          ],
        },
      ],
    },
    revision: {
      max_revision_round: 2,
    },
    evaluator: {
      default_score_threshold: 0.7,
      routes: [],
    },
    tools: [],
  });

  assert.deepEqual(catalog.availableModelRefs, ["local/lm-local"]);
  assert.deepEqual(catalog.modelDisplayLookup, {
    "local/lm-local": "lm-local",
  });
});

test("resolveAgentRuntimeCatalog falls back to the editor default model when agent runtime defaults are missing", () => {
  const catalog = resolveAgentRuntimeCatalog({
    model: {
      text_model: "gpt-5.4",
      text_model_ref: "openai/gpt-5.4",
      video_model: "veo",
      video_model_ref: "google/veo",
    },
    model_catalog: {
      providers: [
        {
          provider_id: "openai",
          label: "OpenAI",
          description: "",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          base_url: "https://api.openai.com",
          example_model_refs: [],
          models: [],
        },
      ],
    },
    revision: {
      max_revision_round: 2,
    },
    evaluator: {
      default_score_threshold: 0.7,
      routes: [],
    },
    tools: [],
  });

  assert.equal(catalog.globalTextModelRef, "openai/gpt-5.4");
  assert.deepEqual(catalog.availableModelRefs, []);
  assert.deepEqual(catalog.modelDisplayLookup, {});
});

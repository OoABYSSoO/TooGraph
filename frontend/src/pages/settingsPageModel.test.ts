import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProviderDraftsFromSettings,
  buildProviderSavePayload,
  clampSettingsTemperature,
  inferModelCapabilities,
  listAddableProviderTemplates,
  listProviderModelBadges,
  modelHasCapability,
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
    tools: [],
  });

  assert.equal(drafts.openai.api_key, "");
  assert.equal(drafts.openai.api_key_configured, true);
});

test("provider drafts default structured output mode and preserve model reasoning metadata", () => {
  const drafts = buildProviderDraftsFromSettings({
    model: {
      text_model: "qwen3-reasoning",
      text_model_ref: "local/qwen3-reasoning",
      video_model: "qwen3-reasoning",
      video_model_ref: "local/qwen3-reasoning",
    },
    model_catalog: {
      provider_templates: [],
      providers: [
        {
          provider_id: "local",
          label: "LM Studio",
          description: "Local gateway",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          saved: true,
          base_url: "http://127.0.0.1:1234/v1",
          models: [
            {
              model_ref: "local/qwen3-reasoning",
              model: "qwen3-reasoning",
              label: "qwen3-reasoning",
              reasoning: true,
            },
          ],
          example_model_refs: [],
        },
      ],
    },
    revision: { max_revision_round: 1 },
    tools: [],
  });

  assert.equal(drafts.local.structured_output_mode, "validate_then_repair");
  assert.equal(drafts.local.model_settings["qwen3-reasoning"]?.reasoning, true);
});

test("buildProviderSavePayload includes enabled providers and omits blank api keys", () => {
  const payload = buildProviderSavePayload({
    openai: {
      provider_id: "openai",
      label: "OpenAI",
      transport: "openai-compatible",
      structured_output_mode: "validate_then_repair",
      base_url: "https://api.openai.com/v1",
      enabled: true,
      auth_header: "Authorization",
      auth_scheme: "Bearer",
      request_timeout_seconds: 45,
      api_key: "",
      api_key_configured: true,
      discovered_models: ["gpt-4.1"],
      selected_models: ["gpt-4.1"],
    },
  });

  assert.equal(payload.openai.api_key, undefined);
  assert.equal(payload.openai.enabled, true);
  assert.equal(payload.openai.transport, "openai-compatible");
  assert.equal(payload.openai.request_timeout_seconds, 45);
});

test("provider save payload includes structured output mode and model reasoning metadata", () => {
  const payload = buildProviderSavePayload({
    local: {
      provider_id: "local",
      label: "LM Studio",
      transport: "openai-compatible",
      structured_output_mode: "native_schema_first",
      base_url: "http://127.0.0.1:1234/v1",
      enabled: true,
      auth_header: "Authorization",
      auth_scheme: "Bearer",
      request_timeout_seconds: 180,
      credential_pool: [],
      api_key: "",
      api_key_configured: false,
      discovered_models: ["qwen3-reasoning"],
      selected_models: ["qwen3-reasoning"],
      model_settings: {
        "qwen3-reasoning": {
          model: "qwen3-reasoning",
          reasoning: true,
          context_window_ktokens: 128,
          compression_threshold: 0.9,
          capabilities: {
            chat: true,
            embedding: false,
            rerank: false,
            vision: false,
            tool_call: false,
            structured_output: true,
          },
          embedding: {
            dimensions: null,
            use_for_memory: true,
            use_for_knowledge: true,
          },
        },
      },
    },
  });

  assert.equal(payload.local.structured_output_mode, "native_schema_first");
  assert.equal(payload.local.models[0]?.reasoning, true);
});

test("inferModelCapabilities marks Qwen embedding names as embedding-only", () => {
  assert.deepEqual(inferModelCapabilities("text-embedding-qwen3-embedding-8b"), {
    chat: false,
    embedding: true,
    rerank: false,
    vision: false,
    tool_call: false,
    structured_output: false,
  });
});

test("inferModelCapabilities marks reranker names as rerank-only", () => {
  assert.deepEqual(inferModelCapabilities("BAAI/bge-reranker-v2-m3"), {
    chat: false,
    embedding: false,
    rerank: true,
    vision: false,
    tool_call: false,
    structured_output: false,
  });
});

test("model capability reads do not mutate provider drafts", () => {
  const provider = {
    provider_id: "local",
    label: "Local",
    transport: "openai-compatible",
    base_url: "http://127.0.0.1:8888/v1",
    enabled: true,
    auth_header: "Authorization",
    auth_scheme: "Bearer",
    request_timeout_seconds: 180,
    api_key: "",
    api_key_configured: false,
    discovered_models: ["text-embedding-qwen3-embedding-8b"],
    selected_models: ["text-embedding-qwen3-embedding-8b"],
    model_settings: {},
  };

  const before = JSON.stringify(provider.model_settings);
  assert.equal(modelHasCapability(provider, "text-embedding-qwen3-embedding-8b", "embedding"), true);
  assert.equal(JSON.stringify(provider.model_settings), before);
});

test("provider drafts preserve explicit capabilities and infer missing model capabilities", () => {
  const drafts = buildProviderDraftsFromSettings({
    model: {
      text_model: "qwen-chat",
      text_model_ref: "local/qwen-chat",
      video_model: "qwen-chat",
      video_model_ref: "local/qwen-chat",
    },
    model_catalog: {
      provider_templates: [],
      providers: [
        {
          provider_id: "local",
          label: "LM Studio",
          description: "Local gateway",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          saved: true,
          base_url: "http://127.0.0.1:1234/v1",
          models: [
            {
              model_ref: "local/text-embedding-qwen3-embedding-8b",
              model: "text-embedding-qwen3-embedding-8b",
              label: "text-embedding-qwen3-embedding-8b",
            },
            {
              model_ref: "local/qwen-chat",
              model: "qwen-chat",
              label: "qwen-chat",
              capabilities: { chat: true, structured_output: true, tool_call: true },
            },
          ],
          example_model_refs: [],
        },
      ],
    },
    revision: { max_revision_round: 1 },
    tools: [],
  });

  assert.equal(modelHasCapability(drafts.local, "text-embedding-qwen3-embedding-8b", "embedding"), true);
  assert.equal(modelHasCapability(drafts.local, "text-embedding-qwen3-embedding-8b", "chat"), false);
  assert.equal(modelHasCapability(drafts.local, "qwen-chat", "chat"), true);
  assert.equal(modelHasCapability(drafts.local, "qwen-chat", "structured_output"), true);

  const payload = buildProviderSavePayload(drafts);
  assert.deepEqual(payload.local.models.map((model) => ({ model: model.model, capabilities: model.capabilities })), [
    {
      model: "text-embedding-qwen3-embedding-8b",
      capabilities: {
        chat: false,
        embedding: true,
        rerank: false,
        vision: false,
        tool_call: false,
        structured_output: false,
      },
    },
    {
      model: "qwen-chat",
      capabilities: {
        chat: true,
        embedding: false,
        rerank: false,
        vision: false,
        tool_call: true,
        structured_output: true,
      },
    },
  ]);
});

test("provider model save payload preserves model capabilities", () => {
  const drafts = buildProviderDraftsFromSettings({
    model: {
      text_model: "rerank-test",
      text_model_ref: "local/rerank-test",
      video_model: "rerank-test",
      video_model_ref: "local/rerank-test",
    },
    model_catalog: {
      provider_templates: [],
      providers: [
        {
          provider_id: "local",
          label: "Local",
          description: "Local gateway",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          saved: true,
          base_url: "http://127.0.0.1:8888/v1",
          request_timeout_seconds: 33,
          models: [
            {
              model_ref: "local/rerank-test",
              model: "rerank-test",
              label: "rerank-test",
              capabilities: { chat: false, structured_output: false, rerank: true, prompt_cache: true },
              permissions: ["rerank"],
              context_window: 128000,
              compression_threshold: 0.82,
            },
          ],
          example_model_refs: [],
        },
      ],
    },
    revision: { max_revision_round: 1 },
    tools: [],
  });

  assert.deepEqual(drafts.local.selected_models, ["rerank-test"]);
  assert.equal(drafts.local.request_timeout_seconds, 33);
  assert.equal(drafts.local.model_settings["rerank-test"]?.context_window_ktokens, 128);
  assert.equal(drafts.local.model_settings["rerank-test"]?.compression_threshold, 0.82);

  const payload = buildProviderSavePayload(drafts);
  assert.deepEqual(payload.local.models[0], {
    model: "rerank-test",
    label: "rerank-test",
    reasoning: null,
    modalities: ["text"],
    capabilities: {
      chat: false,
      embedding: false,
      rerank: true,
      vision: false,
      tool_call: false,
      structured_output: false,
    },
    context_window: null,
    compression_threshold: null,
    embedding: undefined,
  });
  assert.equal(payload.local.request_timeout_seconds, 33);
});

test("provider drafts default model compression threshold and save context window in k tokens", () => {
  const drafts = buildProviderDraftsFromSettings({
    model: {
      text_model: "gpt-large",
      text_model_ref: "openai/gpt-large",
      video_model: "gpt-large",
      video_model_ref: "openai/gpt-large",
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
          models: [
            {
              model_ref: "openai/gpt-large",
              model: "gpt-large",
              label: "GPT Large",
              context_window: 200000,
            },
          ],
          example_model_refs: [],
        },
      ],
    },
    revision: { max_revision_round: 1 },
    tools: [],
  });

  assert.equal(drafts.openai.model_settings["gpt-large"]?.context_window_ktokens, 200);
  assert.equal(drafts.openai.model_settings["gpt-large"]?.compression_threshold, 0.9);

  drafts.openai.model_settings["gpt-large"] = {
    model: "gpt-large",
    context_window_ktokens: 196,
    compression_threshold: 0.88,
    capabilities: {
      chat: true,
      embedding: false,
      rerank: false,
      vision: false,
      tool_call: false,
      structured_output: false,
    },
    embedding: {
      dimensions: null,
      use_for_memory: true,
      use_for_knowledge: true,
    },
  };
  const payload = buildProviderSavePayload(drafts);

  assert.equal(payload.openai.models[0]?.context_window, 196000);
  assert.equal(payload.openai.models[0]?.compression_threshold, 0.88);
});

test("provider drafts preserve credential pool metadata", () => {
  const drafts = buildProviderDraftsFromSettings({
    model: {
      text_model: "gpt-4.1",
      text_model_ref: "openai/gpt-4.1",
      video_model: "gpt-4.1",
      video_model_ref: "openai/gpt-4.1",
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
          credential_pool: [
            {
              credential_id: "primary",
              status: "active",
              cooldown_until: null,
              failure_count: 0,
            },
            {
              credential_id: "backup",
              status: "cooling_down",
              cooldown_until: "2026-06-01T12:00:00Z",
              failure_count: 2,
            },
          ],
          models: [{ model_ref: "openai/gpt-4.1", model: "gpt-4.1", label: "GPT 4.1" }],
          example_model_refs: [],
        },
      ],
    },
    revision: { max_revision_round: 1 },
    tools: [],
  });

  assert.deepEqual(drafts.openai.credential_pool, [
    {
      credential_id: "primary",
      status: "active",
      cooldown_until: null,
      failure_count: 0,
    },
    {
      credential_id: "backup",
      status: "cooling_down",
      cooldown_until: "2026-06-01T12:00:00Z",
      failure_count: 2,
    },
  ]);

  const payload = buildProviderSavePayload(drafts);
  assert.deepEqual(payload.openai.credential_pool, drafts.openai.credential_pool);
});

test("buildProviderDraftsFromSettings keeps saved Codex login providers visible before auth completes", () => {
  const drafts = buildProviderDraftsFromSettings({
    model: {
      text_model: "gpt-5.5",
      text_model_ref: "local/gpt-5.5",
      video_model: "gpt-5.5",
      video_model_ref: "local/gpt-5.5",
    },
    model_catalog: {
      provider_templates: [],
      providers: [
        {
          provider_id: "openai-codex",
          label: "OpenAI Codex / ChatGPT Login",
          description: "ChatGPT sign-in",
          transport: "codex-responses",
          configured: false,
          enabled: true,
          saved: true,
          requires_login: true,
          auth_mode: "chatgpt",
          base_url: "https://chatgpt.com/backend-api/codex",
          api_key_configured: false,
          auth_status: { configured: false, authenticated: false, auth_mode: "chatgpt" },
          models: [],
          example_model_refs: ["openai-codex/gpt-5.5"],
        },
      ],
    },
    revision: { max_revision_round: 1 },
    tools: [],
  });

  assert.equal(drafts["openai-codex"].requires_login, true);
  assert.equal(drafts["openai-codex"].auth_mode, "chatgpt");
  assert.equal(drafts["openai-codex"].auth_status?.authenticated, false);
});

test("buildProviderSavePayload omits api key fields for Codex login providers", () => {
  const payload = buildProviderSavePayload({
    "openai-codex": {
      provider_id: "openai-codex",
      label: "OpenAI Codex / ChatGPT Login",
      transport: "codex-responses",
      base_url: "https://chatgpt.com/backend-api/codex",
      enabled: true,
      auth_mode: "chatgpt",
      requires_login: true,
      auth_header: "Authorization",
      auth_scheme: "Bearer",
      api_key: "should-not-be-sent",
      api_key_configured: false,
      auth_status: { configured: false, authenticated: false, auth_mode: "chatgpt" },
      discovered_models: ["gpt-5.5"],
      selected_models: ["gpt-5.5"],
    },
  });

  assert.equal(payload["openai-codex"].api_key, undefined);
  assert.equal(payload["openai-codex"].auth_mode, "chatgpt");
  assert.equal(payload["openai-codex"].transport, "codex-responses");
});

test("buildProviderDraftsFromSettings keeps discovered model options separate from enabled models", () => {
  const drafts = buildProviderDraftsFromSettings({
    model: {
      text_model: "gpt-5.5",
      text_model_ref: "openai-codex/gpt-5.5",
      video_model: "gpt-5.5",
      video_model_ref: "openai-codex/gpt-5.5",
    },
    model_catalog: {
      provider_templates: [],
      providers: [
        {
          provider_id: "local",
          label: "OpenAI-compatible Custom Provider",
          description: "Local gateway",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          saved: true,
          base_url: "http://127.0.0.1:8888/v1",
          api_key_configured: true,
          models: [],
          discovered_models: [
            {
              model_ref: "local/lm-local",
              model: "lm-local",
              label: "lm-local",
              modalities: ["text"],
            },
          ],
          example_model_refs: [],
        },
      ],
    },
    revision: { max_revision_round: 1 },
    tools: [],
  });

  assert.deepEqual(drafts.local.selected_models, []);
  assert.deepEqual(drafts.local.discovered_models, ["lm-local"]);
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

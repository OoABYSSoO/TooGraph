import test from "node:test";
import assert from "node:assert/strict";

import { buildRuntimeModelOptions, resolveRuntimeModelCatalog } from "./runtimeModelCatalog.ts";
import type { SettingsPayload } from "../types/settings.ts";

test("buildRuntimeModelOptions uses the same configured catalog rules as agent nodes", () => {
  const settings: SettingsPayload = {
    model: {
      text_model: "gpt-5.5",
      text_model_ref: "openai-codex/gpt-5.5",
      video_model: "veo",
      video_model_ref: "google/veo",
    },
    agent_runtime_defaults: {
      model: "openai-codex/gpt-5.5",
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
          enabled: true,
          base_url: "https://chatgpt.com/backend-api/codex",
          requires_login: true,
          auth_status: {
            provider_id: "openai-codex",
            configured: true,
            authenticated: false,
            auth_mode: "chatgpt",
            source: "",
            base_url: "https://chatgpt.com/backend-api/codex",
            last_refresh: "",
          },
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
          label: "OpenAI-compatible Custom Provider",
          description: "",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          base_url: "http://127.0.0.1:8888/v1",
          requires_login: false,
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
  };

  const catalog = resolveRuntimeModelCatalog(settings);

  assert.equal(catalog.globalTextModelRef, "openai-codex/gpt-5.5");
  assert.deepEqual(catalog.availableModelRefs, ["local/lm-local"]);
  assert.deepEqual(buildRuntimeModelOptions(settings), [{ value: "local/lm-local", label: "lm-local" }]);
});

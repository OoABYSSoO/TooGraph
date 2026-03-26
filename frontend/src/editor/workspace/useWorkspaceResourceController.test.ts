import assert from "node:assert/strict";
import test from "node:test";

import type { PresetDocument } from "@/types/node-system";
import type { KnowledgeBaseRecord } from "@/types/knowledge";
import type { SettingsPayload } from "@/types/settings";
import type { SkillDefinition } from "@/types/skills";

import { useWorkspaceResourceController } from "./useWorkspaceResourceController.ts";

function createPreset(): PresetDocument {
  return {
    presetId: "preset_a",
    sourcePresetId: null,
    definition: {
      label: "Preset",
      description: "",
      state_schema: {},
      node: {
        kind: "agent",
        name: "Agent",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0.7,
        },
      },
    },
    createdAt: null,
    updatedAt: null,
    status: "active",
  };
}

function createKnowledgeBase(): KnowledgeBaseRecord {
  return {
    name: "kb_a",
    kb_id: "kb_a",
    label: "KB",
    description: "",
    sourceKind: "local",
    sourceUrl: "",
    version: "1",
    documentCount: 0,
    chunkCount: 0,
    importedAt: "",
  };
}

function createSettings(baseUrl = "1"): SettingsPayload {
  return {
    model: {
      text_model: "gpt",
      text_model_ref: "local:gpt",
      video_model: "",
      video_model_ref: "",
    },
    model_providers: {
      local: {
        label: "Local",
        transport: "openai-compatible",
        base_url: baseUrl,
        enabled: true,
        models: [],
      },
    },
    revision: { max_revision_round: 1 },
    evaluator: { default_score_threshold: 0.8, routes: [] },
    tools: [],
  };
}

function createSkillDefinition(): SkillDefinition {
  return {
    skillKey: "skill_a",
    name: "Skill",
    description: "",
    agentInstruction: "",
    schemaVersion: "graphite.skill/v1",
    version: "1",
    kind: "tool",
    mode: "tool",
    scope: "node",
    permissions: [],
    runtime: { type: "python", entrypoint: "run.py" },
    health: { type: "none" },
    inputSchema: [],
    outputSchema: [],
    supportedValueTypes: [],
    sideEffects: [],
    agentNodeEligibility: "ready",
    agentNodeBlockers: [],
    sourceFormat: "skill",
    sourceScope: "installed",
    sourcePath: "",
    runtimeReady: true,
    runtimeRegistered: true,
    configured: true,
    healthy: true,
    status: "active",
    canManage: true,
  };
}

test("useWorkspaceResourceController loads editor resources into refs", async () => {
  const controller = useWorkspaceResourceController({
    fetchKnowledgeBases: async () => [createKnowledgeBase()],
    fetchSettings: async () => createSettings(),
    fetchSkillDefinitions: async () => [createSkillDefinition()],
    fetchPresets: async () => [createPreset()],
  });

  await controller.loadKnowledgeBases();
  await controller.loadSettings();
  await controller.loadSkillDefinitions();
  await controller.loadPersistedPresets();

  assert.equal(controller.knowledgeBases.value[0]?.label, "KB");
  assert.equal(controller.settings.value?.model.text_model, "gpt");
  assert.equal(controller.skillDefinitions.value[0]?.skillKey, "skill_a");
  assert.equal(controller.skillDefinitionsLoading.value, false);
  assert.equal(controller.skillDefinitionsError.value, null);
  assert.equal(controller.persistedPresets.value[0]?.presetId, "preset_a");
});

test("useWorkspaceResourceController preserves fallback behavior on resource failures", async () => {
  const controller = useWorkspaceResourceController({
    fetchKnowledgeBases: async () => {
      throw new Error("kb down");
    },
    fetchSettings: async () => {
      throw new Error("settings down");
    },
    fetchSkillDefinitions: async () => {
      throw new Error("skills down");
    },
    fetchPresets: async () => [],
  });

  await controller.loadKnowledgeBases();
  await controller.loadSettings();
  await controller.loadSkillDefinitions();

  assert.deepEqual(controller.knowledgeBases.value, []);
  assert.equal(controller.settings.value, null);
  assert.deepEqual(controller.skillDefinitions.value, []);
  assert.equal(controller.skillDefinitionsLoading.value, false);
  assert.equal(controller.skillDefinitionsError.value, "skills down");
});

test("useWorkspaceResourceController refreshes agent models through settings reload", async () => {
  let settingsCalls = 0;
  const controller = useWorkspaceResourceController({
    fetchKnowledgeBases: async () => [],
    fetchSettings: async () => {
      settingsCalls += 1;
      return createSettings(String(settingsCalls));
    },
    fetchSkillDefinitions: async () => [],
    fetchPresets: async () => [],
  });

  await controller.loadSettings();
  await controller.refreshAgentModels();

  assert.equal(settingsCalls, 2);
  assert.equal(controller.settings.value?.model_providers?.local?.base_url, "2");
});

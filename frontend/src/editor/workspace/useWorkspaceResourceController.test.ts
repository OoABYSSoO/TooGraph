import assert from "node:assert/strict";
import test from "node:test";

import type { PresetDocument } from "@/types/node-system";
import type { KnowledgeBaseRecord } from "@/types/knowledge";
import type { SettingsPayload } from "@/types/settings";
import type { ActionDefinition } from "@/types/actions";
import type { ToolDefinition } from "@/types/tools";

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
          actionKey: "",
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
    embeddingProvider: "",
    embeddingModel: "",
    embeddingDimension: 0,
    embeddingCount: 0,
    embeddingUpdatedAt: "",
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

function createActionDefinition(): ActionDefinition {
  return {
    actionKey: "action_a",
    name: "Action",
    description: "",
    llmInstruction: "",
    schemaVersion: "toograph.action/v1",
    version: "1",
    capabilityPolicy: {
      default: { selectable: true, requiresApproval: false },
      origins: {},
    },
    permissions: [],
    runtime: { type: "python", entrypoint: "run.py" },
    llmOutputSchema: [],
    stateOutputSchema: [],
    llmNodeEligibility: "ready",
    llmNodeBlockers: [],
    sourceScope: "installed",
    sourcePath: "",
    runtimeReady: true,
    runtimeRegistered: true,
    status: "active",
    canManage: true,
  };
}

function createToolDefinition(): ToolDefinition {
  return {
    toolKey: "tool_a",
    name: "Tool",
    description: "",
    schemaVersion: "toograph.tool/v1",
    version: "1",
    permissions: [],
    runtime: { type: "python", entrypoint: "run.py" },
    inputSchema: [],
    outputSchema: [],
    sourceScope: "installed",
    sourcePath: "",
    runtimeReady: true,
    runtimeRegistered: true,
    status: "active",
    canManage: true,
  };
}

test("useWorkspaceResourceController loads editor resources into refs", async () => {
  const controller = useWorkspaceResourceController({
    fetchKnowledgeBases: async () => [createKnowledgeBase()],
    fetchSettings: async () => createSettings(),
    fetchActionDefinitions: async () => [createActionDefinition()],
    fetchToolDefinitions: async () => [createToolDefinition()],
    fetchPresets: async () => [createPreset()],
  });

  await controller.loadKnowledgeBases();
  await controller.loadSettings();
  await controller.loadActionDefinitions();
  await controller.loadToolDefinitions();
  await controller.loadPersistedPresets();

  assert.equal(controller.knowledgeBases.value[0]?.label, "KB");
  assert.equal(controller.settings.value?.model.text_model, "gpt");
  assert.equal(controller.actionDefinitions.value[0]?.actionKey, "action_a");
  assert.equal(controller.actionDefinitionsLoading.value, false);
  assert.equal(controller.actionDefinitionsError.value, null);
  assert.equal(controller.toolDefinitions.value[0]?.toolKey, "tool_a");
  assert.equal(controller.toolDefinitionsLoading.value, false);
  assert.equal(controller.toolDefinitionsError.value, null);
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
    fetchActionDefinitions: async () => {
      throw new Error("actions down");
    },
    fetchToolDefinitions: async () => {
      throw new Error("tools down");
    },
    fetchPresets: async () => [],
  });

  await controller.loadKnowledgeBases();
  await controller.loadSettings();
  await controller.loadActionDefinitions();
  await controller.loadToolDefinitions();

  assert.deepEqual(controller.knowledgeBases.value, []);
  assert.equal(controller.settings.value, null);
  assert.deepEqual(controller.actionDefinitions.value, []);
  assert.equal(controller.actionDefinitionsLoading.value, false);
  assert.equal(controller.actionDefinitionsError.value, "actions down");
  assert.deepEqual(controller.toolDefinitions.value, []);
  assert.equal(controller.toolDefinitionsLoading.value, false);
  assert.equal(controller.toolDefinitionsError.value, "tools down");
});

test("useWorkspaceResourceController refreshes agent models through settings reload", async () => {
  let settingsCalls = 0;
  const controller = useWorkspaceResourceController({
    fetchKnowledgeBases: async () => [],
    fetchSettings: async () => {
      settingsCalls += 1;
      return createSettings(String(settingsCalls));
    },
    fetchActionDefinitions: async () => [],
    fetchToolDefinitions: async () => [],
    fetchPresets: async () => [],
  });

  await controller.loadSettings();
  await controller.refreshAgentModels();

  assert.equal(settingsCalls, 2);
  assert.equal(controller.settings.value?.model_providers?.local?.base_url, "2");
});

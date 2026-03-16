import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type { GraphPayload, PresetDocument, PresetSaveResponse } from "@/types/node-system";

import { useWorkspacePresetController } from "./useWorkspacePresetController.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

function graphDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Preset Graph",
    nodes: {
      agent_a: {
        kind: "agent",
        name: "Research Agent",
        description: "Find facts",
        reads: [{ state: "topic" }],
        writes: [{ state: "summary" }],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0,
        },
        ui: { position: { x: 0, y: 0 } },
      },
    },
    edges: [],
    conditional_edges: [],
    state_schema: {
      topic: { name: "Topic", description: "", type: "string", color: "#111111" },
      summary: { name: "Summary", description: "", type: "string", color: "#222222" },
      unused: { name: "Unused", description: "", type: "string", color: "#333333" },
    },
    metadata: {},
  } as unknown as GraphPayload;
}

function presetDocument(presetId: string, label: string): PresetDocument {
  return {
    presetId,
    sourcePresetId: null,
    definition: {
      label,
      description: "",
      state_schema: {},
      node: graphDocument().nodes.agent_a,
    },
    createdAt: null,
    updatedAt: null,
    status: "active",
  };
}

function createHarness() {
  const documentsByTabId = ref<Record<string, GraphPayload>>({
    tab_a: graphDocument(),
  });
  const persistedPresets = ref<PresetDocument[]>([presetDocument("preset.saved", "Old")]);
  const savedPayloads: Array<{ presetId: string; sourcePresetId: string | null; definition: PresetDocument["definition"] }> = [];
  const feedback: Array<{ tabId: string; feedback: Partial<WorkspaceRunFeedback> }> = [];
  const toasts: Array<{ type: "success" | "error"; message: string }> = [];

  const controller = useWorkspacePresetController({
    documentsByTabId,
    persistedPresets,
    savePreset: async (payload) => {
      savedPayloads.push(payload);
      return { presetId: "preset.saved", saved: true, updatedAt: null } satisfies PresetSaveResponse;
    },
    fetchPreset: async () => presetDocument("preset.saved", "Research Agent"),
    setMessageFeedbackForTab: (tabId, nextFeedback) => {
      feedback.push({ tabId, feedback: nextFeedback });
    },
    showPresetSaveToast: (type, message) => {
      toasts.push({ type, message });
    },
    translate: (key, params) => `${key}:${params?.label ?? ""}`,
  });

  return {
    documentsByTabId,
    persistedPresets,
    savedPayloads,
    feedback,
    toasts,
    controller,
  };
}

test("useWorkspacePresetController saves agent node presets and refreshes the preset list", async () => {
  const harness = createHarness();

  await harness.controller.saveNodePresetForTab("tab_a", "agent_a");

  assert.equal(harness.savedPayloads.length, 1);
  assert.equal(harness.savedPayloads[0]?.definition.label, "Research Agent");
  assert.deepEqual(Object.keys(harness.savedPayloads[0]?.definition.state_schema ?? {}).sort(), ["summary", "topic"]);
  assert.deepEqual(harness.persistedPresets.value.map((preset) => preset.presetId), ["preset.saved"]);
  assert.equal(harness.persistedPresets.value[0]?.definition.label, "Research Agent");
  assert.equal(harness.feedback.at(-1)?.feedback.tone, "success");
  assert.equal(harness.feedback.at(-1)?.feedback.message, "feedback.presetSaved:Research Agent");
  assert.deepEqual(harness.toasts, [{ type: "success", message: "feedback.presetSaved:Research Agent" }]);
});

test("useWorkspacePresetController reports preset save failure for non-agent nodes", async () => {
  const harness = createHarness();

  await harness.controller.saveNodePresetForTab("tab_a", "missing_node");

  assert.equal(harness.savedPayloads.length, 0);
  assert.equal(harness.feedback.at(-1)?.feedback.tone, "danger");
  assert.equal(harness.feedback.at(-1)?.feedback.message, "feedback.presetSaveFailed:");
  assert.deepEqual(harness.toasts, [{ type: "error", message: "feedback.presetSaveFailed:" }]);
});

import { toRaw, type Ref } from "vue";

import type { GraphDocument, GraphPayload, PresetDocument, PresetSaveResponse } from "../../types/node-system.ts";

import { buildPresetPayloadForNode, type PresetPayload } from "./presetPersistence.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

type WorkspacePresetControllerInput = {
  documentsByTabId: Ref<Record<string, GraphPayload | GraphDocument>>;
  persistedPresets: Ref<PresetDocument[]>;
  savePreset: (payload: PresetPayload) => Promise<PresetSaveResponse>;
  fetchPreset: (presetId: string) => Promise<PresetDocument>;
  setMessageFeedbackForTab: (
    tabId: string,
    feedback: { tone: WorkspaceRunFeedback["tone"]; message: string; activeRunId?: string | null; activeRunStatus?: string | null },
  ) => void;
  showPresetSaveToast: (type: "success" | "error", message: string) => void;
  translate: (key: string, params?: Record<string, unknown>) => string;
};

export function useWorkspacePresetController(input: WorkspacePresetControllerInput) {
  async function saveNodePresetForTab(tabId: string, nodeId: string) {
    const document = input.documentsByTabId.value[tabId];
    if (!document) {
      return;
    }

    const payload = buildPresetPayloadForNode(toRaw(document), nodeId);
    if (!payload) {
      const message = input.translate("feedback.presetSaveFailed");
      input.setMessageFeedbackForTab(tabId, {
        tone: "danger",
        message,
      });
      input.showPresetSaveToast("error", message);
      return;
    }

    try {
      const saved = await input.savePreset(payload);
      const savedPreset = await input.fetchPreset(saved.presetId);
      const presetLabel = savedPreset.definition.label || savedPreset.presetId;
      input.persistedPresets.value = [
        savedPreset,
        ...input.persistedPresets.value.filter((preset) => preset.presetId !== savedPreset.presetId),
      ];
      const message = input.translate("feedback.presetSaved", { label: presetLabel });
      input.setMessageFeedbackForTab(tabId, {
        tone: "success",
        message,
      });
      input.showPresetSaveToast("success", message);
    } catch (error) {
      const message = error instanceof Error ? error.message : input.translate("feedback.presetSaveFailed");
      input.setMessageFeedbackForTab(tabId, {
        tone: "danger",
        message,
      });
      input.showPresetSaveToast("error", message);
    }
  }

  return {
    saveNodePresetForTab,
  };
}

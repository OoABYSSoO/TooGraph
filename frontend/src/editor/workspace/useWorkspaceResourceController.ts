import { ref } from "vue";

import type { KnowledgeBaseRecord } from "../../types/knowledge.ts";
import type { PresetDocument } from "../../types/node-system.ts";
import type { SettingsPayload } from "../../types/settings.ts";
import type { SkillDefinition } from "../../types/skills.ts";

type WorkspaceResourceControllerInput = {
  fetchKnowledgeBases: () => Promise<KnowledgeBaseRecord[]>;
  fetchSettings: () => Promise<SettingsPayload>;
  fetchSkillDefinitions: () => Promise<SkillDefinition[]>;
  fetchPresets: () => Promise<PresetDocument[]>;
};

export function useWorkspaceResourceController(input: WorkspaceResourceControllerInput) {
  const knowledgeBases = ref<KnowledgeBaseRecord[]>([]);
  const settings = ref<SettingsPayload | null>(null);
  const skillDefinitions = ref<SkillDefinition[]>([]);
  const skillDefinitionsLoading = ref(true);
  const skillDefinitionsError = ref<string | null>(null);
  const persistedPresets = ref<PresetDocument[]>([]);

  async function loadKnowledgeBases() {
    try {
      knowledgeBases.value = await input.fetchKnowledgeBases();
    } catch {
      knowledgeBases.value = [];
    }
  }

  async function loadSettings() {
    try {
      settings.value = await input.fetchSettings();
    } catch {
      settings.value = null;
    }
  }

  async function refreshAgentModels() {
    await loadSettings();
  }

  async function loadSkillDefinitions() {
    try {
      skillDefinitionsLoading.value = true;
      skillDefinitions.value = await input.fetchSkillDefinitions();
      skillDefinitionsError.value = null;
    } catch (error) {
      skillDefinitions.value = [];
      skillDefinitionsError.value = error instanceof Error ? error.message : "Failed to load skills.";
    } finally {
      skillDefinitionsLoading.value = false;
    }
  }

  async function loadPersistedPresets() {
    persistedPresets.value = await input.fetchPresets();
  }

  function loadInitialWorkspaceResources() {
    void loadKnowledgeBases();
    void loadSettings();
    void loadSkillDefinitions();
    void loadPersistedPresets();
  }

  return {
    knowledgeBases,
    settings,
    skillDefinitions,
    skillDefinitionsLoading,
    skillDefinitionsError,
    persistedPresets,
    loadInitialWorkspaceResources,
    loadKnowledgeBases,
    loadSettings,
    refreshAgentModels,
    loadSkillDefinitions,
    loadPersistedPresets,
  };
}

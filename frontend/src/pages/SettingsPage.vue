<template>
  <AppShell>
    <section class="settings-page">
      <header class="settings-page__hero">
        <div class="settings-page__eyebrow">{{ t("settings.eyebrow") }}</div>
        <h2 class="settings-page__title">{{ t("settings.title") }}</h2>
        <p class="settings-page__body">{{ t("settings.body") }}</p>
      </header>

      <div v-if="error" class="settings-page__empty">{{ t("common.failedToLoad", { error }) }}</div>
      <div v-else-if="!settings || !draft" class="settings-page__empty">{{ t("common.loadingSettings") }}</div>
      <template v-else>
        <section class="settings-page__grid">
          <article class="settings-page__panel">
            <h3>{{ t("settings.defaultRuntime") }}</h3>
            <label>
              <span>{{ t("settings.defaultModel") }}</span>
              <ElSelect
                v-model="draft.text_model_ref"
                class="settings-page__select graphite-select"
                :teleported="false"
                popper-class="graphite-select-popper"
              >
                <ElOption v-for="option in configuredModelOptions" :key="option.value" :label="option.label" :value="option.value" />
              </ElSelect>
            </label>
            <label>
              <span>{{ t("settings.defaultVideoModel") }}</span>
              <ElSelect
                v-model="draft.video_model_ref"
                class="settings-page__select graphite-select"
                :teleported="false"
                popper-class="graphite-select-popper"
              >
                <ElOption v-for="option in configuredModelOptions" :key="option.value" :label="option.label" :value="option.value" />
              </ElSelect>
            </label>
          </article>

          <article class="settings-page__panel">
            <h3>{{ t("settings.agentRuntime") }}</h3>
            <label>
              <span>{{ t("settings.defaultThinking") }}</span>
              <ElSelect
                v-model="thinkingMode"
                class="settings-page__select graphite-select"
                :teleported="false"
                popper-class="graphite-select-popper"
              >
                <ElOption v-for="option in thinkingLevelOptions" :key="option.value" :label="option.label" :value="option.value" />
              </ElSelect>
            </label>
            <label>
              <span>{{ t("settings.defaultTemperature") }}</span>
              <input v-model.number="draft.temperature" type="number" min="0" max="2" step="0.1" />
            </label>
            <div class="settings-page__hint">{{ t("settings.hint") }}</div>
            <div class="settings-page__actions">
              <button type="button" class="settings-page__button settings-page__button--primary" :disabled="!canSave" @click="handleSave">
                {{ isSaving ? t("settings.saving") : t("settings.saveSettings") }}
              </button>
              <span v-if="saveMessage" class="settings-page__save-message">{{ saveMessage }}</span>
            </div>
          </article>

          <article class="settings-page__panel settings-page__panel--wide">
            <div class="settings-page__panel-heading">
              <h3>{{ t("settings.modelProviders") }}</h3>
              <RouterLink to="/models" class="settings-page__button settings-page__button--primary">
                {{ t("settings.openModelProviders") }}
              </RouterLink>
            </div>
            <p class="settings-page__hint">{{ t("settings.modelProvidersSummary") }}</p>
            <div class="settings-page__summary-grid">
              <div class="settings-page__info">
                <span>{{ t("settings.configuredProviders") }}</span>
                <strong>{{ configuredProviderCount }}</strong>
              </div>
              <div class="settings-page__info">
                <span>{{ t("settings.enabledProviders") }}</span>
                <strong>{{ enabledProviderCount }}</strong>
              </div>
              <div class="settings-page__info">
                <span>{{ t("settings.availableModels") }}</span>
                <strong>{{ configuredModelOptions.length }}</strong>
              </div>
            </div>
          </article>

          <article class="settings-page__panel">
            <h3>{{ t("settings.revisionEvaluator") }}</h3>
            <div class="settings-page__info">
              <span>{{ t("settings.maxRevisionRounds") }}</span>
              <strong>{{ settings.revision.max_revision_round }}</strong>
            </div>
            <div class="settings-page__info">
              <span>{{ t("settings.threshold") }}</span>
              <strong>{{ settings.evaluator.default_score_threshold }}</strong>
            </div>
            <div class="settings-page__info">
              <span>{{ t("settings.routes") }}</span>
              <strong>{{ settings.evaluator.routes.join(", ") }}</strong>
            </div>
          </article>
        </section>

        <article class="settings-page__panel">
          <h3>{{ t("settings.tools") }}</h3>
          <div class="settings-page__badges">
            <span v-for="tool in settings.tools" :key="tool">{{ tool }}</span>
          </div>
        </article>
      </template>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElOption, ElSelect } from "element-plus";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";

import { fetchSettings, updateSettings } from "@/api/settings";
import AppShell from "@/layouts/AppShell.vue";
import type { AgentThinkingLevel, SettingsPayload, SettingsProviderModel } from "@/types/settings";

import { clampSettingsTemperature } from "./settingsPageModel.ts";

type SettingsDraft = {
  text_model_ref: string;
  video_model_ref: string;
  thinking_enabled: boolean;
  thinking_level: AgentThinkingLevel;
  temperature: number;
};

const settings = ref<SettingsPayload | null>(null);
const draft = ref<SettingsDraft | null>(null);
const error = ref<string | null>(null);
const saveMessage = ref<string | null>(null);
const isSaving = ref(false);
const { t } = useI18n();

function buildDraftFromSettings(payload: SettingsPayload): SettingsDraft {
  return {
    text_model_ref: payload.agent_runtime_defaults?.model ?? payload.model.text_model_ref,
    video_model_ref: payload.model.video_model_ref,
    thinking_enabled: payload.agent_runtime_defaults?.thinking_enabled ?? true,
    thinking_level: normalizeThinkingLevel(payload.agent_runtime_defaults?.thinking_level),
    temperature: payload.agent_runtime_defaults?.temperature ?? 0.2,
  };
}

function normalizeThinkingLevel(value: string | null | undefined): AgentThinkingLevel {
  if (value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }
  return "auto";
}

function formatModelChoiceLabel(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) return "";
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
}

function getConcreteModelName(model: SettingsProviderModel) {
  return model.route_target?.trim() || model.label?.trim() || model.model?.trim() || formatModelChoiceLabel(model.model_ref);
}

function buildModelDisplayLookup(models: SettingsProviderModel[]) {
  const baseLabels = models.map((model) => getConcreteModelName(model));
  const duplicateCount = new Map<string, number>();
  for (const label of baseLabels) {
    duplicateCount.set(label, (duplicateCount.get(label) ?? 0) + 1);
  }

  return Object.fromEntries(
    models.map((model, index) => {
      const baseLabel = baseLabels[index];
      const alias = model.model?.trim() || formatModelChoiceLabel(model.model_ref);
      const label =
        (duplicateCount.get(baseLabel) ?? 0) > 1 && alias && alias !== baseLabel ? `${baseLabel} / ${alias}` : baseLabel;
      return [model.model_ref, label];
    }),
  ) as Record<string, string>;
}

const configuredProviders = computed(() =>
  (settings.value?.model_catalog?.providers ?? []).filter((provider) => provider.configured || provider.saved),
);
const enabledProviders = computed(() => configuredProviders.value.filter((provider) => provider.enabled));
const configuredProviderCount = computed(() => configuredProviders.value.length);
const enabledProviderCount = computed(() => enabledProviders.value.length);
const configuredModels = computed(() => enabledProviders.value.flatMap((provider) => provider.models));
const modelDisplayLookup = computed(() => buildModelDisplayLookup(configuredModels.value));
const configuredModelOptions = computed(() => {
  const options = new Map(
    configuredModels.value.map((model) => [
      model.model_ref,
      {
        value: model.model_ref,
        label: modelDisplayLookup.value[model.model_ref] || model.model_ref,
      },
    ]),
  );
  for (const modelRef of [draft.value?.text_model_ref, draft.value?.video_model_ref]) {
    if (modelRef && !options.has(modelRef)) {
      options.set(modelRef, { value: modelRef, label: formatModelChoiceLabel(modelRef) || modelRef });
    }
  }
  return Array.from(options.values());
});
const thinkingLevelOptions = computed<Array<{ value: AgentThinkingLevel; label: string }>>(() => [
  { value: "off", label: t("settings.thinkingOff") },
  { value: "auto", label: t("settings.thinkingAuto") },
  { value: "low", label: t("settings.thinkingFast") },
  { value: "medium", label: t("settings.thinkingBalanced") },
  { value: "high", label: t("settings.thinkingDeep") },
  { value: "xhigh", label: t("settings.thinkingExtreme") },
]);
const thinkingMode = computed({
  get: () => draft.value?.thinking_level ?? "auto",
  set: (value: string) => {
    if (!draft.value) {
      return;
    }
    draft.value.thinking_level = normalizeThinkingLevel(value);
    draft.value.thinking_enabled = draft.value.thinking_level !== "off";
  },
});
const isDirty = computed(() => {
  if (!settings.value || !draft.value) {
    return false;
  }
  return JSON.stringify(draft.value) !== JSON.stringify(buildDraftFromSettings(settings.value));
});
const canSave = computed(() => isDirty.value && !isSaving.value && configuredModelOptions.value.length > 0);

function alignDefaultModelsToAvailableOptions() {
  if (!draft.value || configuredModelOptions.value.length === 0) {
    return;
  }
  const availableRefs = new Set(configuredModelOptions.value.map((option) => option.value));
  const fallbackRef = configuredModelOptions.value[0].value;
  if (!availableRefs.has(draft.value.text_model_ref)) {
    draft.value.text_model_ref = fallbackRef;
  }
  if (!availableRefs.has(draft.value.video_model_ref)) {
    draft.value.video_model_ref = fallbackRef;
  }
}

async function loadSettings() {
  try {
    settings.value = await fetchSettings();
    draft.value = buildDraftFromSettings(settings.value);
    error.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : t("common.loadingSettings");
  }
}

async function handleSave() {
  if (!draft.value || configuredModelOptions.value.length === 0) {
    return;
  }
  try {
    isSaving.value = true;
    saveMessage.value = null;
    alignDefaultModelsToAvailableOptions();
    settings.value = await updateSettings({
      model: {
        text_model_ref: draft.value.text_model_ref,
        video_model_ref: draft.value.video_model_ref,
      },
      agent_runtime_defaults: {
        model: draft.value.text_model_ref,
        thinking_enabled: draft.value.thinking_enabled,
        thinking_level: draft.value.thinking_level,
        temperature: clampSettingsTemperature(draft.value.temperature),
      },
    });
    draft.value = buildDraftFromSettings(settings.value);
    saveMessage.value = t("settings.saved");
    error.value = null;
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : t("common.failedToSave", { error: "" });
  } finally {
    isSaving.value = false;
  }
}

onMounted(loadSettings);
</script>

<style scoped>
.settings-page {
  display: grid;
  gap: 18px;
}

.settings-page__hero,
.settings-page__panel,
.settings-page__empty {
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-panel);
  box-shadow: var(--graphite-shadow-panel);
}

.settings-page__hero,
.settings-page__empty {
  padding: 24px;
}

.settings-page__panel {
  background: var(--graphite-surface-card);
  padding: 20px;
}

.settings-page__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.settings-page__title {
  margin: 8px 0 10px;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 2rem;
}

.settings-page__body,
.settings-page__hint,
.settings-page__empty {
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.settings-page__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.settings-page__panel h3 {
  margin-top: 0;
}

.settings-page__panel--wide {
  grid-column: span 2;
}

.settings-page__panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.settings-page__panel-heading h3 {
  margin: 0;
}

.settings-page__panel label {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  color: rgba(60, 41, 20, 0.72);
}

.settings-page__panel input {
  min-height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.82);
}

.settings-page__select {
  width: 100%;
}

.settings-page__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.settings-page__button {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(154, 52, 18, 0.2);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  text-decoration: none;
  cursor: pointer;
}

.settings-page__button--primary {
  background: rgb(154, 52, 18);
  color: rgb(255, 248, 240);
}

.settings-page__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-page__save-message {
  color: rgba(60, 41, 20, 0.72);
}

.settings-page__summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.settings-page__info {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.62);
  margin-top: 10px;
}

.settings-page__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.settings-page__badges span {
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
  font-family: var(--graphite-font-mono);
  font-size: 0.84rem;
}

@media (max-width: 1100px) {
  .settings-page__grid,
  .settings-page__summary-grid {
    grid-template-columns: 1fr;
  }

  .settings-page__panel--wide {
    grid-column: auto;
  }

  .settings-page__panel-heading {
    display: grid;
  }
}
</style>

<template>
  <AppShell>
    <section class="settings-page">
      <header class="settings-page__hero">
        <div class="settings-page__eyebrow">Settings</div>
        <h2 class="settings-page__title">系统设置</h2>
        <p class="settings-page__body">这里先恢复旧前端最关键的设置逻辑：默认模型、Agent 运行默认值、Provider 摘要和工具列表。</p>
      </header>

      <div v-if="error" class="settings-page__empty">加载失败：{{ error }}</div>
      <div v-else-if="!settings || !draft" class="settings-page__empty">Loading settings…</div>
      <template v-else>
        <section class="settings-page__grid">
          <article class="settings-page__panel">
            <h3>Default Runtime</h3>
            <label>
              <span>Default model</span>
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
              <span>Default video model</span>
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
            <h3>Agent Runtime</h3>
            <label>
              <span>Default thinking</span>
              <ElSelect
                v-model="thinkingMode"
                class="settings-page__select graphite-select"
                :teleported="false"
                popper-class="graphite-select-popper"
              >
                <ElOption label="off" value="off" />
                <ElOption label="on" value="on" />
              </ElSelect>
            </label>
            <label>
              <span>Default temperature</span>
              <input v-model.number="draft.temperature" type="number" min="0" max="2" step="0.1" />
            </label>
            <div class="settings-page__hint">New agent nodes start from this default value. Existing nodes can still be changed per node.</div>
            <div class="settings-page__actions">
              <button type="button" class="settings-page__button" :disabled="!isDirty || isSaving" @click="handleSave">
                {{ isSaving ? "Saving…" : "Save Settings" }}
              </button>
              <span v-if="saveMessage" class="settings-page__save-message">{{ saveMessage }}</span>
            </div>
          </article>

          <article class="settings-page__panel">
            <h3>Revision & Evaluator</h3>
            <div class="settings-page__info"><span>Max revision rounds</span><strong>{{ settings.revision.max_revision_round }}</strong></div>
            <div class="settings-page__info"><span>Threshold</span><strong>{{ settings.evaluator.default_score_threshold }}</strong></div>
            <div class="settings-page__info"><span>Routes</span><strong>{{ settings.evaluator.routes.join(", ") }}</strong></div>
          </article>
        </section>

        <article class="settings-page__panel">
          <h3>Model Providers</h3>
          <div class="settings-page__providers">
            <div v-for="provider in settings.model_catalog?.providers ?? []" :key="provider.provider_id" class="settings-page__provider-card">
              <div class="settings-page__provider-header">
                <strong>{{ provider.label }}</strong>
                <div class="settings-page__badges">
                  <span>{{ provider.provider_id }}</span>
                  <span>{{ provider.transport }}</span>
                  <span>{{ provider.configured ? "configured" : "planned" }}</span>
                </div>
              </div>
              <p>{{ provider.description }}</p>
              <div class="settings-page__provider-url">Base URL: {{ provider.base_url }}</div>
              <div class="settings-page__badges">
                <span
                  v-for="modelLabel in listProviderModelBadges(provider, modelDisplayLookup)"
                  :key="`${provider.provider_id}-${modelLabel}`"
                >
                  {{ modelLabel }}
                </span>
              </div>
            </div>
          </div>
        </article>

        <article class="settings-page__panel">
          <h3>Tools</h3>
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

import { fetchSettings, updateSettings } from "@/api/settings";
import AppShell from "@/layouts/AppShell.vue";
import type { SettingsPayload } from "@/types/settings";

import { clampSettingsTemperature, listProviderModelBadges } from "./settingsPageModel.ts";

type SettingsDraft = {
  text_model_ref: string;
  video_model_ref: string;
  thinking_enabled: boolean;
  temperature: number;
};

const settings = ref<SettingsPayload | null>(null);
const draft = ref<SettingsDraft | null>(null);
const error = ref<string | null>(null);
const saveMessage = ref<string | null>(null);
const isSaving = ref(false);

function buildDraftFromSettings(payload: SettingsPayload): SettingsDraft {
  return {
    text_model_ref: payload.agent_runtime_defaults?.model ?? payload.model.text_model_ref,
    video_model_ref: payload.model.video_model_ref,
    thinking_enabled: payload.agent_runtime_defaults?.thinking_enabled ?? true,
    temperature: payload.agent_runtime_defaults?.temperature ?? 0.2,
  };
}

function formatModelChoiceLabel(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) return "";
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
}

function getConcreteModelName(model: {
  model_ref: string;
  model: string;
  label: string;
  route_target?: string | null;
}) {
  return model.route_target?.trim() || model.label?.trim() || model.model?.trim() || formatModelChoiceLabel(model.model_ref);
}

function buildModelDisplayLookup(
  models: Array<{
    model_ref: string;
    model: string;
    label: string;
    route_target?: string | null;
  }>,
) {
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
        (duplicateCount.get(baseLabel) ?? 0) > 1 && alias && alias !== baseLabel ? `${baseLabel} · ${alias}` : baseLabel;
      return [model.model_ref, label];
    }),
  ) as Record<string, string>;
}

const configuredModels = computed(
  () => (settings.value?.model_catalog?.providers ?? []).filter((provider) => provider.configured).flatMap((provider) => provider.models),
);
const modelDisplayLookup = computed(() => buildModelDisplayLookup(configuredModels.value));
const configuredModelOptions = computed(() =>
  Array.from(
    new Map(
      configuredModels.value.map((model) => [
        model.model_ref,
        {
          value: model.model_ref,
          label: modelDisplayLookup.value[model.model_ref] || model.model_ref,
        },
      ]),
    ).values(),
  ),
);
const thinkingMode = computed({
  get: () => (draft.value?.thinking_enabled ? "on" : "off"),
  set: (value: string) => {
    if (!draft.value) {
      return;
    }
    draft.value.thinking_enabled = value === "on";
  },
});
const isDirty = computed(() => {
  if (!settings.value || !draft.value) {
    return false;
  }
  return JSON.stringify(draft.value) !== JSON.stringify(buildDraftFromSettings(settings.value));
});

async function loadSettings() {
  try {
    settings.value = await fetchSettings();
    draft.value = buildDraftFromSettings(settings.value);
    error.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : "Failed to load settings.";
  }
}

async function handleSave() {
  if (!draft.value) {
    return;
  }
  try {
    isSaving.value = true;
    saveMessage.value = null;
    settings.value = await updateSettings({
      model: {
        text_model_ref: draft.value.text_model_ref,
        video_model_ref: draft.value.video_model_ref,
      },
      agent_runtime_defaults: {
        model: draft.value.text_model_ref,
        thinking_enabled: draft.value.thinking_enabled,
        temperature: clampSettingsTemperature(draft.value.temperature),
      },
    });
    draft.value = buildDraftFromSettings(settings.value);
    saveMessage.value = "设置已保存。";
    error.value = null;
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : "Failed to save settings.";
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
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 24px;
  background: rgba(255, 252, 247, 0.88);
  box-shadow: 0 18px 36px rgba(60, 41, 20, 0.08);
}

.settings-page__hero,
.settings-page__empty {
  padding: 24px;
}

.settings-page__panel {
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
  font-size: 2rem;
}

.settings-page__body {
  margin: 0;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.76);
}

.settings-page__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.settings-page__panel h3 {
  margin-top: 0;
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

.settings-page__hint,
.settings-page__provider-card p,
.settings-page__provider-url,
.settings-page__empty {
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.settings-page__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.settings-page__button {
  border: 1px solid rgba(154, 52, 18, 0.2);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  cursor: pointer;
}

.settings-page__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-page__save-message {
  color: rgba(60, 41, 20, 0.72);
}

.settings-page__info {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.78);
  margin-top: 10px;
}

.settings-page__providers {
  display: grid;
  gap: 12px;
}

.settings-page__provider-card {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.78);
}

.settings-page__provider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-page__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.settings-page__badges span {
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
  font-size: 0.84rem;
}

@media (max-width: 1100px) {
  .settings-page__grid {
    grid-template-columns: 1fr;
  }
}
</style>

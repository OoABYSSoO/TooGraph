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
                <ElOption :label="t('common.off')" value="off" />
                <ElOption :label="t('common.on')" value="on" />
              </ElSelect>
            </label>
            <label>
              <span>{{ t("settings.defaultTemperature") }}</span>
              <input v-model.number="draft.temperature" type="number" min="0" max="2" step="0.1" />
            </label>
            <div class="settings-page__hint">{{ t("settings.hint") }}</div>
            <div class="settings-page__actions">
              <button type="button" class="settings-page__button" :disabled="!canSave" @click="handleSave">
                {{ isSaving ? t("settings.saving") : t("settings.saveSettings") }}
              </button>
              <span v-if="saveMessage" class="settings-page__save-message">{{ saveMessage }}</span>
            </div>
          </article>

          <article class="settings-page__panel settings-page__panel--wide">
            <div class="settings-page__panel-heading">
              <h3>{{ t("settings.modelProviders") }}</h3>
            </div>
            <div class="settings-page__add-provider">
              <ElSelect
                v-model="selectedTemplateId"
                class="settings-page__select graphite-select"
                :teleported="false"
                popper-class="graphite-select-popper"
                :placeholder="t('settings.providerTemplate')"
              >
                <ElOption
                  v-for="provider in addableProviderTemplates"
                  :key="provider.provider_id"
                  :label="provider.label"
                  :value="provider.provider_id"
                />
              </ElSelect>
              <button
                type="button"
                class="settings-page__button settings-page__button--primary"
                :disabled="!selectedTemplateId"
                @click="handleAddProvider"
              >
                {{ t("settings.addProvider") }}
              </button>
            </div>

            <div class="settings-page__provider-editor-list">
              <section v-for="provider in providerDraftList" :key="provider.provider_id" class="settings-page__provider-editor">
                <div class="settings-page__provider-editor-header">
                  <div>
                    <strong>{{ provider.label || provider.provider_id }}</strong>
                    <div class="settings-page__badges">
                      <span>{{ provider.provider_id }}</span>
                      <span>{{ provider.transport }}</span>
                      <span>{{ provider.enabled ? t("settings.enabledProvider") : t("settings.disabledProvider") }}</span>
                      <span v-if="provider.api_key_configured">{{ t("settings.apiKeyStored") }}</span>
                    </div>
                  </div>
                  <label class="settings-page__toggle">
                    <input v-model="provider.enabled" type="checkbox" @change="alignDefaultModelsToProviderSelection" />
                    <span>{{ provider.enabled ? t("common.on") : t("common.off") }}</span>
                  </label>
                </div>

                <div class="settings-page__provider-fields">
                  <label>
                    <span>{{ t("settings.providerLabel") }}</span>
                    <input v-model.trim="provider.label" type="text" />
                  </label>
                  <label>
                    <span>{{ t("settings.providerId") }}</span>
                    <input :value="provider.provider_id" type="text" disabled />
                  </label>
                  <label>
                    <span>{{ t("settings.providerTransport") }}</span>
                    <ElSelect
                      v-model="provider.transport"
                      class="settings-page__select graphite-select"
                      :teleported="false"
                      popper-class="graphite-select-popper"
                    >
                      <ElOption label="OpenAI-compatible" value="openai-compatible" />
                      <ElOption label="Anthropic Messages" value="anthropic-messages" />
                      <ElOption label="Gemini generateContent" value="gemini-generate-content" />
                    </ElSelect>
                  </label>
                  <label>
                    <span>{{ t("settings.providerBaseUrl") }}</span>
                    <input v-model.trim="provider.base_url" type="url" />
                  </label>
                  <label>
                    <span>{{ t("settings.providerApiKey") }}</span>
                    <input
                      v-model.trim="provider.api_key"
                      type="password"
                      autocomplete="off"
                      :placeholder="provider.api_key_configured ? t('settings.keepExistingApiKey') : t('settings.optionalApiKey')"
                    />
                  </label>
                  <label>
                    <span>{{ t("settings.providerAuthHeader") }}</span>
                    <input v-model.trim="provider.auth_header" type="text" />
                  </label>
                  <label>
                    <span>{{ t("settings.providerAuthScheme") }}</span>
                    <input v-model.trim="provider.auth_scheme" type="text" />
                  </label>
                  <label>
                    <span>{{ t("settings.enabledModels") }}</span>
                    <ElSelect
                      v-model="provider.selected_models"
                      class="settings-page__select graphite-select"
                      multiple
                      filterable
                      allow-create
                      default-first-option
                      :reserve-keyword="false"
                      :teleported="false"
                      popper-class="graphite-select-popper"
                      @change="alignDefaultModelsToProviderSelection"
                    >
                      <ElOption
                        v-for="modelName in providerModelOptions(provider.provider_id)"
                        :key="`${provider.provider_id}-${modelName}`"
                        :label="modelName"
                        :value="modelName"
                      />
                    </ElSelect>
                  </label>
                </div>

                <div class="settings-page__provider-actions">
                  <button
                    type="button"
                    class="settings-page__button settings-page__button--primary"
                    :disabled="discoveringProviderId === provider.provider_id"
                    @click="handleDiscoverModels(provider.provider_id)"
                  >
                    {{ discoveringProviderId === provider.provider_id ? t("settings.discoveringModels") : t("settings.discoverModels") }}
                  </button>
                  <button
                    v-if="provider.provider_id !== 'local'"
                    type="button"
                    class="settings-page__button"
                    @click="handleRemoveProvider(provider.provider_id)"
                  >
                    {{ t("settings.removeProvider") }}
                  </button>
                  <span v-if="providerMessages[provider.provider_id]" class="settings-page__provider-message">
                    {{ providerMessages[provider.provider_id] }}
                  </span>
                </div>
              </section>
            </div>
          </article>

          <article class="settings-page__panel">
            <h3>{{ t("settings.revisionEvaluator") }}</h3>
            <div class="settings-page__info"><span>{{ t("settings.maxRevisionRounds") }}</span><strong>{{ settings.revision.max_revision_round }}</strong></div>
            <div class="settings-page__info"><span>{{ t("settings.threshold") }}</span><strong>{{ settings.evaluator.default_score_threshold }}</strong></div>
            <div class="settings-page__info"><span>{{ t("settings.routes") }}</span><strong>{{ settings.evaluator.routes.join(", ") }}</strong></div>
          </article>
        </section>

        <article class="settings-page__panel">
          <h3>{{ t("settings.modelProviders") }}</h3>
          <div class="settings-page__providers">
            <div v-for="provider in settings.model_catalog?.providers ?? []" :key="provider.provider_id" class="settings-page__provider-card">
              <div class="settings-page__provider-header">
                <strong>{{ provider.label }}</strong>
                <div class="settings-page__badges">
                  <span>{{ provider.provider_id }}</span>
                  <span>{{ provider.transport }}</span>
                  <span>{{ provider.configured ? t("common.configured") : t("common.planned") }}</span>
                </div>
              </div>
              <p>{{ provider.description }}</p>
              <div class="settings-page__provider-url">{{ t("common.baseUrl") }}: {{ provider.base_url }}</div>
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

import { discoverModelProviderModels, fetchSettings, updateSettings } from "@/api/settings";
import AppShell from "@/layouts/AppShell.vue";
import type { SettingsModelProvider, SettingsPayload } from "@/types/settings";

import {
  buildProviderDraftsFromSettings,
  buildProviderSavePayload,
  clampSettingsTemperature,
  listAddableProviderTemplates,
  listProviderModelBadges,
  providerDraftsFingerprint,
  type ProviderDraft,
} from "./settingsPageModel.ts";

type SettingsDraft = {
  text_model_ref: string;
  video_model_ref: string;
  thinking_enabled: boolean;
  temperature: number;
};
type LocalProviderDraft = {
  label: string;
  base_url: string;
  api_key: string;
  api_key_configured: boolean;
  discovered_models: string[];
  selected_models: string[];
};
type SettingsModel = NonNullable<SettingsPayload["model_catalog"]>["providers"][number]["models"][number];

const DEFAULT_LOCAL_PROVIDER_LABEL = "OpenAI-compatible Custom Provider";
const DEFAULT_LOCAL_PROVIDER_BASE_URL = "http://127.0.0.1:8888/v1";

const settings = ref<SettingsPayload | null>(null);
const draft = ref<SettingsDraft | null>(null);
const providerDraft = ref<LocalProviderDraft | null>(null);
const providerDrafts = ref<Record<string, ProviderDraft>>({});
const selectedTemplateId = ref("");
const error = ref<string | null>(null);
const saveMessage = ref<string | null>(null);
const providerMessage = ref<string | null>(null);
const providerMessages = ref<Record<string, string>>({});
const isSaving = ref(false);
const isDiscoveringModels = ref(false);
const discoveringProviderId = ref<string | null>(null);
const { t } = useI18n();

function dedupeStrings(values: string[]) {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) {
      continue;
    }
    const identity = value.toLowerCase();
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    items.push(value);
  }
  return items;
}

function buildDraftFromSettings(payload: SettingsPayload): SettingsDraft {
  return {
    text_model_ref: payload.agent_runtime_defaults?.model ?? payload.model.text_model_ref,
    video_model_ref: payload.model.video_model_ref,
    thinking_enabled: payload.agent_runtime_defaults?.thinking_enabled ?? true,
    temperature: payload.agent_runtime_defaults?.temperature ?? 0.2,
  };
}

function getLocalProvider(payload: SettingsPayload) {
  return payload.model_catalog?.providers.find((provider) => provider.provider_id === "local") ?? null;
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

function getModelName(model: Pick<SettingsModel, "model" | "model_ref">) {
  return model.model?.trim() || formatModelChoiceLabel(model.model_ref);
}

function buildProviderDraftFromSettings(payload: SettingsPayload): LocalProviderDraft {
  const localProvider = getLocalProvider(payload);
  const modelNames = dedupeStrings((localProvider?.models ?? []).map((model) => getModelName(model)));
  return {
    label: localProvider?.label ?? DEFAULT_LOCAL_PROVIDER_LABEL,
    base_url: localProvider?.base_url ?? DEFAULT_LOCAL_PROVIDER_BASE_URL,
    api_key: "",
    api_key_configured: Boolean(localProvider?.api_key_configured),
    discovered_models: modelNames,
    selected_models: modelNames,
  };
}

function buildProviderDraftFromTemplate(provider: SettingsModelProvider): ProviderDraft {
  const modelNames = dedupeStrings(provider.models.map((model) => model.model));
  return {
    provider_id: provider.provider_id,
    label: provider.label,
    transport: provider.transport,
    base_url: provider.base_url,
    enabled: true,
    auth_header: provider.auth_header ?? "Authorization",
    auth_scheme: provider.auth_scheme ?? (provider.transport === "openai-compatible" ? "Bearer" : ""),
    api_key: "",
    api_key_configured: Boolean(provider.api_key_configured),
    discovered_models: modelNames,
    selected_models: modelNames,
  };
}

function providerDraftFingerprint(value: LocalProviderDraft | null) {
  if (!value) {
    return "";
  }
  return JSON.stringify({
    label: value.label.trim() || DEFAULT_LOCAL_PROVIDER_LABEL,
    base_url: value.base_url.trim().replace(/\/+$/, ""),
    selected_models: dedupeStrings(value.selected_models),
  });
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

const providerDraftList = computed(() =>
  Object.values(providerDrafts.value).sort((left, right) => {
    if (left.provider_id === "local") return -1;
    if (right.provider_id === "local") return 1;
    return left.label.localeCompare(right.label);
  }),
);
const addableProviderTemplates = computed(() =>
  settings.value ? listAddableProviderTemplates(settings.value, providerDrafts.value) : [],
);
const configuredModels = computed(() =>
  providerDraftList.value
    .filter((provider) => provider.enabled)
    .flatMap((provider) =>
      provider.selected_models.map((modelName) => ({
        model_ref: `${provider.provider_id}/${modelName}`,
        model: modelName,
        label: modelName,
        route_target: null,
      })),
    ),
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
function providerModelOptions(providerId: string) {
  const provider = providerDrafts.value[providerId];
  if (!provider) {
    return [];
  }
  return dedupeStrings([...provider.discovered_models, ...provider.selected_models]);
}
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
  const runtimeChanged = JSON.stringify(draft.value) !== JSON.stringify(buildDraftFromSettings(settings.value));
  const providerChanged =
    providerDraftsFingerprint(providerDrafts.value) !== providerDraftsFingerprint(buildProviderDraftsFromSettings(settings.value)) ||
    Object.values(providerDrafts.value).some((provider) => Boolean(provider.api_key.trim()));
  return runtimeChanged || providerChanged;
});
const canSave = computed(() => isDirty.value && !isSaving.value && configuredModelOptions.value.length > 0);

function extractLocalModelName(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes("/") && !trimmed.startsWith("local/")) {
    return "";
  }
  return trimmed.includes("/") ? trimmed.split("/").slice(1).join("/") : trimmed;
}

function alignDefaultModelsToProviderSelection() {
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

function buildLocalProviderModelsForSave() {
  if (!providerDraft.value || !draft.value) {
    return [];
  }
  return dedupeStrings([
    ...providerDraft.value.selected_models,
    extractLocalModelName(draft.value.text_model_ref),
    extractLocalModelName(draft.value.video_model_ref),
  ]).map((modelName) => ({
    model: modelName,
    label: modelName,
  }));
}

async function loadSettings() {
  try {
    settings.value = await fetchSettings();
    draft.value = buildDraftFromSettings(settings.value);
    providerDraft.value = buildProviderDraftFromSettings(settings.value);
    providerDrafts.value = buildProviderDraftsFromSettings(settings.value);
    error.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : t("common.loadingSettings");
  }
}

function setProviderMessage(providerId: string, message: string | null) {
  providerMessages.value = {
    ...providerMessages.value,
    [providerId]: message ?? "",
  };
}

function handleAddProvider() {
  if (!settings.value || !selectedTemplateId.value) {
    return;
  }
  const template = addableProviderTemplates.value.find((provider) => provider.provider_id === selectedTemplateId.value);
  if (!template) {
    return;
  }
  providerDrafts.value = {
    ...providerDrafts.value,
    [template.provider_id]: buildProviderDraftFromTemplate(template),
  };
  selectedTemplateId.value = "";
  alignDefaultModelsToProviderSelection();
}

function handleRemoveProvider(providerId: string) {
  const nextDrafts = { ...providerDrafts.value };
  delete nextDrafts[providerId];
  providerDrafts.value = nextDrafts;
  alignDefaultModelsToProviderSelection();
}

async function handleDiscoverModels(providerId: string) {
  const provider = providerDrafts.value[providerId];
  if (!provider) {
    return;
  }
  if (!provider.base_url.trim()) {
    setProviderMessage(providerId, t("settings.baseUrlRequired"));
    return;
  }

  try {
    discoveringProviderId.value = providerId;
    setProviderMessage(providerId, null);
    const result = await discoverModelProviderModels({
      provider_id: provider.provider_id,
      transport: provider.transport,
      base_url: provider.base_url,
      api_key: provider.api_key,
      auth_header: provider.auth_header,
      auth_scheme: provider.auth_scheme,
    });
    const discoveredModels = dedupeStrings(result.models);
    provider.discovered_models = discoveredModels;
    provider.selected_models = dedupeStrings([...provider.selected_models, ...discoveredModels]);
    alignDefaultModelsToProviderSelection();
    setProviderMessage(
      providerId,
      discoveredModels.length > 0
        ? t("settings.discoveredModelCount", { count: discoveredModels.length })
        : t("settings.noModelsDiscovered"),
    );
  } catch (discoverError) {
    setProviderMessage(
      providerId,
      t("settings.providerDiscoveryFailed", {
        error: discoverError instanceof Error ? discoverError.message : "",
      }),
    );
  } finally {
    discoveringProviderId.value = null;
  }
}

async function handleSave() {
  if (!draft.value || configuredModelOptions.value.length === 0) {
    return;
  }
  try {
    isSaving.value = true;
    saveMessage.value = null;
    alignDefaultModelsToProviderSelection();
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
      model_providers: buildProviderSavePayload(providerDrafts.value),
    });
    draft.value = buildDraftFromSettings(settings.value);
    providerDraft.value = buildProviderDraftFromSettings(settings.value);
    providerDrafts.value = buildProviderDraftsFromSettings(settings.value);
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

.settings-page__panel input:disabled {
  color: rgba(60, 41, 20, 0.58);
  background: rgba(255, 248, 240, 0.58);
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

.settings-page__provider-url {
  font-family: var(--graphite-font-mono);
  font-size: 0.84rem;
}

.settings-page__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.settings-page__provider-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.settings-page__add-provider {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-top: 14px;
}

.settings-page__provider-editor-list {
  display: grid;
  margin-top: 16px;
}

.settings-page__provider-editor {
  border-top: 1px solid rgba(154, 52, 18, 0.12);
  padding: 16px 0;
}

.settings-page__provider-editor:first-child {
  border-top: 0;
}

.settings-page__provider-editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.settings-page__provider-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 14px;
}

.settings-page__toggle {
  display: inline-flex !important;
  grid-template-columns: none !important;
  align-items: center;
  min-height: 42px;
  margin-top: 0 !important;
  white-space: nowrap;
}

.settings-page__toggle input {
  min-height: auto;
  width: 18px;
  height: 18px;
  padding: 0;
}

.settings-page__button {
  border: 1px solid rgba(154, 52, 18, 0.2);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
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

.settings-page__provider-message,
.settings-page__provider-status {
  color: rgba(60, 41, 20, 0.72);
  font-size: 0.86rem;
}

.settings-page__provider-status {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  white-space: nowrap;
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

.settings-page__providers {
  display: grid;
  gap: 12px;
}

.settings-page__provider-card {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.64);
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
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
  font-family: var(--graphite-font-mono);
  font-size: 0.84rem;
}

@media (max-width: 1100px) {
  .settings-page__grid {
    grid-template-columns: 1fr;
  }

  .settings-page__panel--wide {
    grid-column: auto;
  }

  .settings-page__add-provider,
  .settings-page__provider-fields {
    grid-template-columns: 1fr;
  }

  .settings-page__provider-editor-header {
    display: grid;
  }
}
</style>

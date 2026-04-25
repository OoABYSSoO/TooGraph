<template>
  <AppShell>
    <section class="model-providers-page">
      <header class="model-providers-page__hero">
        <div class="model-providers-page__eyebrow">{{ t("settings.modelProvidersEyebrow") }}</div>
        <h2 class="model-providers-page__title">{{ t("settings.modelProvidersTitle") }}</h2>
        <p class="model-providers-page__body">{{ t("settings.modelProvidersBody") }}</p>
      </header>

      <div v-if="error" class="model-providers-page__empty">{{ t("common.failedToLoad", { error }) }}</div>
      <div v-else-if="!settings || !draft" class="model-providers-page__empty">{{ t("common.loadingSettings") }}</div>
      <template v-else>
        <article v-if="codexProvider" class="model-providers-page__panel model-providers-page__panel--primary codex-login-card">
          <div class="model-providers-page__codex-main">
            <div>
              <div class="model-providers-page__eyebrow">{{ t("settings.codexLoginStatus") }}</div>
              <h3>{{ codexProvider.auth_status?.authenticated ? t("settings.codexLoggedInTitle") : t("settings.codexLogin") }}</h3>
              <p>{{ codexProvider.auth_status?.authenticated ? t("settings.codexLoggedInHelp") : t("settings.codexLoginHelp") }}</p>
              <div class="model-providers-page__badges">
                <span>{{ codexProvider.provider_id }}</span>
                <span>{{ codexProvider.transport }}</span>
                <span>{{ codexStatusLabel }}</span>
              </div>
            </div>
            <div class="model-providers-page__codex-actions">
              <button
                v-if="!codexProvider.auth_status?.authenticated"
                type="button"
                class="model-providers-page__button model-providers-page__button--primary"
                :disabled="codexAuthBusy || Boolean(codexLoginSession)"
                @click="handleStartCodexLogin"
              >
                {{
                  codexLoginSession
                    ? t("settings.codexLoginWaiting")
                    : codexAuthBusy
                      ? t("settings.codexChecking")
                      : t("settings.codexLogin")
                }}
              </button>
              <div v-else class="model-providers-page__connected-state" role="status">
                <ElIcon aria-hidden="true"><CircleCheck /></ElIcon>
                <span>{{ t("settings.codexLoggedIn") }}</span>
              </div>
              <button
                v-if="codexProvider.auth_status?.configured"
                type="button"
                class="model-providers-page__button"
                :disabled="codexAuthBusy"
                @click="handleLogoutCodex"
              >
                {{ t("settings.codexLogout") }}
              </button>
            </div>
          </div>

          <div v-if="codexLoginSession" class="model-providers-page__login-progress" role="status">
            <div class="model-providers-page__login-progress-heading">
              <span class="model-providers-page__spinner" aria-hidden="true"></span>
              <div>
                <strong>{{ t("settings.codexLoginWaiting") }}</strong>
                <p>{{ t("settings.codexLoginWaitingBody") }}</p>
              </div>
            </div>
            <div class="model-providers-page__login-steps">
              <div class="model-providers-page__login-step">
                <span class="model-providers-page__step-index">1</span>
                <div>
                  <strong>{{ t("settings.codexOpenVerificationStep") }}</strong>
                  <p>{{ t("settings.codexOpenVerificationStepBody") }}</p>
                </div>
              </div>
              <div class="model-providers-page__login-step">
                <span class="model-providers-page__step-index">2</span>
                <div class="model-providers-page__device-code-content">
                  <strong>{{ t("settings.codexDeviceCodeStep") }}</strong>
                  <p>{{ t("settings.codexDeviceCodeStepBody") }}</p>
                  <div class="model-providers-page__device-code-row">
                    <span class="model-providers-page__device-code">{{ codexLoginSession.user_code }}</span>
                    <button
                      type="button"
                      class="model-providers-page__icon-button"
                      :aria-label="t('settings.codexCopyDeviceCode')"
                      :title="t('settings.codexCopyDeviceCode')"
                      @click="handleCopyCodexCode"
                    >
                      <ElIcon aria-hidden="true"><CopyDocument /></ElIcon>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="model-providers-page__login-progress-footer">
              <span>{{ t("settings.codexAutoDetectHint") }}</span>
              <button type="button" class="model-providers-page__button" :disabled="codexAuthBusy" @click="() => handlePollCodexLogin()">
                {{ t("settings.codexCheckLogin") }}
              </button>
            </div>
          </div>
          <details v-if="codexLoginSession" class="model-providers-page__fallback-login">
            <summary>{{ t("settings.codexFallbackLogin") }}</summary>
            <p>{{ t("settings.codexFallbackLoginHint") }}</p>
            <div class="model-providers-page__provider-actions model-providers-page__provider-actions--compact">
              <button type="button" class="model-providers-page__button" @click="() => handleOpenCodexVerification()">
                {{ t("settings.codexOpenVerification") }}
              </button>
              <button type="button" class="model-providers-page__button" @click="handleCopyCodexVerificationUrl">
                {{ t("settings.codexCopyVerificationUrl") }}
              </button>
            </div>
          </details>
          <div v-if="providerMessages['openai-codex']" class="model-providers-page__provider-message">
            {{ providerMessages["openai-codex"] }}
          </div>
        </article>
        <article v-else class="model-providers-page__panel codex-login-card">
          <h3>{{ t("settings.codexLogin") }}</h3>
          <p>{{ t("settings.codexProviderUnavailable") }}</p>
        </article>

        <section class="model-providers-page__grid">
          <article class="model-providers-page__panel">
            <h3>{{ t("settings.defaultRuntime") }}</h3>
            <label>
              <span>{{ t("settings.defaultModel") }}</span>
              <ElSelect
                v-model="draft.text_model_ref"
                class="model-providers-page__select graphite-select"
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
                class="model-providers-page__select graphite-select"
                :teleported="false"
                popper-class="graphite-select-popper"
              >
                <ElOption v-for="option in configuredModelOptions" :key="option.value" :label="option.label" :value="option.value" />
              </ElSelect>
            </label>
          </article>

          <article class="model-providers-page__panel">
            <h3>{{ t("settings.agentRuntime") }}</h3>
            <label>
              <span>{{ t("settings.defaultThinking") }}</span>
              <ElSelect
                v-model="thinkingMode"
                class="model-providers-page__select graphite-select"
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
            <div class="model-providers-page__hint">{{ t("settings.hint") }}</div>
          </article>

          <article class="model-providers-page__panel model-providers-page__panel--wide">
            <div class="model-providers-page__panel-heading">
              <div>
                <h3>{{ t("settings.modelProviders") }}</h3>
                <p>{{ t("settings.configuredProviders") }}</p>
              </div>
              <div class="model-providers-page__panel-toolbar">
                <span class="model-providers-page__provider-status">{{ configuredModelOptions.length }} {{ t("settings.availableModels") }}</span>
                <button type="button" class="model-providers-page__button model-providers-page__button--primary" @click="openAddProviderPanel">
                  {{ t("settings.addProvider") }}
                </button>
              </div>
            </div>

            <div class="model-providers-page__provider-cards">
              <article v-for="provider in providerCardList" :key="provider.provider_id" class="model-providers-page__provider-card">
                <div class="model-providers-page__provider-card-main">
                  <div>
                    <strong>{{ provider.label || provider.provider_id }}</strong>
                    <div class="model-providers-page__badges">
                      <span>{{ provider.provider_id }}</span>
                      <span>{{ provider.transport }}</span>
                      <span>{{ provider.enabled ? t("settings.enabledProvider") : t("settings.disabledProvider") }}</span>
                      <span v-if="provider.api_key_configured">{{ t("settings.apiKeyStored") }}</span>
                    </div>
                  </div>
                  <label class="model-providers-page__toggle">
                    <input v-model="provider.enabled" type="checkbox" @change="alignDefaultModelsToProviderSelection" />
                    <span>{{ provider.enabled ? t("common.on") : t("common.off") }}</span>
                  </label>
                </div>
                <div class="model-providers-page__provider-card-meta">
                  <span>{{ provider.selected_models.length }} {{ t("settings.availableModels") }}</span>
                  <span>{{ provider.base_url || t("settings.providerBaseUrlNotSet") }}</span>
                </div>
                <div class="model-providers-page__provider-actions">
                  <button type="button" class="model-providers-page__button" @click="openProviderEditor(provider.provider_id)">
                    {{ t("settings.configureProvider") }}
                  </button>
                  <button
                    type="button"
                    class="model-providers-page__button"
                    :disabled="discoveringProviderId === provider.provider_id || (isLoginProvider(provider) && !provider.auth_status?.authenticated)"
                    @click="handleDiscoverModels(provider.provider_id)"
                  >
                    {{ discoveringProviderId === provider.provider_id ? t("settings.discoveringModels") : t("settings.discoverModels") }}
                  </button>
                  <button
                    v-if="provider.provider_id !== 'local'"
                    type="button"
                    class="model-providers-page__button"
                    @click="handleRemoveProvider(provider.provider_id)"
                  >
                    {{ t("settings.removeProvider") }}
                  </button>
                </div>
                <span v-if="providerMessages[provider.provider_id]" class="model-providers-page__provider-message">
                  {{ providerMessages[provider.provider_id] }}
                </span>
              </article>
              <div v-if="providerCardList.length === 0" class="model-providers-page__provider-empty">
                {{ t("settings.noConfiguredProviders") }}
              </div>
            </div>

            <section v-if="providerEditorMode === 'add'" class="model-providers-page__provider-editor-panel">
              <div class="model-providers-page__provider-editor-header">
                <div>
                  <strong>{{ t("settings.addProvider") }}</strong>
                  <p>{{ t("settings.addProviderHelp") }}</p>
                </div>
                <button type="button" class="model-providers-page__button" @click="closeProviderEditorPanel">
                  {{ t("common.close") }}
                </button>
              </div>
              <label>
                <span>{{ t("settings.providerTemplate") }}</span>
                <ElSelect
                  v-model="pendingTemplateId"
                  class="model-providers-page__select graphite-select"
                  :teleported="false"
                  popper-class="graphite-select-popper"
                  :placeholder="t('settings.providerTemplate')"
                  @change="handlePendingTemplateChange"
                >
                  <ElOption
                    v-for="provider in addableProviderTemplates"
                    :key="provider.provider_id"
                    :label="provider.label"
                    :value="provider.provider_id"
                  />
                </ElSelect>
              </label>
              <p v-if="addableProviderTemplates.length === 0" class="model-providers-page__hint">{{ t("settings.noProviderTemplates") }}</p>
            </section>

            <section v-if="providerEditorDraft" class="model-providers-page__provider-editor-panel">
              <div class="model-providers-page__provider-editor-header">
                <div>
                  <strong>{{ providerEditorDraft.label || providerEditorDraft.provider_id }}</strong>
                  <div class="model-providers-page__badges">
                    <span>{{ providerEditorDraft.provider_id }}</span>
                    <span>{{ providerEditorDraft.transport }}</span>
                    <span>{{ providerEditorDraft.enabled ? t("settings.enabledProvider") : t("settings.disabledProvider") }}</span>
                    <span v-if="providerEditorDraft.api_key_configured">{{ t("settings.apiKeyStored") }}</span>
                  </div>
                </div>
                <label class="model-providers-page__toggle">
                  <input v-model="providerEditorDraft.enabled" type="checkbox" @change="alignDefaultModelsToProviderSelection" />
                  <span>{{ providerEditorDraft.enabled ? t("common.on") : t("common.off") }}</span>
                </label>
              </div>
                <div class="model-providers-page__provider-fields">
                  <label>
                    <span>{{ t("settings.providerLabel") }}</span>
                    <input v-model.trim="providerEditorDraft.label" type="text" />
                  </label>
                  <label v-if="showBaseUrlInPrimaryFields(providerEditorDraft)">
                    <span>{{ t("settings.providerBaseUrl") }}</span>
                    <input v-model.trim="providerEditorDraft.base_url" type="url" />
                  </label>
                  <label v-if="!isLoginProvider(providerEditorDraft)">
                    <span>{{ t("settings.providerApiKey") }}</span>
                    <input
                      v-model.trim="providerEditorDraft.api_key"
                      type="password"
                      autocomplete="off"
                      :placeholder="providerEditorDraft.api_key_configured ? t('settings.keepExistingApiKey') : t('settings.optionalApiKey')"
                    />
                  </label>
                  <div v-if="isLoginProvider(providerEditorDraft)" class="model-providers-page__login-panel">
                    <div class="model-providers-page__login-status">
                      <span>{{ t("settings.codexLoginStatus") }}</span>
                      <strong>{{ providerAuthStatusLabel(providerEditorDraft) }}</strong>
                    </div>
                  </div>
                  <label>
                    <span>{{ t("settings.enabledModels") }}</span>
                    <ElSelect
                      v-model="providerEditorDraft.selected_models"
                      class="model-providers-page__select graphite-select"
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
                        v-for="modelName in editorProviderModelOptions"
                        :key="`${providerEditorDraft.provider_id}-${modelName}`"
                        :label="modelName"
                        :value="modelName"
                      />
                    </ElSelect>
                  </label>
                </div>

                <details class="model-providers-page__advanced-provider">
                  <summary>{{ t("settings.advancedProviderSettings") }}</summary>
                  <div class="model-providers-page__provider-fields">
                    <template v-if="showBaseUrlInPrimaryFields(providerEditorDraft)"></template>
                    <label v-else>
                      <span>{{ t("settings.providerBaseUrl") }}</span>
                      <input v-model.trim="providerEditorDraft.base_url" type="url" :disabled="isLoginProvider(providerEditorDraft)" />
                    </label>
                    <label>
                      <span>{{ t("settings.providerId") }}</span>
                      <input :value="providerEditorDraft.provider_id" type="text" disabled />
                    </label>
                    <label>
                      <span>{{ t("settings.providerTransport") }}</span>
                      <ElSelect
                        v-model="providerEditorDraft.transport"
                        class="model-providers-page__select graphite-select"
                        :teleported="false"
                        popper-class="graphite-select-popper"
                        :disabled="isLoginProvider(providerEditorDraft)"
                      >
                        <ElOption label="OpenAI-compatible" value="openai-compatible" />
                        <ElOption label="Anthropic Messages" value="anthropic-messages" />
                        <ElOption label="Gemini generateContent" value="gemini-generate-content" />
                        <ElOption label="Codex Responses" value="codex-responses" />
                      </ElSelect>
                    </label>
                    <label v-if="!isLoginProvider(providerEditorDraft)">
                      <span>{{ t("settings.providerAuthHeader") }}</span>
                      <input v-model.trim="providerEditorDraft.auth_header" type="text" />
                    </label>
                    <label v-if="!isLoginProvider(providerEditorDraft)">
                      <span>{{ t("settings.providerAuthScheme") }}</span>
                      <input v-model.trim="providerEditorDraft.auth_scheme" type="text" />
                    </label>
                  </div>
                </details>

                <div class="model-providers-page__provider-actions">
                  <button
                    type="button"
                    class="model-providers-page__button model-providers-page__button--primary"
                    :disabled="discoveringProviderId === providerEditorDraft.provider_id || (isLoginProvider(providerEditorDraft) && !providerEditorDraft.auth_status?.authenticated)"
                    @click="handleDiscoverModels(providerEditorDraft.provider_id)"
                  >
                    {{ discoveringProviderId === providerEditorDraft.provider_id ? t("settings.discoveringModels") : t("settings.discoverModels") }}
                  </button>
                  <button
                    v-if="providerEditorMode === 'add'"
                    type="button"
                    class="model-providers-page__button"
                    @click="commitPendingProvider"
                  >
                    {{ t("settings.addProviderToList") }}
                  </button>
                  <button
                    v-if="providerEditorMode === 'edit' && providerEditorDraft.provider_id !== 'local'"
                    type="button"
                    class="model-providers-page__button"
                    @click="handleRemoveProvider(providerEditorDraft.provider_id)"
                  >
                    {{ t("settings.removeProvider") }}
                  </button>
                  <button type="button" class="model-providers-page__button" @click="closeProviderEditorPanel">
                    {{ t("common.close") }}
                  </button>
                  <span v-if="providerMessages[providerEditorDraft.provider_id]" class="model-providers-page__provider-message">
                    {{ providerMessages[providerEditorDraft.provider_id] }}
                  </span>
                </div>
            </section>
          </article>
        </section>

        <div class="model-providers-page__actions">
          <button type="button" class="model-providers-page__button model-providers-page__button--primary" :disabled="!canSave" @click="handleSave">
            {{ isSaving ? t("settings.saving") : t("settings.saveSettings") }}
          </button>
          <span v-if="saveMessage" class="model-providers-page__save-message">{{ saveMessage }}</span>
        </div>
      </template>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElIcon, ElMessage, ElOption, ElSelect } from "element-plus";
import { CircleCheck, CopyDocument } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import {
  discoverModelProviderModels,
  fetchOpenAICodexAuthStatus,
  fetchSettings,
  logoutOpenAICodexAuth,
  pollOpenAICodexAuth,
  startOpenAICodexAuth,
  updateSettings,
  type OpenAICodexAuthStartResponse,
} from "@/api/settings";
import AppShell from "@/layouts/AppShell.vue";
import type { SettingsModelProvider, SettingsPayload } from "@/types/settings";

import {
  buildProviderDraftsFromSettings,
  buildProviderSavePayload,
  clampSettingsTemperature,
  listAddableProviderTemplates,
  providerDraftsFingerprint,
  type ProviderDraft,
} from "./settingsPageModel.ts";

type SettingsDraft = {
  text_model_ref: string;
  video_model_ref: string;
  thinking_enabled: boolean;
  temperature: number;
};

const settings = ref<SettingsPayload | null>(null);
const draft = ref<SettingsDraft | null>(null);
const providerDrafts = ref<Record<string, ProviderDraft>>({});
const providerEditorMode = ref<"none" | "add" | "edit">("none");
const pendingTemplateId = ref("");
const pendingProviderDraft = ref<ProviderDraft | null>(null);
const editingProviderId = ref<string | null>(null);
const error = ref<string | null>(null);
const saveMessage = ref<string | null>(null);
const providerMessages = ref<Record<string, string>>({});
const isSaving = ref(false);
const discoveringProviderId = ref<string | null>(null);
const codexLoginSession = ref<OpenAICodexAuthStartResponse | null>(null);
const codexAuthBusy = ref(false);
let codexPollTimer: number | null = null;
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

function buildProviderDraftFromTemplate(provider: SettingsModelProvider): ProviderDraft {
  const modelNames = dedupeStrings(provider.models.map((model) => model.model));
  return {
    provider_id: provider.provider_id,
    label: provider.label,
    transport: provider.transport,
    base_url: provider.base_url,
    enabled: true,
    saved: Boolean(provider.saved),
    auth_header: provider.auth_header ?? "Authorization",
    auth_scheme: provider.auth_scheme ?? (provider.transport === "openai-compatible" ? "Bearer" : ""),
    auth_mode: provider.auth_mode ?? (provider.requires_login ? "chatgpt" : "api_key"),
    requires_login: Boolean(provider.requires_login),
    auth_status: provider.auth_status,
    api_key: "",
    api_key_configured: Boolean(provider.api_key_configured),
    discovered_models: modelNames,
    selected_models: modelNames,
  };
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
        (duplicateCount.get(baseLabel) ?? 0) > 1 && alias && alias !== baseLabel ? `${baseLabel} / ${alias}` : baseLabel;
      return [model.model_ref, label];
    }),
  ) as Record<string, string>;
}

const providerDraftList = computed(() =>
  Object.values(providerDrafts.value).sort((left, right) => {
    if (left.provider_id === "local") return -1;
    if (right.provider_id === "local") return 1;
    if (left.provider_id === "openai-codex") return -1;
    if (right.provider_id === "openai-codex") return 1;
    return left.label.localeCompare(right.label);
  }),
);
const providerCardList = computed(() =>
  providerDraftList.value.filter((provider) => provider.provider_id !== "openai-codex"),
);
const addableProviderTemplates = computed(() =>
  settings.value ? listAddableProviderTemplates(settings.value, providerDrafts.value) : [],
);
const providerEditorDraft = computed(() => {
  if (providerEditorMode.value === "add") {
    return pendingProviderDraft.value;
  }
  if (providerEditorMode.value === "edit" && editingProviderId.value) {
    return providerDrafts.value[editingProviderId.value] ?? null;
  }
  return null;
});
const editorProviderModelOptions = computed(() => {
  const provider = providerEditorDraft.value;
  if (!provider) {
    return [];
  }
  return dedupeStrings([...provider.discovered_models, ...provider.selected_models]);
});
const codexTemplate = computed(() => {
  const providers = settings.value?.model_catalog?.providers ?? [];
  const templates = settings.value?.model_catalog?.provider_templates ?? [];
  return providers.find((provider) => provider.provider_id === "openai-codex") ?? templates.find((provider) => provider.provider_id === "openai-codex") ?? null;
});
const codexProvider = computed(() => {
  const provider = providerDrafts.value["openai-codex"];
  if (provider) {
    return provider;
  }
  return codexTemplate.value ? buildProviderDraftFromTemplate(codexTemplate.value) : null;
});
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
const codexStatusLabel = computed(() => (codexProvider.value ? providerAuthStatusLabel(codexProvider.value) : t("settings.codexNotLoggedIn")));

function providerModelOptions(providerId: string) {
  const provider = providerDrafts.value[providerId];
  if (!provider) {
    return [];
  }
  return dedupeStrings([...provider.discovered_models, ...provider.selected_models]);
}

function isLoginProvider(provider: ProviderDraft) {
  return provider.requires_login || provider.auth_mode === "chatgpt";
}

function providerAuthStatusLabel(provider: ProviderDraft) {
  if (provider.auth_status?.authenticated) {
    return t("settings.codexLoggedIn");
  }
  if (provider.auth_status?.configured) {
    return t("settings.codexLoginExpired");
  }
  return t("settings.codexNotLoggedIn");
}

function ensureCodexProviderDraft() {
  const existing = providerDrafts.value["openai-codex"];
  if (existing) {
    return existing;
  }
  if (!codexTemplate.value) {
    return null;
  }
  const provider = buildProviderDraftFromTemplate(codexTemplate.value);
  providerDrafts.value = {
    ...providerDrafts.value,
    [provider.provider_id]: provider,
  };
  return provider;
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

async function loadSettings() {
  try {
    settings.value = await fetchSettings();
    draft.value = buildDraftFromSettings(settings.value);
    providerDrafts.value = buildProviderDraftsFromSettings(settings.value);
    error.value = null;
    await refreshCodexAuthStatus();
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : t("common.loadingSettings");
  }
}

function stopCodexAutoPoll() {
  if (codexPollTimer !== null) {
    window.clearInterval(codexPollTimer);
    codexPollTimer = null;
  }
}

function applyCodexAuthStatus(status: NonNullable<ProviderDraft["auth_status"]>) {
  const provider = status.configured || status.authenticated ? ensureCodexProviderDraft() : providerDrafts.value["openai-codex"];
  if (!provider) {
    return;
  }
  provider.auth_status = status;
  provider.api_key_configured = Boolean(status.configured);
  if (status.base_url) {
    provider.base_url = status.base_url;
  }
}

async function refreshCodexAuthStatus() {
  const status = await fetchOpenAICodexAuthStatus();
  applyCodexAuthStatus(status);
  return status;
}

function setProviderMessage(providerId: string, message: string | null) {
  providerMessages.value = {
    ...providerMessages.value,
    [providerId]: message ?? "",
  };
}

function openAddProviderPanel() {
  providerEditorMode.value = "add";
  editingProviderId.value = null;
  pendingTemplateId.value = "";
  pendingProviderDraft.value = null;
}

function openProviderEditor(providerId: string) {
  if (!providerDrafts.value[providerId]) {
    return;
  }
  providerEditorMode.value = "edit";
  editingProviderId.value = providerId;
  pendingTemplateId.value = "";
  pendingProviderDraft.value = null;
}

function closeProviderEditorPanel() {
  providerEditorMode.value = "none";
  editingProviderId.value = null;
  pendingTemplateId.value = "";
  pendingProviderDraft.value = null;
}

function handlePendingTemplateChange() {
  const template = addableProviderTemplates.value.find((provider) => provider.provider_id === pendingTemplateId.value);
  if (!template) {
    pendingProviderDraft.value = null;
    return;
  }
  pendingProviderDraft.value = buildProviderDraftFromTemplate(template);
}

function commitPendingProvider() {
  if (!pendingProviderDraft.value) {
    return;
  }
  const provider = pendingProviderDraft.value;
  providerDrafts.value = {
    ...providerDrafts.value,
    [provider.provider_id]: provider,
  };
  pendingProviderDraft.value = null;
  pendingTemplateId.value = "";
  providerEditorMode.value = "edit";
  editingProviderId.value = provider.provider_id;
  alignDefaultModelsToProviderSelection();
}

function handleRemoveProvider(providerId: string) {
  const nextDrafts = { ...providerDrafts.value };
  delete nextDrafts[providerId];
  providerDrafts.value = nextDrafts;
  if (editingProviderId.value === providerId || pendingProviderDraft.value?.provider_id === providerId) {
    closeProviderEditorPanel();
  }
  alignDefaultModelsToProviderSelection();
}

function showBaseUrlInPrimaryFields(provider: ProviderDraft | null) {
  if (!provider || isLoginProvider(provider)) {
    return false;
  }
  return (
    provider.provider_id === "local" ||
    provider.provider_id === "ollama" ||
    provider.provider_id === "lmstudio" ||
    provider.provider_id === "vllm" ||
    provider.provider_id === "sglang" ||
    provider.provider_id === "litellm" ||
    provider.provider_id.startsWith("custom")
  );
}

async function handleDiscoverModels(providerId: string) {
  const provider =
    providerDrafts.value[providerId] ??
    (pendingProviderDraft.value?.provider_id === providerId ? pendingProviderDraft.value : null);
  if (!provider) {
    return;
  }
  if (!provider.base_url.trim()) {
    setProviderMessage(providerId, t("settings.baseUrlRequired"));
    return;
  }
  if (isLoginProvider(provider) && !provider.auth_status?.authenticated) {
    setProviderMessage(providerId, t("settings.codexLoginRequired"));
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

function startCodexAutoPoll() {
  stopCodexAutoPoll();
  const intervalSeconds = Math.max(3, codexLoginSession.value?.interval ?? 5);
  codexPollTimer = window.setInterval(() => {
    void handlePollCodexLogin(false);
  }, intervalSeconds * 1000);
}

function openCodexVerificationWindow() {
  return window.open("about:blank", "_blank");
}

async function handleStartCodexLogin() {
  if (!ensureCodexProviderDraft()) {
    setProviderMessage("openai-codex", t("settings.codexProviderUnavailable"));
    return;
  }
  const authWindow = openCodexVerificationWindow();
  try {
    codexAuthBusy.value = true;
    setProviderMessage("openai-codex", null);
    codexLoginSession.value = await startOpenAICodexAuth();
    const verificationOpened = handleOpenCodexVerification(authWindow);
    startCodexAutoPoll();
    setProviderMessage(
      "openai-codex",
      t(verificationOpened ? "settings.codexLoginStarted" : "settings.codexPopupBlocked"),
    );
  } catch (authError) {
    if (authWindow && !authWindow.closed) {
      authWindow.close();
    }
    setProviderMessage(
      "openai-codex",
      t("settings.codexLoginFailed", { error: authError instanceof Error ? authError.message : "" }),
    );
  } finally {
    codexAuthBusy.value = false;
  }
}

async function handlePollCodexLogin(showPendingMessage = true) {
  if (!codexLoginSession.value) {
    await refreshCodexAuthStatus();
    return;
  }
  try {
    codexAuthBusy.value = true;
    const status = await pollOpenAICodexAuth({
      device_auth_id: codexLoginSession.value.device_auth_id,
      user_code: codexLoginSession.value.user_code,
    });
    if (status.authenticated) {
      stopCodexAutoPoll();
      codexLoginSession.value = null;
      applyCodexAuthStatus(status);
      setProviderMessage("openai-codex", t("settings.codexLoginComplete"));
      await handleDiscoverModels("openai-codex");
      await handleSave();
      return;
    }
    if (showPendingMessage) {
      setProviderMessage("openai-codex", t("settings.codexLoginPending"));
    }
  } catch (authError) {
    stopCodexAutoPoll();
    setProviderMessage(
      "openai-codex",
      t("settings.codexLoginFailed", { error: authError instanceof Error ? authError.message : "" }),
    );
  } finally {
    codexAuthBusy.value = false;
  }
}

function handleOpenCodexVerification(authWindow: Window | null = null) {
  if (!codexLoginSession.value?.verification_url) {
    if (authWindow && !authWindow.closed) {
      authWindow.close();
    }
    return false;
  }
  if (authWindow && !authWindow.closed) {
    try {
      authWindow.location.href = codexLoginSession.value.verification_url;
      return true;
    } catch {
      authWindow.close();
    }
  }
  const openedWindow = window.open(codexLoginSession.value.verification_url, "_blank", "noopener,noreferrer");
  return Boolean(openedWindow);
}

function showCodexToast(type: "success" | "error", message: string) {
  ElMessage({
    customClass: "model-providers-page__copy-toast",
    type,
    duration: 2600,
    grouping: true,
    placement: "top",
    showClose: false,
    message,
  });
}

async function handleCopyCodexVerificationUrl() {
  if (!codexLoginSession.value?.verification_url || !navigator.clipboard) {
    showCodexToast("error", t("settings.codexVerificationUrlCopyFailed"));
    return;
  }
  try {
    await navigator.clipboard.writeText(codexLoginSession.value.verification_url);
    showCodexToast("success", t("settings.codexVerificationUrlCopied"));
  } catch {
    showCodexToast("error", t("settings.codexVerificationUrlCopyFailed"));
  }
}

async function handleCopyCodexCode() {
  if (!codexLoginSession.value?.user_code || !navigator.clipboard) {
    showCodexToast("error", t("settings.codexCodeCopyFailed"));
    return;
  }
  try {
    await navigator.clipboard.writeText(codexLoginSession.value.user_code);
    showCodexToast("success", t("settings.codexCodeCopied"));
  } catch {
    showCodexToast("error", t("settings.codexCodeCopyFailed"));
  }
}

async function handleLogoutCodex() {
  try {
    codexAuthBusy.value = true;
    stopCodexAutoPoll();
    codexLoginSession.value = null;
    const status = await logoutOpenAICodexAuth();
    applyCodexAuthStatus(status);
    setProviderMessage("openai-codex", t("settings.codexLoggedOut"));
  } catch (authError) {
    setProviderMessage(
      "openai-codex",
      t("settings.codexLoginFailed", { error: authError instanceof Error ? authError.message : "" }),
    );
  } finally {
    codexAuthBusy.value = false;
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
onBeforeUnmount(stopCodexAutoPoll);
</script>

<style scoped>
.model-providers-page {
  display: grid;
  gap: 18px;
}

.model-providers-page__hero,
.model-providers-page__panel,
.model-providers-page__empty {
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-panel);
  box-shadow: var(--graphite-shadow-panel);
}

.model-providers-page__hero,
.model-providers-page__empty {
  padding: 24px;
}

.model-providers-page__panel {
  background: var(--graphite-surface-card);
  padding: 20px;
}

.model-providers-page__panel--primary {
  border-color: rgba(154, 52, 18, 0.24);
  background: linear-gradient(135deg, rgba(255, 248, 240, 0.98), rgba(255, 255, 255, 0.84));
}

.model-providers-page__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.model-providers-page__title {
  margin: 8px 0 10px;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 2rem;
}

.model-providers-page__body,
.model-providers-page__panel p,
.model-providers-page__hint,
.model-providers-page__empty {
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.model-providers-page__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.model-providers-page__panel h3 {
  margin: 0 0 12px;
}

.model-providers-page__panel--wide {
  grid-column: span 2;
}

.model-providers-page__codex-main,
.model-providers-page__panel-heading,
.model-providers-page__provider-card-main,
.model-providers-page__provider-editor-header,
.model-providers-page__login-status {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.model-providers-page__codex-actions,
.model-providers-page__actions,
.model-providers-page__provider-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.model-providers-page__provider-actions--compact {
  margin-top: 10px;
}

.model-providers-page__panel-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.model-providers-page__codex-actions {
  justify-content: flex-end;
}

.model-providers-page__connected-state {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  border: 1px solid rgba(22, 101, 52, 0.16);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(240, 253, 244, 0.9);
  color: rgb(22, 101, 52);
  font-weight: 650;
}

.model-providers-page__panel label {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  color: rgba(60, 41, 20, 0.72);
}

.model-providers-page__panel input {
  min-height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.82);
}

.model-providers-page__panel input:disabled {
  color: rgba(60, 41, 20, 0.58);
  background: rgba(255, 248, 240, 0.58);
}

.model-providers-page__select {
  width: 100%;
}

.model-providers-page__login-progress {
  display: grid;
  gap: 14px;
  margin-top: 16px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.64);
}

.model-providers-page__login-progress-heading,
.model-providers-page__login-progress-footer,
.model-providers-page__login-step,
.model-providers-page__device-code-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.model-providers-page__login-progress-heading {
  align-items: flex-start;
}

.model-providers-page__login-progress strong {
  color: var(--graphite-text-strong);
}

.model-providers-page__login-progress p,
.model-providers-page__login-step p,
.model-providers-page__fallback-login p {
  margin: 4px 0 0;
}

.model-providers-page__login-steps {
  display: grid;
  gap: 10px;
}

.model-providers-page__login-step {
  align-items: flex-start;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  padding: 12px;
  background: rgba(255, 248, 240, 0.42);
}

.model-providers-page__step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: rgb(154, 52, 18);
  color: rgb(255, 248, 240);
  font-family: var(--graphite-font-mono);
  font-size: 0.78rem;
  font-weight: 800;
}

.model-providers-page__device-code-content {
  display: grid;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.model-providers-page__device-code-row {
  justify-content: space-between;
  min-height: 50px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  padding: 8px 8px 8px 14px;
  background: rgba(255, 255, 255, 0.78);
}

.model-providers-page__device-code {
  min-width: 0;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-mono);
  font-size: 1.2rem;
  font-weight: 800;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.model-providers-page__login-progress-footer {
  justify-content: space-between;
  color: rgba(60, 41, 20, 0.72);
}

.model-providers-page__spinner {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(154, 52, 18, 0.18);
  border-top-color: rgb(154, 52, 18);
  border-radius: 999px;
  animation: model-provider-spin 900ms linear infinite;
}

.model-providers-page__fallback-login {
  margin-top: 10px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  padding: 10px 12px;
  color: rgba(60, 41, 20, 0.72);
  background: rgba(255, 248, 240, 0.48);
}

.model-providers-page__fallback-login summary {
  color: rgb(154, 52, 18);
  cursor: pointer;
  font-weight: 650;
}

.model-providers-page__provider-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.model-providers-page__provider-card,
.model-providers-page__provider-editor-panel,
.model-providers-page__provider-empty {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.62);
}

.model-providers-page__provider-card {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.model-providers-page__provider-card-main {
  gap: 12px;
}

.model-providers-page__provider-card-meta {
  display: grid;
  gap: 4px;
  color: rgba(60, 41, 20, 0.66);
  font-size: 0.86rem;
}

.model-providers-page__provider-card-meta span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.model-providers-page__provider-editor-panel,
.model-providers-page__provider-empty {
  margin-top: 14px;
  padding: 14px;
}

.model-providers-page__provider-empty {
  color: rgba(60, 41, 20, 0.72);
}

.model-providers-page__provider-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 14px;
}

.model-providers-page__advanced-provider {
  margin-top: 14px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(255, 248, 240, 0.42);
}

.model-providers-page__advanced-provider summary {
  color: rgb(154, 52, 18);
  cursor: pointer;
  font-weight: 650;
}

.model-providers-page__toggle {
  display: inline-flex !important;
  grid-template-columns: none !important;
  align-items: center;
  min-height: 42px;
  margin-top: 0 !important;
  white-space: nowrap;
}

.model-providers-page__toggle input {
  min-height: auto;
  width: 18px;
  height: 18px;
  padding: 0;
}

.model-providers-page__login-panel {
  grid-column: 1 / -1;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 248, 240, 0.58);
}

.model-providers-page__button {
  min-height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.2);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  cursor: pointer;
}

.model-providers-page__button--primary {
  background: rgb(154, 52, 18);
  color: rgb(255, 248, 240);
}

.model-providers-page__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.model-providers-page__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 12px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  cursor: pointer;
}

.model-providers-page__icon-button:hover {
  background: rgba(255, 237, 213, 0.96);
}

:global(.model-providers-page__copy-toast) {
  border-radius: 12px;
}

.model-providers-page__save-message,
.model-providers-page__provider-message,
.model-providers-page__provider-status {
  color: rgba(60, 41, 20, 0.72);
  font-size: 0.86rem;
}

.model-providers-page__provider-message {
  margin-top: 10px;
}

.model-providers-page__provider-status {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  white-space: nowrap;
}

.model-providers-page__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.model-providers-page__badges span {
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
  font-family: var(--graphite-font-mono);
  font-size: 0.84rem;
}

@media (max-width: 1100px) {
  .model-providers-page__grid {
    grid-template-columns: 1fr;
  }

  .model-providers-page__panel--wide {
    grid-column: auto;
  }

  .model-providers-page__codex-main,
  .model-providers-page__provider-card-main,
  .model-providers-page__provider-editor-header {
    display: grid;
  }

  .model-providers-page__codex-actions {
    justify-content: flex-start;
  }

  .model-providers-page__login-progress-footer,
  .model-providers-page__device-code-row {
    align-items: stretch;
  }

  .model-providers-page__login-progress-footer {
    flex-direction: column;
  }

  .model-providers-page__provider-cards,
  .model-providers-page__provider-fields {
    grid-template-columns: 1fr;
  }
}

@keyframes model-provider-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .model-providers-page__spinner {
    animation: none;
  }
}
</style>

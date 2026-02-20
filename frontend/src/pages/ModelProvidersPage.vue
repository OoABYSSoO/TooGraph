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
              <h3>{{ t("settings.codexLogin") }}</h3>
              <p>{{ t("settings.codexLoginHelp") }}</p>
              <div class="model-providers-page__badges">
                <span>{{ codexProvider.provider_id }}</span>
                <span>{{ codexProvider.transport }}</span>
                <span>{{ codexStatusLabel }}</span>
              </div>
            </div>
            <div class="model-providers-page__codex-actions">
              <button
                type="button"
                class="model-providers-page__button model-providers-page__button--primary"
                :disabled="codexAuthBusy"
                @click="handleStartCodexLogin"
              >
                {{ codexAuthBusy ? t("settings.codexChecking") : t("settings.codexLogin") }}
              </button>
              <button
                v-if="codexLoginSession"
                type="button"
                class="model-providers-page__button"
                :disabled="codexAuthBusy"
                @click="() => handlePollCodexLogin()"
              >
                {{ t("settings.codexCheckLogin") }}
              </button>
              <button
                v-if="codexLoginSession"
                type="button"
                class="model-providers-page__button"
                @click="handleOpenCodexVerification"
              >
                {{ t("settings.codexOpenVerification") }}
              </button>
              <button
                v-if="codexLoginSession"
                type="button"
                class="model-providers-page__button"
                @click="handleCopyCodexCode"
              >
                {{ t("settings.codexCopyCode") }}
              </button>
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

          <div v-if="codexLoginSession" class="model-providers-page__login-code">
            <label>
              <span>{{ t("settings.codexVerificationUrl") }}</span>
              <input :value="codexLoginSession.verification_url" type="text" readonly />
            </label>
            <label>
              <span>{{ t("settings.codexUserCode") }}</span>
              <input :value="codexLoginSession.user_code" type="text" readonly />
            </label>
          </div>
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
              <h3>{{ t("settings.modelProviders") }}</h3>
              <span class="model-providers-page__provider-status">{{ configuredModelOptions.length }} {{ t("settings.availableModels") }}</span>
            </div>
            <div class="model-providers-page__add-provider">
              <ElSelect
                v-model="selectedTemplateId"
                class="model-providers-page__select graphite-select"
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
                class="model-providers-page__button model-providers-page__button--primary"
                :disabled="!selectedTemplateId"
                @click="handleAddProvider"
              >
                {{ t("settings.addProvider") }}
              </button>
            </div>

            <div class="model-providers-page__provider-editor-list">
              <section v-for="provider in providerDraftList" :key="provider.provider_id" class="model-providers-page__provider-editor">
                <div class="model-providers-page__provider-editor-header">
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

                <div class="model-providers-page__provider-fields">
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
                      class="model-providers-page__select graphite-select"
                      :teleported="false"
                      popper-class="graphite-select-popper"
                      :disabled="isLoginProvider(provider)"
                    >
                      <ElOption label="OpenAI-compatible" value="openai-compatible" />
                      <ElOption label="Anthropic Messages" value="anthropic-messages" />
                      <ElOption label="Gemini generateContent" value="gemini-generate-content" />
                      <ElOption label="Codex Responses" value="codex-responses" />
                    </ElSelect>
                  </label>
                  <label>
                    <span>{{ t("settings.providerBaseUrl") }}</span>
                    <input v-model.trim="provider.base_url" type="url" :disabled="isLoginProvider(provider)" />
                  </label>
                  <label v-if="!isLoginProvider(provider)">
                    <span>{{ t("settings.providerApiKey") }}</span>
                    <input
                      v-model.trim="provider.api_key"
                      type="password"
                      autocomplete="off"
                      :placeholder="provider.api_key_configured ? t('settings.keepExistingApiKey') : t('settings.optionalApiKey')"
                    />
                  </label>
                  <label v-if="!isLoginProvider(provider)">
                    <span>{{ t("settings.providerAuthHeader") }}</span>
                    <input v-model.trim="provider.auth_header" type="text" />
                  </label>
                  <label v-if="!isLoginProvider(provider)">
                    <span>{{ t("settings.providerAuthScheme") }}</span>
                    <input v-model.trim="provider.auth_scheme" type="text" />
                  </label>
                  <div v-if="isLoginProvider(provider)" class="model-providers-page__login-panel">
                    <div class="model-providers-page__login-status">
                      <span>{{ t("settings.codexLoginStatus") }}</span>
                      <strong>{{ providerAuthStatusLabel(provider) }}</strong>
                    </div>
                  </div>
                  <label>
                    <span>{{ t("settings.enabledModels") }}</span>
                    <ElSelect
                      v-model="provider.selected_models"
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
                        v-for="modelName in providerModelOptions(provider.provider_id)"
                        :key="`${provider.provider_id}-${modelName}`"
                        :label="modelName"
                        :value="modelName"
                      />
                    </ElSelect>
                  </label>
                </div>

                <div class="model-providers-page__provider-actions">
                  <button
                    type="button"
                    class="model-providers-page__button model-providers-page__button--primary"
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
                  <span v-if="providerMessages[provider.provider_id]" class="model-providers-page__provider-message">
                    {{ providerMessages[provider.provider_id] }}
                  </span>
                </div>
              </section>
            </div>
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
import { ElOption, ElSelect } from "element-plus";
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
const selectedTemplateId = ref("");
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
const addableProviderTemplates = computed(() =>
  settings.value ? listAddableProviderTemplates(settings.value, providerDrafts.value) : [],
);
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

async function handleStartCodexLogin() {
  if (!ensureCodexProviderDraft()) {
    setProviderMessage("openai-codex", t("settings.codexProviderUnavailable"));
    return;
  }
  try {
    codexAuthBusy.value = true;
    setProviderMessage("openai-codex", null);
    codexLoginSession.value = await startOpenAICodexAuth();
    handleOpenCodexVerification();
    startCodexAutoPoll();
    setProviderMessage("openai-codex", t("settings.codexLoginStarted"));
  } catch (authError) {
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

function handleOpenCodexVerification() {
  if (!codexLoginSession.value?.verification_url) {
    return;
  }
  window.open(codexLoginSession.value.verification_url, "_blank", "noopener,noreferrer");
}

async function handleCopyCodexCode() {
  if (!codexLoginSession.value?.user_code || !navigator.clipboard) {
    return;
  }
  await navigator.clipboard.writeText(codexLoginSession.value.user_code);
  setProviderMessage("openai-codex", t("settings.codexCodeCopied"));
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

.model-providers-page__codex-actions {
  justify-content: flex-end;
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

.model-providers-page__login-code,
.model-providers-page__add-provider {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 0.36fr);
  gap: 12px;
  margin-top: 14px;
}

.model-providers-page__add-provider {
  grid-template-columns: minmax(0, 1fr) auto;
}

.model-providers-page__provider-editor-list {
  display: grid;
  margin-top: 16px;
}

.model-providers-page__provider-editor {
  border-top: 1px solid rgba(154, 52, 18, 0.12);
  padding: 16px 0;
}

.model-providers-page__provider-editor:first-child {
  border-top: 0;
}

.model-providers-page__provider-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 14px;
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
  .model-providers-page__provider-editor-header {
    display: grid;
  }

  .model-providers-page__codex-actions {
    justify-content: flex-start;
  }

  .model-providers-page__login-code,
  .model-providers-page__add-provider,
  .model-providers-page__provider-fields {
    grid-template-columns: 1fr;
  }
}
</style>

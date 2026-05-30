import type { SettingsModelProviderUpdate } from "../api/settings.ts";
import type {
  ModelProviderTransport,
  OpenAICodexAuthStatus,
  SettingsModelProvider,
  SettingsPayload,
  SettingsProviderCredential,
} from "../types/settings.ts";

const DEFAULT_AGENT_TEMPERATURE = 0.2;
const DEFAULT_PROVIDER_REQUEST_TIMEOUT_SECONDS = 180;
export const DEFAULT_MODEL_COMPRESSION_THRESHOLD = 0.9;
type SettingsProvider = SettingsModelProvider;

export type ProviderModelDraft = {
  model: string;
  context_window_ktokens: number | null;
  compression_threshold: number;
};

export type ProviderDraft = {
  provider_id: string;
  label: string;
  transport: ModelProviderTransport;
  base_url: string;
  enabled: boolean;
  saved?: boolean;
  auth_header: string;
  auth_scheme: string;
  auth_mode?: string;
  requires_login?: boolean;
  auth_status?: OpenAICodexAuthStatus;
  request_timeout_seconds?: number;
  credential_pool: SettingsProviderCredential[];
  api_key: string;
  api_key_configured: boolean;
  discovered_models: string[];
  selected_models: string[];
  model_settings: Record<string, ProviderModelDraft>;
};

export function dedupeStrings(values: string[]) {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of values) {
    const value = String(rawValue || "").trim();
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

export function clampSettingsTemperature(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_AGENT_TEMPERATURE;
  }
  return Math.min(2, Math.max(0, value));
}

export function clampProviderRequestTimeoutSeconds(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_PROVIDER_REQUEST_TIMEOUT_SECONDS;
  }
  return Math.min(3600, Math.max(1, Number(value)));
}

export function clampModelCompressionThreshold(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_MODEL_COMPRESSION_THRESHOLD;
  }
  return Math.min(1, Math.max(0.01, Number(value)));
}

export function normalizeContextWindowKTokens(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.round(Number(value));
  return normalized > 0 ? normalized : null;
}

function normalizeProviderCredentialPool(value: unknown): SettingsProviderCredential[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const credentials: SettingsProviderCredential[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Partial<SettingsProviderCredential>;
    const credentialId = String(record.credential_id || "").trim();
    if (!credentialId) {
      continue;
    }
    const identity = credentialId.toLowerCase();
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    const failureCount = Number(record.failure_count);
    credentials.push({
      credential_id: credentialId,
      status: String(record.status || "active").trim() || "active",
      cooldown_until: record.cooldown_until ? String(record.cooldown_until).trim() : null,
      failure_count: Number.isFinite(failureCount) ? Math.max(0, Math.trunc(failureCount)) : 0,
    });
  }
  return credentials;
}

function buildDefaultProviderModelDraft(model: string): ProviderModelDraft {
  return {
    model,
    context_window_ktokens: null,
    compression_threshold: DEFAULT_MODEL_COMPRESSION_THRESHOLD,
  };
}

function modelSettingsKey(model: string) {
  return String(model || "").trim().toLowerCase();
}

function buildProviderModelSettings(provider: SettingsProvider, selectedModels: string[]) {
  const settings: Record<string, ProviderModelDraft> = {};
  const sourceModels = [
    ...(provider.discovered_models ?? []),
    ...provider.models,
  ];
  for (const model of sourceModels) {
    const modelName = String(model.model || "").trim();
    if (!modelName) {
      continue;
    }
    const contextWindowTokens = Number(model.context_window);
    settings[modelName] = {
      model: modelName,
      context_window_ktokens: Number.isFinite(contextWindowTokens) && contextWindowTokens > 0
        ? Math.round(contextWindowTokens / 1000)
        : null,
      compression_threshold: clampModelCompressionThreshold(model.compression_threshold),
    };
  }
  for (const modelName of selectedModels) {
    if (!settings[modelName]) {
      settings[modelName] = buildDefaultProviderModelDraft(modelName);
    }
  }
  return settings;
}

export function ensureProviderModelDraft(provider: ProviderDraft, modelName: string): ProviderModelDraft {
  const normalizedModel = modelName.trim();
  if (!normalizedModel) {
    return buildDefaultProviderModelDraft("");
  }
  provider.model_settings = provider.model_settings ?? {};
  const existing = provider.model_settings[normalizedModel];
  if (existing) {
    return existing;
  }
  const matchingKey = Object.keys(provider.model_settings).find(
    (key) => modelSettingsKey(key) === modelSettingsKey(normalizedModel),
  );
  if (matchingKey) {
    const matched = provider.model_settings[matchingKey];
    provider.model_settings[normalizedModel] = { ...matched, model: normalizedModel };
    return provider.model_settings[normalizedModel];
  }
  provider.model_settings[normalizedModel] = buildDefaultProviderModelDraft(normalizedModel);
  return provider.model_settings[normalizedModel];
}

export function listProviderModelBadges(
  provider: SettingsProvider,
  modelDisplayLookup: Record<string, string>,
) {
  if (provider.models.length > 0) {
    return provider.models.map((model) => modelDisplayLookup[model.model_ref] || model.model_ref);
  }
  return provider.example_model_refs;
}

export function buildProviderDraftsFromSettings(payload: SettingsPayload): Record<string, ProviderDraft> {
  const providers = payload.model_catalog?.providers ?? [];
  return Object.fromEntries(
    providers
      .filter((provider) => provider.configured || provider.saved || provider.provider_id === "local")
      .map((provider) => {
        const enabledModels = dedupeStrings(provider.models.map((model) => model.model));
        const discoveredModels = dedupeStrings(
          (provider.discovered_models && provider.discovered_models.length > 0 ? provider.discovered_models : provider.models).map(
            (model) => model.model,
          ),
        );
        const modelSettings = buildProviderModelSettings(provider, enabledModels);
        return [
          provider.provider_id,
          {
            provider_id: provider.provider_id,
            label: provider.label,
            transport: provider.transport,
            base_url: provider.base_url,
            enabled: provider.enabled,
            saved: Boolean(provider.saved),
            auth_header: provider.auth_header ?? "Authorization",
            auth_scheme: provider.auth_scheme ?? "Bearer",
            auth_mode: provider.auth_mode ?? (provider.requires_login ? "chatgpt" : "api_key"),
            requires_login: Boolean(provider.requires_login),
            auth_status: provider.auth_status,
            request_timeout_seconds: clampProviderRequestTimeoutSeconds(provider.request_timeout_seconds),
            credential_pool: normalizeProviderCredentialPool(provider.credential_pool),
            api_key: "",
            api_key_configured: Boolean(provider.api_key_configured),
            discovered_models: discoveredModels,
            selected_models: enabledModels,
            model_settings: modelSettings,
          },
        ];
      }),
  );
}

export function buildProviderSavePayload(drafts: Record<string, ProviderDraft>): Record<string, SettingsModelProviderUpdate> {
  return Object.fromEntries(
    Object.entries(drafts).map(([providerId, draft]) => [
      providerId,
      {
        label: draft.label,
        transport: draft.transport,
        base_url: draft.base_url,
        api_key: draft.requires_login ? undefined : draft.api_key.trim() || undefined,
        enabled: draft.enabled,
        auth_header: draft.auth_header,
        auth_scheme: draft.auth_scheme,
        auth_mode: draft.auth_mode ?? (draft.requires_login ? "chatgpt" : "api_key"),
        request_timeout_seconds: clampProviderRequestTimeoutSeconds(draft.request_timeout_seconds),
        credential_pool: normalizeProviderCredentialPool(draft.credential_pool),
        models: dedupeStrings(draft.selected_models).map((model) => {
          const modelSettings = ensureProviderModelDraft(draft, model);
          const contextWindowKTokens = normalizeContextWindowKTokens(modelSettings.context_window_ktokens);
          return {
            model,
            label: model,
            modalities: ["text"],
            context_window: contextWindowKTokens === null ? null : contextWindowKTokens * 1000,
            compression_threshold: clampModelCompressionThreshold(modelSettings.compression_threshold),
          };
        }),
      },
    ]),
  );
}

export function listAddableProviderTemplates(
  payload: SettingsPayload,
  drafts: Record<string, ProviderDraft>,
): SettingsModelProvider[] {
  const existing = new Set(Object.keys(drafts));
  return (payload.model_catalog?.provider_templates ?? []).filter((provider) => !existing.has(provider.provider_id));
}

export function providerDraftsFingerprint(drafts: Record<string, ProviderDraft>): string {
  return JSON.stringify(buildProviderSavePayload(drafts));
}

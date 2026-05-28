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
type SettingsProvider = SettingsModelProvider;
export const PROVIDER_MODEL_CAPABILITY_KEYS = [
  "chat",
  "structured_output",
  "tool_calling",
  "vision",
  "embedding",
  "rerank",
  "streaming",
  "reasoning",
  "prompt_cache",
] as const;
export type ProviderModelCapabilityKey = (typeof PROVIDER_MODEL_CAPABILITY_KEYS)[number];
export type ProviderModelProfile = {
  capabilities: Record<string, boolean>;
  permissions: string[];
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
  model_profiles?: Record<string, ProviderModelProfile>;
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

export function defaultCapabilitiesForModel(model?: { modalities?: string[]; reasoning?: boolean | null }) {
  const modalities = new Set((model?.modalities ?? []).map((modality) => String(modality || "").toLowerCase()));
  const capabilities: Record<string, boolean> = {
    chat: true,
    structured_output: true,
  };
  if ([...modalities].some((modality) => ["image", "images", "vision", "video", "multimodal"].includes(modality))) {
    capabilities.vision = true;
  }
  if (model?.reasoning) {
    capabilities.reasoning = true;
  }
  return capabilities;
}

export function normalizePermissionsForCapabilities(
  capabilities: Record<string, boolean>,
  existingPermissions: string[] = [],
) {
  const derived: string[] = [];
  const needsTextGeneration = [
    "chat",
    "structured_output",
    "tool_calling",
    "vision",
    "streaming",
    "reasoning",
  ].some((capability) => capabilities[capability]);
  if (needsTextGeneration) {
    derived.push("text_generation");
  }
  if (capabilities.embedding) {
    derived.push("embedding");
  }
  if (capabilities.rerank) {
    derived.push("rerank");
  }
  const knownDerived = new Set(["text_generation", "embedding", "rerank"]);
  const custom = existingPermissions.filter((permission) => !knownDerived.has(permission));
  return dedupeStrings([...derived, ...custom]);
}

function normalizeCapabilities(value: unknown, fallback: Record<string, boolean>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback };
  }
  const capabilities: Record<string, boolean> = {};
  for (const [key, flag] of Object.entries(value as Record<string, unknown>)) {
    const capabilityKey = key.trim();
    if (capabilityKey) {
      capabilities[capabilityKey] = Boolean(flag);
    }
  }
  return capabilities;
}

function normalizeModelProfile(model: {
  capabilities?: Record<string, boolean>;
  permissions?: string[];
  modalities?: string[];
  reasoning?: boolean | null;
}): ProviderModelProfile {
  const capabilities = normalizeCapabilities(model.capabilities, defaultCapabilitiesForModel(model));
  const existingPermissions = Array.isArray(model.permissions) ? dedupeStrings(model.permissions) : [];
  return {
    capabilities,
    permissions: existingPermissions.length > 0 ? existingPermissions : normalizePermissionsForCapabilities(capabilities),
  };
}

function modelProfileMap(models: Array<{
  model: string;
  capabilities?: Record<string, boolean>;
  permissions?: string[];
  modalities?: string[];
  reasoning?: boolean | null;
}>) {
  const profiles: Record<string, ProviderModelProfile> = {};
  for (const model of models) {
    const modelName = String(model.model || "").trim();
    if (!modelName) {
      continue;
    }
    profiles[modelName] = normalizeModelProfile(model);
  }
  return profiles;
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
        const profileModels = [
          ...provider.models,
          ...((provider.discovered_models && provider.discovered_models.length > 0 ? provider.discovered_models : []) ?? []),
        ];
        const discoveredModels = dedupeStrings(
          (provider.discovered_models && provider.discovered_models.length > 0 ? provider.discovered_models : provider.models).map(
            (model) => model.model,
          ),
        );
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
            model_profiles: modelProfileMap(profileModels),
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
          const profile = draft.model_profiles?.[model] ?? normalizeModelProfile({ modalities: ["text"] });
          return {
            model,
            label: model,
            modalities: ["text"],
            capabilities: profile.capabilities,
            permissions: profile.permissions,
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

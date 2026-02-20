import type { SettingsModelProviderUpdate } from "../api/settings.ts";
import type {
  ModelProviderTransport,
  OpenAICodexAuthStatus,
  SettingsModelProvider,
  SettingsPayload,
} from "../types/settings.ts";

const DEFAULT_AGENT_TEMPERATURE = 0.2;
type SettingsProvider = SettingsModelProvider;

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
  api_key: string;
  api_key_configured: boolean;
  discovered_models: string[];
  selected_models: string[];
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
      .map((provider) => [
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
          api_key: "",
          api_key_configured: Boolean(provider.api_key_configured),
          discovered_models: dedupeStrings(provider.models.map((model) => model.model)),
          selected_models: dedupeStrings(provider.models.map((model) => model.model)),
        },
      ]),
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
        models: dedupeStrings(draft.selected_models).map((model) => ({ model, label: model, modalities: ["text"] })),
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

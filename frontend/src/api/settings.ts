import type {
  AgentThinkingLevel,
  BuddyRuntimeSettings,
  ModelProviderTransport,
  OpenAICodexAuthStatus,
  ModelLogSettings,
  SettingsProviderCredential,
  SettingsProviderModel,
  SettingsProviderModelCapabilities,
  SettingsProviderModelEmbedding,
  SettingsPayload,
  StructuredOutputMode,
  UiPreferencesSettings,
} from "@/types/settings";

import { apiGet, apiPost } from "./http.ts";

export type SettingsModelProviderUpdate = {
  label?: string;
  transport: ModelProviderTransport;
  structured_output_mode?: StructuredOutputMode;
  base_url: string;
  api_key?: string;
  enabled: boolean;
  auth_header?: string;
  auth_scheme?: string;
  auth_mode?: string;
  request_timeout_seconds?: number;
  credential_pool?: SettingsProviderCredential[];
  models: Array<{
    model: string;
    label?: string;
    route_target?: string | null;
    reasoning?: boolean | null;
    modalities?: string[];
    capabilities?: SettingsProviderModelCapabilities;
    embedding?: SettingsProviderModelEmbedding;
    permissions?: string[];
    context_window?: number | null;
    max_tokens?: number | null;
    compression_threshold?: number | null;
  }>;
};

export type SettingsUpdatePayload = {
  model: {
    text_model_ref: string;
    video_model_ref: string;
    embedding_model_ref?: string;
  };
  agent_runtime_defaults: {
    model: string;
    thinking_enabled: boolean;
    thinking_level: AgentThinkingLevel;
    temperature: number;
  };
  model_providers?: Record<string, SettingsModelProviderUpdate>;
  buddy_runtime?: BuddyRuntimeSettings;
  model_logs?: ModelLogSettings;
  ui_preferences?: UiPreferencesSettings;
};

export async function fetchSettings(): Promise<SettingsPayload> {
  return apiGet<SettingsPayload>("/api/settings");
}

export async function updateSettings(payload: SettingsUpdatePayload): Promise<SettingsPayload> {
  return apiPost<SettingsPayload>("/api/settings", payload);
}

export async function fetchBuddyRuntimeSettings(): Promise<BuddyRuntimeSettings> {
  return apiGet<BuddyRuntimeSettings>("/api/settings/buddy-runtime");
}

export async function updateBuddyRuntimeSettings(payload: BuddyRuntimeSettings): Promise<BuddyRuntimeSettings> {
  return apiPost<BuddyRuntimeSettings>("/api/settings/buddy-runtime", payload);
}

export async function discoverModelProviderModels(payload: {
  provider_id?: string;
  transport?: ModelProviderTransport;
  base_url: string;
  api_key?: string;
  auth_header?: string;
  auth_scheme?: string;
  request_timeout_seconds?: number;
}): Promise<{ models: string[]; model_items?: Array<Partial<SettingsProviderModel> & { model: string }> }> {
  return apiPost<{ models: string[]; model_items?: Array<Partial<SettingsProviderModel> & { model: string }> }>(
    "/api/settings/model-providers/discover",
    payload,
  );
}

export type OpenAICodexAuthStartResponse = {
  verification_url: string;
  user_code: string;
  device_auth_id: string;
  expires_in?: number;
  interval?: number;
};

export type OpenAICodexBrowserAuthStartResponse = {
  authorization_url: string;
  callback_url: string;
  state: string;
  expires_in?: number;
  interval?: number;
};

export type OpenAICodexAuthPollPayload = {
  device_auth_id: string;
  user_code: string;
};

export type OpenAICodexBrowserAuthPollPayload = {
  state: string;
};

export type OpenAICodexAuthPollResponse = OpenAICodexAuthStatus & {
  status?: "pending" | "authenticated" | "failed" | "expired" | "missing" | "configured" | string;
  error?: string;
};

export async function startOpenAICodexAuth(): Promise<OpenAICodexAuthStartResponse> {
  return apiPost<OpenAICodexAuthStartResponse>("/api/settings/model-providers/openai-codex/auth/start", null);
}

export async function startOpenAICodexBrowserAuth(): Promise<OpenAICodexBrowserAuthStartResponse> {
  return apiPost<OpenAICodexBrowserAuthStartResponse>("/api/settings/model-providers/openai-codex/auth/browser/start", null);
}

export async function pollOpenAICodexAuth(payload: OpenAICodexAuthPollPayload): Promise<OpenAICodexAuthPollResponse> {
  return apiPost<OpenAICodexAuthPollResponse>("/api/settings/model-providers/openai-codex/auth/poll", payload);
}

export async function pollOpenAICodexBrowserAuth(payload: OpenAICodexBrowserAuthPollPayload): Promise<OpenAICodexAuthPollResponse> {
  return apiPost<OpenAICodexAuthPollResponse>("/api/settings/model-providers/openai-codex/auth/browser/poll", payload);
}

export async function importOpenAICodexCliAuth(): Promise<OpenAICodexAuthPollResponse> {
  return apiPost<OpenAICodexAuthPollResponse>("/api/settings/model-providers/openai-codex/auth/codex-cli/import", null);
}

export async function fetchOpenAICodexAuthStatus(): Promise<OpenAICodexAuthStatus> {
  return apiGet<OpenAICodexAuthStatus>("/api/settings/model-providers/openai-codex/auth/status");
}

export async function logoutOpenAICodexAuth(): Promise<OpenAICodexAuthStatus> {
  return apiPost<OpenAICodexAuthStatus>("/api/settings/model-providers/openai-codex/auth/logout", null);
}

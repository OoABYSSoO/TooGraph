import type { AgentThinkingLevel, ModelProviderTransport, OpenAICodexAuthStatus, SettingsPayload } from "@/types/settings";

import { apiGet, apiPost } from "./http.ts";

export type SettingsModelProviderUpdate = {
  label?: string;
  transport: ModelProviderTransport;
  base_url: string;
  api_key?: string;
  enabled: boolean;
  auth_header?: string;
  auth_scheme?: string;
  auth_mode?: string;
  models: Array<{
    model: string;
    label?: string;
    route_target?: string | null;
    reasoning?: boolean | null;
    modalities?: string[];
    context_window?: number | null;
    max_tokens?: number | null;
  }>;
};

export type SettingsUpdatePayload = {
  model: {
    text_model_ref: string;
    video_model_ref: string;
  };
  agent_runtime_defaults: {
    model: string;
    thinking_enabled: boolean;
    thinking_level: AgentThinkingLevel;
    temperature: number;
  };
  model_providers?: Record<string, SettingsModelProviderUpdate>;
};

export async function fetchSettings(): Promise<SettingsPayload> {
  return apiGet<SettingsPayload>("/api/settings");
}

export async function updateSettings(payload: SettingsUpdatePayload): Promise<SettingsPayload> {
  return apiPost<SettingsPayload>("/api/settings", payload);
}

export async function discoverModelProviderModels(payload: {
  provider_id?: string;
  transport?: ModelProviderTransport;
  base_url: string;
  api_key?: string;
  auth_header?: string;
  auth_scheme?: string;
}): Promise<{ models: string[] }> {
  return apiPost<{ models: string[] }>("/api/settings/model-providers/discover", payload);
}

export type OpenAICodexAuthStartResponse = {
  verification_url: string;
  user_code: string;
  device_auth_id: string;
  expires_in?: number;
  interval?: number;
};

export type OpenAICodexAuthPollPayload = {
  device_auth_id: string;
  user_code: string;
};

export type OpenAICodexAuthPollResponse = OpenAICodexAuthStatus & {
  status?: "pending" | "authenticated" | string;
};

export async function startOpenAICodexAuth(): Promise<OpenAICodexAuthStartResponse> {
  return apiPost<OpenAICodexAuthStartResponse>("/api/settings/model-providers/openai-codex/auth/start", null);
}

export async function pollOpenAICodexAuth(payload: OpenAICodexAuthPollPayload): Promise<OpenAICodexAuthPollResponse> {
  return apiPost<OpenAICodexAuthPollResponse>("/api/settings/model-providers/openai-codex/auth/poll", payload);
}

export async function fetchOpenAICodexAuthStatus(): Promise<OpenAICodexAuthStatus> {
  return apiGet<OpenAICodexAuthStatus>("/api/settings/model-providers/openai-codex/auth/status");
}

export async function logoutOpenAICodexAuth(): Promise<OpenAICodexAuthStatus> {
  return apiPost<OpenAICodexAuthStatus>("/api/settings/model-providers/openai-codex/auth/logout", null);
}

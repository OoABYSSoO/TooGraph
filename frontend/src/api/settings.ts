import type { ModelProviderTransport, SettingsPayload } from "@/types/settings";

import { apiGet, apiPost } from "./http.ts";

export type SettingsModelProviderUpdate = {
  label?: string;
  transport: ModelProviderTransport;
  base_url: string;
  api_key?: string;
  enabled: boolean;
  auth_header?: string;
  auth_scheme?: string;
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

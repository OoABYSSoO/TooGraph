import type { SettingsPayload } from "@/types/settings";

import { apiGet, apiPost } from "./http.ts";

export async function fetchSettings(): Promise<SettingsPayload> {
  return apiGet<SettingsPayload>("/api/settings");
}

export async function updateSettings(payload: {
  model: {
    text_model_ref: string;
    video_model_ref: string;
  };
  agent_runtime_defaults: {
    model: string;
    thinking_enabled: boolean;
    temperature: number;
  };
}): Promise<SettingsPayload> {
  return apiPost<SettingsPayload>("/api/settings", payload);
}

import type { SettingsPayload } from "@/types/settings";

import { apiGet } from "./http";

const API_BASE = "http://127.0.0.1:8765";

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

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

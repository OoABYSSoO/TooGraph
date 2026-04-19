import type { PresetDocument, PresetSaveResponse } from "@/types/node-system";

import { apiGet } from "./http";

const API_BASE = "http://127.0.0.1:8765";

export async function fetchPresets(): Promise<PresetDocument[]> {
  return apiGet<PresetDocument[]>("/api/presets");
}

export async function fetchPreset(presetId: string): Promise<PresetDocument> {
  return apiGet<PresetDocument>(`/api/presets/${presetId}`);
}

export async function savePreset(payload: {
  presetId: string;
  sourcePresetId: string | null;
  definition: PresetDocument["definition"];
}): Promise<PresetSaveResponse> {
  const response = await fetch(`${API_BASE}/api/presets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`POST /api/presets failed with status ${response.status}`);
  }
  return response.json() as Promise<PresetSaveResponse>;
}

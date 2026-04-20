import type { PresetDocument, PresetSaveResponse } from "@/types/node-system";

import { apiGet, apiPost } from "./http.ts";

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
  return apiPost("/api/presets", payload);
}

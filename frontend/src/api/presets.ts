import type { PresetDeleteResponse, PresetDocument, PresetSaveResponse } from "@/types/node-system";

import { apiDelete, apiGet, apiPost } from "./http.ts";

export async function fetchPresets(options: { includeDisabled?: boolean } = {}): Promise<PresetDocument[]> {
  if (options.includeDisabled) {
    return apiGet<PresetDocument[]>("/api/presets?include_disabled=true");
  }
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

export async function updatePresetStatus(presetId: string, status: PresetDocument["status"]): Promise<PresetDocument> {
  const action = status === "active" ? "enable" : "disable";
  return apiPost<PresetDocument>(`/api/presets/${presetId}/${action}`, null);
}

export async function deletePreset(presetId: string): Promise<PresetDeleteResponse> {
  return apiDelete<PresetDeleteResponse>(`/api/presets/${presetId}`);
}

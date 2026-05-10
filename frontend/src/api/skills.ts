import type { SkillCapabilityPolicies, SkillDefinition, SkillFileContentResponse, SkillFileTreeResponse } from "@/types/skills";

import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from "./http.ts";

export async function fetchSkillDefinitions(): Promise<SkillDefinition[]> {
  return apiGet<SkillDefinition[]>("/api/skills/definitions");
}

export async function fetchSkillCatalog(options: { includeDisabled?: boolean } = {}): Promise<SkillDefinition[]> {
  const includeDisabled = options.includeDisabled ?? true;
  return apiGet<SkillDefinition[]>(`/api/skills/catalog?include_disabled=${includeDisabled ? "true" : "false"}`);
}

export async function fetchSkillFiles(skillKey: string): Promise<SkillFileTreeResponse> {
  return apiGet<SkillFileTreeResponse>(`/api/skills/${skillKey}/files`);
}

export async function fetchSkillFileContent(skillKey: string, path: string): Promise<SkillFileContentResponse> {
  return apiGet<SkillFileContentResponse>(`/api/skills/${skillKey}/files/content?path=${encodeURIComponent(path)}`);
}

export async function importSkillUpload(files: File[], relativePaths: string[] = []): Promise<SkillDefinition> {
  const payload = new FormData();
  files.forEach((file) => {
    payload.append("files", file);
  });
  relativePaths.forEach((relativePath) => {
    payload.append("relativePaths", relativePath);
  });
  return apiPostForm<SkillDefinition>("/api/skills/imports/upload", payload);
}

export async function updateSkillStatus(skillKey: string, status: SkillDefinition["status"]): Promise<SkillDefinition> {
  const action = status === "active" ? "enable" : "disable";
  return apiPost<SkillDefinition>(`/api/skills/${skillKey}/${action}`, null);
}

export async function updateSkillCapabilityPolicy(
  skillKey: string,
  capabilityPolicy: SkillCapabilityPolicies,
): Promise<SkillDefinition> {
  return apiPatch<SkillDefinition>(`/api/skills/${skillKey}/settings`, { capabilityPolicy });
}

export async function deleteSkill(skillKey: string): Promise<{ skillKey: string; status: "deleted" }> {
  return apiDelete<{ skillKey: string; status: "deleted" }>(`/api/skills/${skillKey}`);
}

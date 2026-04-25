import type { SkillDefinition } from "@/types/skills";

import { apiDelete, apiGet, apiPost } from "./http.ts";

export async function fetchSkillDefinitions(): Promise<SkillDefinition[]> {
  return apiGet<SkillDefinition[]>("/api/skills/definitions");
}

export async function fetchSkillCatalog(options: { includeDisabled?: boolean } = {}): Promise<SkillDefinition[]> {
  const includeDisabled = options.includeDisabled ?? true;
  return apiGet<SkillDefinition[]>(`/api/skills/catalog?include_disabled=${includeDisabled ? "true" : "false"}`);
}

export async function importSkill(skillKey: string): Promise<SkillDefinition> {
  return apiPost<SkillDefinition>(`/api/skills/${skillKey}/import`, null);
}

export async function updateSkillStatus(skillKey: string, status: SkillDefinition["status"]): Promise<SkillDefinition> {
  const action = status === "active" ? "enable" : "disable";
  return apiPost<SkillDefinition>(`/api/skills/${skillKey}/${action}`, null);
}

export async function deleteSkill(skillKey: string): Promise<{ skillKey: string; status: "deleted" }> {
  return apiDelete<{ skillKey: string; status: "deleted" }>(`/api/skills/${skillKey}`);
}

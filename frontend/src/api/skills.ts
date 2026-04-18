import type { SkillDefinition } from "@/types/skills";

import { apiGet } from "./http.ts";

export async function fetchSkillDefinitions(): Promise<SkillDefinition[]> {
  return apiGet<SkillDefinition[]>("/api/skills/definitions");
}

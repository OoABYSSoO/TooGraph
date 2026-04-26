import type { SkillDefinition } from "../types/skills.ts";

export type SkillStatusFilter = "all" | "active" | "disabled";

export type SkillManagementFilters = {
  query: string;
  status: SkillStatusFilter;
};

export type SkillOverview = {
  total: number;
  active: number;
  visibleSkills: number;
};

export function buildSkillStatusOptions(): SkillStatusFilter[] {
  return ["all", "active", "disabled"];
}

export function filterSkillsForManagement(
  skills: SkillDefinition[],
  filters: SkillManagementFilters,
): SkillDefinition[] {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return skills.filter((skill) => {
    if (!matchesSkillStatus(skill, filters.status)) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return buildSkillSearchText(skill).includes(normalizedQuery);
  });
}

export function buildSkillOverview(skills: SkillDefinition[]): SkillOverview {
  return {
    total: skills.length,
    active: skills.filter((skill) => skill.status === "active").length,
    visibleSkills: skills.filter((skill) => skill.status === "active").length,
  };
}

function matchesSkillStatus(skill: SkillDefinition, filter: SkillStatusFilter): boolean {
  if (filter === "active") {
    return skill.status === "active";
  }
  if (filter === "disabled") {
    return skill.status === "disabled";
  }
  return true;
}

function buildSkillSearchText(skill: SkillDefinition): string {
  return [
    skill.skillKey,
    skill.name,
    skill.description,
    skill.llmInstruction,
    skill.version,
    skill.sourceScope,
    skill.sourcePath,
    skill.status,
    ...skill.permissions,
    ...(skill.stateInputSchema ?? []).map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
    ...skill.llmOutputSchema.map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
    ...skill.stateOutputSchema.map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
  ]
    .join(" ")
    .toLowerCase();
}

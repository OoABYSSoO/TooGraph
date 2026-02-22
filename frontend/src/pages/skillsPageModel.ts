import type { SkillDefinition } from "../types/skills.ts";

export type SkillStatusFilter = "all" | "active" | "agent" | "companion" | "runtime" | "attention";

export type SkillManagementFilters = {
  query: string;
  status: SkillStatusFilter;
};

export type SkillOverview = {
  total: number;
  active: number;
  agentSkills: number;
  companionSkills: number;
  runtimeReady: number;
  runtimeRegistered: number;
  needsAttention: number;
};

export function buildSkillStatusOptions(): SkillStatusFilter[] {
  return ["all", "active", "agent", "companion", "runtime", "attention"];
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
    agentSkills: skills.filter((skill) => skill.targets.includes("agent_node")).length,
    companionSkills: skills.filter((skill) => skill.targets.includes("companion")).length,
    runtimeReady: skills.filter((skill) => skill.runtimeReady).length,
    runtimeRegistered: skills.filter((skill) => skill.runtimeRegistered).length,
    needsAttention: skills.filter((skill) => skillNeedsAttention(skill)).length,
  };
}

function matchesSkillStatus(skill: SkillDefinition, filter: SkillStatusFilter): boolean {
  if (filter === "active") {
    return skill.status === "active";
  }
  if (filter === "runtime") {
    return skill.runtimeReady;
  }
  if (filter === "agent") {
    return skill.targets.includes("agent_node");
  }
  if (filter === "companion") {
    return skill.targets.includes("companion");
  }
  if (filter === "attention") {
    return skillNeedsAttention(skill);
  }
  return true;
}

function skillNeedsAttention(skill: SkillDefinition): boolean {
  return skill.status !== "active" || !skill.configured || !skill.healthy;
}

function buildSkillSearchText(skill: SkillDefinition): string {
  return [
    skill.skillKey,
    skill.label,
    skill.description,
    skill.version,
    skill.kind,
    skill.mode,
    skill.scope,
    skill.sourceFormat,
    skill.sourceScope,
    skill.sourcePath,
    skill.status,
    ...skill.targets,
    ...skill.permissions,
    ...skill.supportedValueTypes,
    ...skill.sideEffects,
    ...skill.inputSchema.map((field) => `${field.key} ${field.label} ${field.valueType} ${field.description}`),
    ...skill.outputSchema.map((field) => `${field.key} ${field.label} ${field.valueType} ${field.description}`),
    ...skill.compatibility.map((item) => `${item.target} ${item.status} ${item.summary} ${item.missingCapabilities.join(" ")}`),
  ]
    .join(" ")
    .toLowerCase();
}

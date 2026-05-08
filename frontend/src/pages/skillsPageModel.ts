import type { SkillCapabilityPolicy, SkillDefinition } from "../types/skills.ts";

export type SkillStatusFilter = "all" | "active" | "selectable" | "runtime" | "attention";

export type SkillManagementFilters = {
  query: string;
  status: SkillStatusFilter;
};

export type SkillOverview = {
  total: number;
  active: number;
  selectableSkills: number;
  runtimeReady: number;
  runtimeRegistered: number;
  needsAttention: number;
};

export function buildSkillStatusOptions(): SkillStatusFilter[] {
  return ["all", "active", "selectable", "runtime", "attention"];
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
    selectableSkills: skills.filter((skill) => skillIsSelectable(skill)).length,
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
  if (filter === "selectable") {
    return skillIsSelectable(skill);
  }
  if (filter === "attention") {
    return skillNeedsAttention(skill);
  }
  return true;
}

function skillNeedsAttention(skill: SkillDefinition): boolean {
  return skill.status !== "active" || skill.llmNodeEligibility !== "ready";
}

export function listSkillCapabilityPolicies(skill: SkillDefinition): Array<{ origin: string; policy: SkillCapabilityPolicy }> {
  return [
    { origin: "default", policy: skill.capabilityPolicy.default },
    ...Object.entries(skill.capabilityPolicy.origins).map(([origin, policy]) => ({ origin, policy })),
  ];
}

function skillIsSelectable(skill: SkillDefinition): boolean {
  return listSkillCapabilityPolicies(skill).some(({ policy }) => policy.selectable);
}

function buildSkillSearchText(skill: SkillDefinition): string {
  return [
    skill.skillKey,
    skill.name,
    skill.description,
    skill.llmInstruction,
    skill.version,
    `${skill.runtime.entrypoint} ${skill.runtime.type} runtime`,
    `${skill.runtime.type} runtime`,
    skill.runtime.entrypoint,
    skill.llmNodeEligibility,
    skill.sourceScope,
    skill.sourcePath,
    skill.status,
    ...listSkillCapabilityPolicies(skill).map(({ origin, policy }) =>
      [
        origin,
        policy.selectable ? "selectable capability" : "hidden",
        policy.requiresApproval ? "requires approval" : "no approval",
      ].join(" "),
    ),
    ...skill.permissions,
    ...skill.llmNodeBlockers,
    ...skill.inputSchema.map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
    ...skill.outputSchema.map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
  ]
    .join(" ")
    .toLowerCase();
}

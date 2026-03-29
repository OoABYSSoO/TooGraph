import type { SkillDefinition, SkillRunPolicy } from "../types/skills.ts";

export type SkillStatusFilter = "all" | "active" | "discoverable" | "autonomous" | "runtime" | "attention";

export type SkillManagementFilters = {
  query: string;
  status: SkillStatusFilter;
};

export type SkillOverview = {
  total: number;
  active: number;
  discoverableSkills: number;
  autoSelectableSkills: number;
  runtimeReady: number;
  runtimeRegistered: number;
  needsAttention: number;
};

export function buildSkillStatusOptions(): SkillStatusFilter[] {
  return ["all", "active", "discoverable", "autonomous", "runtime", "attention"];
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
    discoverableSkills: skills.filter((skill) => skillIsDiscoverable(skill)).length,
    autoSelectableSkills: skills.filter((skill) => skillIsAutoSelectable(skill)).length,
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
  if (filter === "discoverable") {
    return skillIsDiscoverable(skill);
  }
  if (filter === "autonomous") {
    return skillIsAutoSelectable(skill);
  }
  if (filter === "attention") {
    return skillNeedsAttention(skill);
  }
  return true;
}

function skillNeedsAttention(skill: SkillDefinition): boolean {
  return skill.status !== "active" || !skill.configured || !skill.healthy || skill.llmNodeEligibility !== "ready";
}

export function listSkillRunPolicies(skill: SkillDefinition): Array<{ origin: string; policy: SkillRunPolicy }> {
  return [
    { origin: "default", policy: skill.runPolicies.default },
    ...Object.entries(skill.runPolicies.origins).map(([origin, policy]) => ({ origin, policy })),
  ];
}

function skillIsDiscoverable(skill: SkillDefinition): boolean {
  return listSkillRunPolicies(skill).some(({ policy }) => policy.discoverable);
}

function skillIsAutoSelectable(skill: SkillDefinition): boolean {
  return listSkillRunPolicies(skill).some(({ policy }) => policy.autoSelectable);
}

function buildSkillSearchText(skill: SkillDefinition): string {
  return [
    skill.skillKey,
    skill.name,
    skill.description,
    skill.llmInstruction,
    skill.version,
    skill.kind,
    skill.mode,
    skill.scope,
    `${skill.runtime.entrypoint} ${skill.runtime.type} runtime`,
    `${skill.runtime.type} runtime`,
    skill.runtime.entrypoint,
    skill.health.type,
    skill.llmNodeEligibility,
    skill.sourceFormat,
    skill.sourceScope,
    skill.sourcePath,
    skill.status,
    ...listSkillRunPolicies(skill).map(({ origin, policy }) =>
      [
        origin,
        policy.discoverable ? "discoverable" : "hidden",
        policy.autoSelectable ? "auto selectable autonomous" : "manual",
        policy.requiresApproval ? "requires approval" : "no approval",
      ].join(" "),
    ),
    ...skill.permissions,
    ...skill.llmNodeBlockers,
    ...skill.supportedValueTypes,
    ...skill.sideEffects,
    ...skill.inputSchema.map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
    ...skill.outputSchema.map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
  ]
    .join(" ")
    .toLowerCase();
}

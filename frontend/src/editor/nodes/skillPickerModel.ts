import type { SkillDefinition } from "../../types/skills.ts";

export type AttachedSkillBadge = {
  skillKey: string;
  label: string;
  description: string;
};

export type AgentSkillPatch = {
  skills: string[];
};

export function listAttachableSkillDefinitions(skillDefinitions: SkillDefinition[], attachedSkillKeys: string[]) {
  const attached = new Set(attachedSkillKeys);
  return skillDefinitions.filter((definition) => !attached.has(definition.skillKey) && isAgentAttachableSkillDefinition(definition));
}

export function isAgentAttachableSkillDefinition(definition: SkillDefinition) {
  return (
    definition.status === "active" &&
    definition.agentNodeEligibility === "ready" &&
    definition.runtimeReady &&
    definition.runtimeRegistered &&
    definition.configured &&
    definition.healthy
  );
}

export function resolveAttachedSkillBadges(attachedSkillKeys: string[], skillDefinitions: SkillDefinition[]): AttachedSkillBadge[] {
  const skillDefinitionMap = new Map(skillDefinitions.map((definition) => [definition.skillKey, definition]));

  return attachedSkillKeys.map((skillKey) => {
    const definition = skillDefinitionMap.get(skillKey);
    return {
      skillKey,
      label: definition?.label ?? skillKey,
      description: definition?.description ?? "",
    };
  });
}

export function resolveAttachAgentSkillPatch(attachedSkillKeys: string[], skillKey: string): AgentSkillPatch | null {
  if (attachedSkillKeys.includes(skillKey)) {
    return null;
  }

  return { skills: [...attachedSkillKeys, skillKey] };
}

export function resolveRemoveAgentSkillPatch(attachedSkillKeys: string[], skillKey: string): AgentSkillPatch | null {
  if (!attachedSkillKeys.includes(skillKey)) {
    return null;
  }

  return { skills: attachedSkillKeys.filter((candidateKey) => candidateKey !== skillKey) };
}

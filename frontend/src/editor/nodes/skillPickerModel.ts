import type { SkillDefinition } from "../../types/skills.ts";
import type { AgentNode, AgentSkillInstructionBlock } from "../../types/node-system.ts";

export type AttachedSkillBadge = {
  skillKey: string;
  name: string;
  description: string;
};

export type AgentSkillPatch = Partial<Pick<AgentNode["config"], "skills" | "skillInstructionBlocks">>;

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
      name: definition?.name ?? skillKey,
      description: definition?.description ?? "",
    };
  });
}

export function resolveAttachAgentSkillPatch(
  attachedSkillKeys: string[],
  skillKey: string,
  skillDefinitions: SkillDefinition[],
  currentInstructionBlocks: Record<string, AgentSkillInstructionBlock> = {},
): AgentSkillPatch | null {
  if (attachedSkillKeys.includes(skillKey)) {
    return null;
  }

  const definition = skillDefinitions.find((candidate) => candidate.skillKey === skillKey);
  const instruction = definition?.agentInstruction?.trim() ?? "";
  const title = `${definition?.name?.trim() || skillKey} skill instruction`;
  return {
    skills: [...attachedSkillKeys, skillKey],
    skillInstructionBlocks: instruction
      ? {
          ...currentInstructionBlocks,
          [skillKey]: {
            skillKey,
            title,
            content: instruction,
            source: "skill.agentInstruction",
          },
        }
      : currentInstructionBlocks,
  };
}

export function resolveRemoveAgentSkillPatch(
  attachedSkillKeys: string[],
  skillKey: string,
  currentInstructionBlocks: Record<string, AgentSkillInstructionBlock> = {},
): AgentSkillPatch | null {
  if (!attachedSkillKeys.includes(skillKey)) {
    return null;
  }

  const nextInstructionBlocks = { ...currentInstructionBlocks };
  delete nextInstructionBlocks[skillKey];
  return {
    skills: attachedSkillKeys.filter((candidateKey) => candidateKey !== skillKey),
    skillInstructionBlocks: nextInstructionBlocks,
  };
}

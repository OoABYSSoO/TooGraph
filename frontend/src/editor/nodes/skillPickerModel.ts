import type { SkillDefinition } from "../../types/skills.ts";
import type { AgentNode, AgentSkillInstructionBlock } from "../../types/node-system.ts";

export type AgentSkillPatch = Partial<Pick<AgentNode["config"], "skillKey" | "skillInstructionBlocks">>;

export function listSelectableSkillDefinitions(skillDefinitions: SkillDefinition[]) {
  return skillDefinitions.filter(isAgentAttachableSkillDefinition);
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

export function resolveSelectAgentSkillPatch(
  currentSkillKey: string,
  skillKey: string,
  skillDefinitions: SkillDefinition[],
  currentInstructionBlocks: Record<string, AgentSkillInstructionBlock> = {},
): AgentSkillPatch | null {
  const normalizedSkillKey = skillKey.trim();
  const normalizedCurrentSkillKey = currentSkillKey.trim();
  if (normalizedSkillKey === normalizedCurrentSkillKey) {
    return null;
  }

  if (!normalizedSkillKey) {
    return !normalizedCurrentSkillKey && Object.keys(currentInstructionBlocks).length === 0
      ? null
      : {
          skillKey: "",
          skillInstructionBlocks: {},
        };
  }

  const definition = skillDefinitions.find((candidate) => candidate.skillKey === normalizedSkillKey);
  const instruction = definition?.agentInstruction?.trim() ?? "";
  const title = `${definition?.name?.trim() || normalizedSkillKey} skill instruction`;
  return {
    skillKey: normalizedSkillKey,
    skillInstructionBlocks: instruction
      ? {
          [normalizedSkillKey]: {
            skillKey: normalizedSkillKey,
            title,
            content: instruction,
            source: "skill.agentInstruction",
          },
        }
      : {},
  };
}

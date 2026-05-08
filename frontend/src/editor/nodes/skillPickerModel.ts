import type { AgentNode, AgentSkillInstructionBlock } from "../../types/node-system.ts";
import type { SkillDefinition } from "../../types/skills.ts";

export type AgentSkillPatch = Partial<Pick<AgentNode["config"], "skillKey" | "skillInstructionBlocks">>;

export function listSelectableSkillDefinitions(skillDefinitions: SkillDefinition[]) {
  return skillDefinitions.filter(isAgentAttachableSkillDefinition);
}

export function isAgentAttachableSkillDefinition(definition: SkillDefinition) {
  return (
    definition.status === "active" &&
    definition.llmNodeEligibility === "ready" &&
    definition.runtimeReady &&
    definition.runtimeRegistered
  );
}

export function resolveSelectAgentSkillPatch(
  currentSkillKey: string,
  skillKey: string,
  _skillDefinitions: SkillDefinition[],
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

  const currentOverride = currentInstructionBlocks[normalizedSkillKey];
  return {
    skillKey: normalizedSkillKey,
    skillInstructionBlocks:
      currentOverride?.source === "node.override" && currentOverride.content.trim()
        ? {
            [normalizedSkillKey]: {
              ...currentOverride,
              skillKey: normalizedSkillKey,
              source: "node.override",
            },
          }
        : {},
  };
}

export function resolveDisplayAgentSkillInstructionBlocks(
  skillKey: string,
  skillDefinitions: SkillDefinition[],
  currentInstructionBlocks: Record<string, AgentSkillInstructionBlock> = {},
): Record<string, AgentSkillInstructionBlock> {
  const normalizedSkillKey = skillKey.trim();
  if (!normalizedSkillKey) {
    return {};
  }
  const currentBlock = currentInstructionBlocks[normalizedSkillKey];
  const definition = skillDefinitions.find((candidate) => candidate.skillKey === normalizedSkillKey);
  if (currentBlock?.source === "node.override") {
    return {
      [normalizedSkillKey]: {
        ...currentBlock,
        skillKey: normalizedSkillKey,
        title: currentBlock.title.trim() || `${definition?.name?.trim() || normalizedSkillKey} skill instruction`,
        source: "node.override",
      },
    };
  }
  const instruction = definition?.llmInstruction?.trim() ?? "";
  if (!instruction) {
    return {};
  }
  return {
    [normalizedSkillKey]: {
      skillKey: normalizedSkillKey,
      title: currentBlock?.title?.trim() || `${definition?.name?.trim() || normalizedSkillKey} skill instruction`,
      content: instruction,
      source: "skill.llmInstruction",
    },
  };
}

export function resolveSkillInstructionOverridePatch(
  skillKey: string,
  content: string,
  skillDefinitions: SkillDefinition[],
  currentInstructionBlocks: Record<string, AgentSkillInstructionBlock> = {},
): Pick<AgentNode["config"], "skillInstructionBlocks"> | null {
  const normalizedSkillKey = skillKey.trim();
  if (!normalizedSkillKey) {
    return null;
  }
  const displayedBlocks = resolveDisplayAgentSkillInstructionBlocks(
    normalizedSkillKey,
    skillDefinitions,
    currentInstructionBlocks,
  );
  const currentBlock = currentInstructionBlocks[normalizedSkillKey] ?? displayedBlocks[normalizedSkillKey];
  if (!currentBlock) {
    return null;
  }
  return {
    skillInstructionBlocks: {
      ...currentInstructionBlocks,
      [normalizedSkillKey]: {
        ...currentBlock,
        skillKey: normalizedSkillKey,
        content,
        source: "node.override",
      },
    },
  };
}

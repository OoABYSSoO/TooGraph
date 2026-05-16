import type { AgentActionInstructionBlock, AgentNode } from "../../types/node-system.ts";
import type { SkillDefinition } from "../../types/skills.ts";

export type AgentSkillPatch = Partial<Pick<AgentNode["config"], "actionKey" | "actionInstructionBlocks">>;

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
  currentInstructionBlocks: Record<string, AgentActionInstructionBlock> = {},
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
          actionKey: "",
          actionInstructionBlocks: {},
        };
  }

  const currentOverride = currentInstructionBlocks[normalizedSkillKey];
  return {
    actionKey: normalizedSkillKey,
    actionInstructionBlocks:
      currentOverride?.source === "node.override" && currentOverride.content.trim()
        ? {
            [normalizedSkillKey]: {
              ...currentOverride,
              actionKey: normalizedSkillKey,
              source: "node.override",
            },
          }
        : {},
  };
}

export function resolveDisplayAgentSkillInstructionBlocks(
  skillKey: string,
  skillDefinitions: SkillDefinition[],
  currentInstructionBlocks: Record<string, AgentActionInstructionBlock> = {},
): Record<string, AgentActionInstructionBlock> {
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
        actionKey: normalizedSkillKey,
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
      actionKey: normalizedSkillKey,
      title: currentBlock?.title?.trim() || `${definition?.name?.trim() || normalizedSkillKey} skill instruction`,
      content: instruction,
      source: "action.llmInstruction",
    },
  };
}

export function resolveSkillInstructionOverridePatch(
  skillKey: string,
  content: string,
  skillDefinitions: SkillDefinition[],
  currentInstructionBlocks: Record<string, AgentActionInstructionBlock> = {},
): Pick<AgentNode["config"], "actionInstructionBlocks"> | null {
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
    actionInstructionBlocks: {
      ...currentInstructionBlocks,
      [normalizedSkillKey]: {
        ...currentBlock,
        actionKey: normalizedSkillKey,
        content,
        source: "node.override",
      },
    },
  };
}

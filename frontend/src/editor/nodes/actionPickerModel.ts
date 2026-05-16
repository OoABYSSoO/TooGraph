import type { AgentActionInstructionBlock, AgentNode } from "../../types/node-system.ts";
import type { ActionDefinition } from "../../types/actions.ts";

export type AgentActionPatch = Partial<Pick<AgentNode["config"], "actionKey" | "actionInstructionBlocks">>;

export function listSelectableActionDefinitions(actionDefinitions: ActionDefinition[]) {
  return actionDefinitions.filter(isAgentAttachableActionDefinition);
}

export function isAgentAttachableActionDefinition(definition: ActionDefinition) {
  return (
    definition.status === "active" &&
    definition.llmNodeEligibility === "ready" &&
    definition.runtimeReady &&
    definition.runtimeRegistered
  );
}

export function resolveSelectAgentActionPatch(
  currentActionKey: string,
  actionKey: string,
  _actionDefinitions: ActionDefinition[],
  currentInstructionBlocks: Record<string, AgentActionInstructionBlock> = {},
): AgentActionPatch | null {
  const normalizedActionKey = actionKey.trim();
  const normalizedCurrentActionKey = currentActionKey.trim();
  if (normalizedActionKey === normalizedCurrentActionKey) {
    return null;
  }

  if (!normalizedActionKey) {
    return !normalizedCurrentActionKey && Object.keys(currentInstructionBlocks).length === 0
      ? null
      : {
          actionKey: "",
          actionInstructionBlocks: {},
        };
  }

  const currentOverride = currentInstructionBlocks[normalizedActionKey];
  return {
    actionKey: normalizedActionKey,
    actionInstructionBlocks:
      currentOverride?.source === "node.override" && currentOverride.content.trim()
        ? {
            [normalizedActionKey]: {
              ...currentOverride,
              actionKey: normalizedActionKey,
              source: "node.override",
            },
          }
        : {},
  };
}

export function resolveDisplayAgentActionInstructionBlocks(
  actionKey: string,
  actionDefinitions: ActionDefinition[],
  currentInstructionBlocks: Record<string, AgentActionInstructionBlock> = {},
): Record<string, AgentActionInstructionBlock> {
  const normalizedActionKey = actionKey.trim();
  if (!normalizedActionKey) {
    return {};
  }
  const currentBlock = currentInstructionBlocks[normalizedActionKey];
  const definition = actionDefinitions.find((candidate) => candidate.actionKey === normalizedActionKey);
  if (currentBlock?.source === "node.override") {
    return {
      [normalizedActionKey]: {
        ...currentBlock,
        actionKey: normalizedActionKey,
        title: currentBlock.title.trim() || `${definition?.name?.trim() || normalizedActionKey} action instruction`,
        source: "node.override",
      },
    };
  }
  const instruction = definition?.llmInstruction?.trim() ?? "";
  if (!instruction) {
    return {};
  }
  return {
    [normalizedActionKey]: {
      actionKey: normalizedActionKey,
      title: currentBlock?.title?.trim() || `${definition?.name?.trim() || normalizedActionKey} action instruction`,
      content: instruction,
      source: "action.llmInstruction",
    },
  };
}

export function resolveActionInstructionOverridePatch(
  actionKey: string,
  content: string,
  actionDefinitions: ActionDefinition[],
  currentInstructionBlocks: Record<string, AgentActionInstructionBlock> = {},
): Pick<AgentNode["config"], "actionInstructionBlocks"> | null {
  const normalizedActionKey = actionKey.trim();
  if (!normalizedActionKey) {
    return null;
  }
  const displayedBlocks = resolveDisplayAgentActionInstructionBlocks(
    normalizedActionKey,
    actionDefinitions,
    currentInstructionBlocks,
  );
  const currentBlock = currentInstructionBlocks[normalizedActionKey] ?? displayedBlocks[normalizedActionKey];
  if (!currentBlock) {
    return null;
  }
  return {
    actionInstructionBlocks: {
      ...currentInstructionBlocks,
      [normalizedActionKey]: {
        ...currentBlock,
        actionKey: normalizedActionKey,
        content,
        source: "node.override",
      },
    },
  };
}

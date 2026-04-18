import type { SkillDefinition } from "../../types/skills.ts";

export type AttachedSkillBadge = {
  skillKey: string;
  label: string;
  description: string;
};

export function listAttachableSkillDefinitions(skillDefinitions: SkillDefinition[], attachedSkillKeys: string[]) {
  const attached = new Set(attachedSkillKeys);
  return skillDefinitions.filter((definition) => !attached.has(definition.skillKey));
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

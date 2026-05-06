import type { ConditionNode } from "../types/node-system.ts";

export const FIXED_CONDITION_BRANCHES = ["true", "false", "exhausted"] as const;
export const FIXED_CONDITION_BRANCH_MAPPING = {
  true: "true",
  false: "false",
} as const;
export const FIXED_CONDITION_LOOP_LIMIT = 5;

export type FixedConditionBranch = (typeof FIXED_CONDITION_BRANCHES)[number];

export function buildFixedConditionConfig(rule: ConditionNode["config"]["rule"]): ConditionNode["config"] {
  return {
    branches: [...FIXED_CONDITION_BRANCHES],
    loopLimit: FIXED_CONDITION_LOOP_LIMIT,
    branchMapping: { ...FIXED_CONDITION_BRANCH_MAPPING },
    rule,
  };
}

export function normalizeFixedConditionConfig(config: ConditionNode["config"]): ConditionNode["config"] {
  return buildFixedConditionConfig(config.rule);
}

export function isFixedConditionBranch(value: string): value is FixedConditionBranch {
  return FIXED_CONDITION_BRANCHES.includes(value as FixedConditionBranch);
}

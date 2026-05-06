import type { ConditionNode } from "../types/node-system.ts";

export const FIXED_CONDITION_BRANCHES = ["true", "false", "exhausted"] as const;
export const FIXED_CONDITION_BRANCH_MAPPING = {
  true: "true",
  false: "false",
} as const;
export const CONDITION_LOOP_LIMIT_MIN = 1;
export const CONDITION_LOOP_LIMIT_MAX = 10;
export const CONDITION_LOOP_LIMIT_DEFAULT = 5;

export type FixedConditionBranch = (typeof FIXED_CONDITION_BRANCHES)[number];

export function buildFixedConditionConfig(rule: ConditionNode["config"]["rule"]): ConditionNode["config"] {
  return {
    branches: [...FIXED_CONDITION_BRANCHES],
    loopLimit: CONDITION_LOOP_LIMIT_DEFAULT,
    branchMapping: { ...FIXED_CONDITION_BRANCH_MAPPING },
    rule,
  };
}

export function normalizeFixedConditionConfig(config: ConditionNode["config"]): ConditionNode["config"] {
  return {
    ...buildFixedConditionConfig(config.rule),
    loopLimit: normalizeConditionLoopLimit(config.loopLimit),
  };
}

export function isFixedConditionBranch(value: string): value is FixedConditionBranch {
  return FIXED_CONDITION_BRANCHES.includes(value as FixedConditionBranch);
}

export function normalizeConditionLoopLimit(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value) || value === -1) {
    return CONDITION_LOOP_LIMIT_DEFAULT;
  }

  const integerValue = Math.trunc(value);
  return Math.min(CONDITION_LOOP_LIMIT_MAX, Math.max(CONDITION_LOOP_LIMIT_MIN, integerValue));
}

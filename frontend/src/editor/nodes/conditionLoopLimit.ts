import {
  CONDITION_LOOP_LIMIT_DEFAULT,
  CONDITION_LOOP_LIMIT_MAX,
  CONDITION_LOOP_LIMIT_MIN,
  normalizeConditionLoopLimit,
} from "../../lib/condition-protocol.ts";

export { CONDITION_LOOP_LIMIT_DEFAULT, CONDITION_LOOP_LIMIT_MAX, CONDITION_LOOP_LIMIT_MIN };

export type ConditionLoopLimitPatch = {
  loopLimit: number;
};

export type ConditionLoopLimitPatchResult =
  | { kind: "patch"; patch: ConditionLoopLimitPatch }
  | { kind: "reset"; draftValue: string }
  | { kind: "noop" };

export { normalizeConditionLoopLimit };

export function resolveConditionLoopLimitDraft(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(normalizeConditionLoopLimit(value));
}

export function parseConditionLoopLimitDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const integerValue = Math.trunc(parsed);
  if (integerValue < CONDITION_LOOP_LIMIT_MIN) {
    return null;
  }

  return Math.min(CONDITION_LOOP_LIMIT_MAX, integerValue);
}

export function resolveConditionLoopLimitPatch(
  draftValue: string,
  currentLoopLimit: number | null | undefined,
): ConditionLoopLimitPatchResult {
  const nextLoopLimit = parseConditionLoopLimitDraft(draftValue);
  if (nextLoopLimit === null) {
    return { kind: "reset", draftValue: String(normalizeConditionLoopLimit(currentLoopLimit)) };
  }

  if (nextLoopLimit === currentLoopLimit) {
    return { kind: "noop" };
  }

  return { kind: "patch", patch: { loopLimit: nextLoopLimit } };
}

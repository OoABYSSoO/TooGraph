export const CONDITION_LOOP_LIMIT_MIN = 1;
export const CONDITION_LOOP_LIMIT_MAX = 10;
export const CONDITION_LOOP_LIMIT_DEFAULT = 5;

export function normalizeConditionLoopLimit(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value) || value === -1) {
    return CONDITION_LOOP_LIMIT_DEFAULT;
  }

  const integerValue = Math.trunc(value);
  return Math.min(CONDITION_LOOP_LIMIT_MAX, Math.max(CONDITION_LOOP_LIMIT_MIN, integerValue));
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

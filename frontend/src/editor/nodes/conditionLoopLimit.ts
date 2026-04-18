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
  if (integerValue === -1) {
    return -1;
  }
  if (integerValue < 1) {
    return null;
  }

  return integerValue;
}

const DEFAULT_CYCLE_MAX_ITERATIONS = 12;

function normalizePositiveInteger(value: unknown): number | null {
  const raw = typeof value === "string" ? value.trim() : value;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const integerValue = Math.trunc(parsed);
  if (integerValue < 1) {
    return null;
  }
  return integerValue;
}

export function resolveCycleMaxIterations(
  metadata: Record<string, unknown> | null | undefined,
  fallback = DEFAULT_CYCLE_MAX_ITERATIONS,
): number {
  const snakeCaseValue = normalizePositiveInteger(metadata?.cycle_max_iterations);
  if (snakeCaseValue) {
    return snakeCaseValue;
  }
  const camelCaseValue = normalizePositiveInteger(metadata?.cycleMaxIterations);
  if (camelCaseValue) {
    return camelCaseValue;
  }
  return fallback;
}

export function writeCycleMaxIterations(
  metadata: Record<string, unknown> | null | undefined,
  nextValue: number | null,
): Record<string, unknown> {
  const nextMetadata = { ...(metadata ?? {}) };
  delete nextMetadata.cycleMaxIterations;

  if (nextValue === null) {
    delete nextMetadata.cycle_max_iterations;
    return nextMetadata;
  }

  const normalizedValue = normalizePositiveInteger(nextValue);
  if (!normalizedValue) {
    delete nextMetadata.cycle_max_iterations;
    return nextMetadata;
  }

  nextMetadata.cycle_max_iterations = normalizedValue;
  return nextMetadata;
}

export type SmoothNumberDisplayState = {
  value: number;
  target: number;
  updatedAtMs: number;
};

export type SmoothNumberDisplayOptions = {
  initialValue?: number;
  timeConstantMs?: number;
  snapEpsilon?: number;
};

const DEFAULT_TIME_CONSTANT_MS = 180;
const DEFAULT_SNAP_EPSILON = 3;

export function advanceSmoothNumberDisplay(
  previous: SmoothNumberDisplayState | null | undefined,
  targetValue: number | null | undefined,
  nowMs: number,
  options: SmoothNumberDisplayOptions = {},
): SmoothNumberDisplayState {
  const target = normalizeNonNegativeNumber(targetValue);
  const updatedAtMs = normalizeNonNegativeNumber(nowMs);
  const snapEpsilon = resolveSnapEpsilon(options.snapEpsilon);

  if (!previous) {
    return {
      value: normalizeNonNegativeNumber(options.initialValue),
      target,
      updatedAtMs,
    };
  }

  if (target <= previous.value || Math.abs(target - previous.value) <= snapEpsilon) {
    return {
      value: target,
      target,
      updatedAtMs,
    };
  }

  const elapsedMs = Math.max(0, updatedAtMs - previous.updatedAtMs);
  const timeConstantMs = resolveTimeConstantMs(options.timeConstantMs);
  const easingAmount = 1 - Math.exp(-elapsedMs / timeConstantMs);
  const value = previous.value + (target - previous.value) * easingAmount;

  return {
    value: Math.min(target, value),
    target,
    updatedAtMs,
  };
}

export function isSmoothNumberDisplaySettled(
  state: SmoothNumberDisplayState | null | undefined,
  options: Pick<SmoothNumberDisplayOptions, "snapEpsilon"> = {},
) {
  if (!state) {
    return true;
  }
  return Math.abs(state.target - state.value) <= resolveSnapEpsilon(options.snapEpsilon);
}

function normalizeNonNegativeNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function resolveTimeConstantMs(value: unknown) {
  const numberValue = normalizeNonNegativeNumber(value);
  return numberValue > 0 ? numberValue : DEFAULT_TIME_CONSTANT_MS;
}

function resolveSnapEpsilon(value: unknown) {
  const numberValue = normalizeNonNegativeNumber(value);
  return numberValue > 0 ? numberValue : DEFAULT_SNAP_EPSILON;
}

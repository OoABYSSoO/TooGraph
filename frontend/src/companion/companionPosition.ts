export type CompanionPosition = {
  x: number;
  y: number;
};

export type CompanionSize = {
  width: number;
  height: number;
};

export type CompanionViewport = {
  width: number;
  height: number;
};

export const COMPANION_POSITION_STORAGE_KEY = "graphiteui:companion-position";
export const DEFAULT_COMPANION_SIZE: CompanionSize = { width: 96, height: 96 };
export const DEFAULT_COMPANION_MARGIN = 16;

export function clampCompanionPosition(
  position: CompanionPosition,
  viewport: CompanionViewport,
  size: CompanionSize = DEFAULT_COMPANION_SIZE,
  margin = DEFAULT_COMPANION_MARGIN,
): CompanionPosition {
  const minX = margin;
  const minY = margin;
  const maxX = Math.max(minX, viewport.width - size.width - margin);
  const maxY = Math.max(minY, viewport.height - size.height - margin);

  return {
    x: clamp(Math.round(position.x), minX, maxX),
    y: clamp(Math.round(position.y), minY, maxY),
  };
}

export function resolveDefaultCompanionPosition(
  viewport: CompanionViewport,
  size: CompanionSize = DEFAULT_COMPANION_SIZE,
  margin = DEFAULT_COMPANION_MARGIN,
): CompanionPosition {
  return clampCompanionPosition(
    {
      x: viewport.width - size.width - margin,
      y: viewport.height - size.height - margin,
    },
    viewport,
    size,
    margin,
  );
}

export function parseStoredCompanionPosition(value: string | null): CompanionPosition | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isPositionRecord(parsed)) {
      return null;
    }
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export function serializeCompanionPosition(position: CompanionPosition): string {
  return JSON.stringify({
    x: Math.round(position.x),
    y: Math.round(position.y),
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isPositionRecord(value: unknown): value is CompanionPosition {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as CompanionPosition).x === "number" &&
    Number.isFinite((value as CompanionPosition).x) &&
    typeof (value as CompanionPosition).y === "number" &&
    Number.isFinite((value as CompanionPosition).y)
  );
}

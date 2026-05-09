export type BuddyPosition = {
  x: number;
  y: number;
};

export type BuddySize = {
  width: number;
  height: number;
};

export type BuddyViewport = {
  width: number;
  height: number;
};

export const BUDDY_POSITION_STORAGE_KEY = "graphiteui:buddy-position";
export const DEFAULT_BUDDY_SIZE: BuddySize = { width: 96, height: 96 };
export const DEFAULT_BUDDY_MARGIN = 16;

export function clampBuddyPosition(
  position: BuddyPosition,
  viewport: BuddyViewport,
  size: BuddySize = DEFAULT_BUDDY_SIZE,
  margin = DEFAULT_BUDDY_MARGIN,
): BuddyPosition {
  const minX = margin;
  const minY = margin;
  const maxX = Math.max(minX, viewport.width - size.width - margin);
  const maxY = Math.max(minY, viewport.height - size.height - margin);

  return {
    x: clamp(Math.round(position.x), minX, maxX),
    y: clamp(Math.round(position.y), minY, maxY),
  };
}

export function resolveDefaultBuddyPosition(
  viewport: BuddyViewport,
  size: BuddySize = DEFAULT_BUDDY_SIZE,
  margin = DEFAULT_BUDDY_MARGIN,
): BuddyPosition {
  return clampBuddyPosition(
    {
      x: viewport.width - size.width - margin,
      y: viewport.height - size.height - margin,
    },
    viewport,
    size,
    margin,
  );
}

export function parseStoredBuddyPosition(value: string | null): BuddyPosition | null {
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

export function serializeBuddyPosition(position: BuddyPosition): string {
  return JSON.stringify({
    x: Math.round(position.x),
    y: Math.round(position.y),
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isPositionRecord(value: unknown): value is BuddyPosition {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as BuddyPosition).x === "number" &&
    Number.isFinite((value as BuddyPosition).x) &&
    typeof (value as BuddyPosition).y === "number" &&
    Number.isFinite((value as BuddyPosition).y)
  );
}

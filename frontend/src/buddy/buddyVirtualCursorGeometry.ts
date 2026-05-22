import {
  DEFAULT_BUDDY_MARGIN,
  DEFAULT_BUDDY_SIZE,
  clampBuddyPosition,
  type BuddyPosition,
  type BuddySize,
  type BuddyViewport,
} from "./buddyPosition.ts";

export const BUDDY_VIRTUAL_CURSOR_SIZE: BuddySize = { width: 42, height: 42 };
export const BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG = -36;
export const BUDDY_VIRTUAL_CURSOR_MIN_FLIGHT_DURATION_MS = 140;
export const BUDDY_VIRTUAL_CURSOR_MAX_FLIGHT_DURATION_MS = 6000;
export const BUDDY_VIRTUAL_CURSOR_MAX_ROTATE_TRANSITION_MS = 900;
const BUDDY_VIRTUAL_CURSOR_FOLLOW_TARGET_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width * 1.25;

export function resolveDefaultVirtualCursorPosition(currentViewport: BuddyViewport, buddyPosition: BuddyPosition): BuddyPosition {
  return clampBuddyPosition(
    {
      x: buddyPosition.x + DEFAULT_BUDDY_SIZE.width * 0.28,
      y: buddyPosition.y - BUDDY_VIRTUAL_CURSOR_SIZE.height * 0.22,
    },
    currentViewport,
    BUDDY_VIRTUAL_CURSOR_SIZE,
    DEFAULT_BUDDY_MARGIN,
  );
}

export function resolveVirtualCursorLaunchPosition(currentViewport: BuddyViewport, buddyPosition: BuddyPosition): BuddyPosition {
  const buddyCenter = resolveBoxCenter(buddyPosition, DEFAULT_BUDDY_SIZE);
  const horizontalDirection = buddyCenter.x > currentViewport.width / 2 ? -1 : 1;
  return clampBuddyPosition(
    {
      x: buddyCenter.x + horizontalDirection * DEFAULT_BUDDY_SIZE.width * 0.52 - BUDDY_VIRTUAL_CURSOR_SIZE.width / 2,
      y: buddyPosition.y - BUDDY_VIRTUAL_CURSOR_SIZE.height * 0.38,
    },
    currentViewport,
    BUDDY_VIRTUAL_CURSOR_SIZE,
    DEFAULT_BUDDY_MARGIN,
  );
}

export function resolveVirtualCursorPositionForClientPoint(point: BuddyPosition, currentViewport: BuddyViewport): BuddyPosition {
  return clampVirtualCursorFramePosition(
    {
      x: point.x - BUDDY_VIRTUAL_CURSOR_SIZE.width / 2,
      y: point.y - BUDDY_VIRTUAL_CURSOR_SIZE.height / 2,
    },
    currentViewport,
  );
}

export function clampVirtualCursorFramePosition(positionValue: BuddyPosition, currentViewport: BuddyViewport): BuddyPosition {
  const minX = DEFAULT_BUDDY_MARGIN;
  const minY = DEFAULT_BUDDY_MARGIN;
  const maxX = Math.max(minX, currentViewport.width - BUDDY_VIRTUAL_CURSOR_SIZE.width - DEFAULT_BUDDY_MARGIN);
  const maxY = Math.max(minY, currentViewport.height - BUDDY_VIRTUAL_CURSOR_SIZE.height - DEFAULT_BUDDY_MARGIN);
  return {
    x: clampNumber(positionValue.x, minX, maxX),
    y: clampNumber(positionValue.y, minY, maxY),
  };
}

export function interpolateBuddyPosition(fromPosition: BuddyPosition, toPosition: BuddyPosition, progress: number): BuddyPosition {
  return {
    x: fromPosition.x + (toPosition.x - fromPosition.x) * progress,
    y: fromPosition.y + (toPosition.y - fromPosition.y) * progress,
  };
}

export function resolveVirtualCursorFollowTargetDistancePx(maxDistancePx: number) {
  return Math.min(
    BUDDY_VIRTUAL_CURSOR_FOLLOW_TARGET_DISTANCE_PX,
    Math.max(BUDDY_VIRTUAL_CURSOR_SIZE.width * 0.38, maxDistancePx * 0.72),
  );
}

export function resolveVirtualCursorMoveDurationMs(fromPosition: BuddyPosition, toPosition: BuddyPosition, flightSpeedPxPerS: number) {
  const distance = Math.hypot(toPosition.x - fromPosition.x, toPosition.y - fromPosition.y);
  if (distance < 1) {
    return 0;
  }
  return clampNumber(
    distance * 1000 / flightSpeedPxPerS,
    BUDDY_VIRTUAL_CURSOR_MIN_FLIGHT_DURATION_MS,
    BUDDY_VIRTUAL_CURSOR_MAX_FLIGHT_DURATION_MS,
  );
}

export function resolveVirtualCursorRotateDurationMs(
  currentAngleDeg: number,
  targetAngleDeg: number,
  rotationSpeedDegPerS: number,
) {
  const nextAngleDeg = resolveContinuousVirtualCursorAngle(currentAngleDeg, targetAngleDeg);
  const deltaDeg = Math.abs(nextAngleDeg - currentAngleDeg);
  if (deltaDeg < 1) {
    return 0;
  }
  return clampNumber(
    deltaDeg * 1000 / rotationSpeedDegPerS,
    0,
    BUDDY_VIRTUAL_CURSOR_MAX_ROTATE_TRANSITION_MS,
  );
}

export function resolveContinuousVirtualCursorAngle(currentAngleDeg: number, targetAngleDeg: number) {
  const deltaDeg = ((((targetAngleDeg - currentAngleDeg + 180) % 360) + 360) % 360) - 180;
  return currentAngleDeg + deltaDeg;
}

export function resolveSmoothedVirtualCursorAngle(
  currentAngleDeg: number,
  targetAngleDeg: number,
  elapsedMs: number,
  rotationSpeedDegPerS: number,
) {
  const nextAngleDeg = resolveContinuousVirtualCursorAngle(currentAngleDeg, targetAngleDeg);
  const deltaDeg = nextAngleDeg - currentAngleDeg;
  const maxDeltaDeg = rotationSpeedDegPerS * elapsedMs / 1000;
  return currentAngleDeg + clampNumber(deltaDeg, -maxDeltaDeg, maxDeltaDeg);
}

export function resolveVirtualCursorFlightAngle(
  fromPosition: BuddyPosition,
  toPosition: BuddyPosition,
  restingAngleDeg = BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG,
): number {
  const deltaX = toPosition.x - fromPosition.x;
  const deltaY = toPosition.y - fromPosition.y;
  if (Math.hypot(deltaX, deltaY) < 1) {
    return restingAngleDeg;
  }
  return resolveVirtualCursorVectorAngle(deltaX, deltaY, restingAngleDeg);
}

export function resolveVirtualCursorVectorAngle(deltaX: number, deltaY: number, fallbackAngleDeg = BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG) {
  if (Math.hypot(deltaX, deltaY) < 0.001) {
    return fallbackAngleDeg;
  }
  return Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90;
}

export function resolveBoxCenter(positionValue: BuddyPosition, size: BuddySize) {
  return {
    x: positionValue.x + size.width / 2,
    y: positionValue.y + size.height / 2,
  };
}

export function resolveElementCenterPoint(element: HTMLElement): BuddyPosition {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

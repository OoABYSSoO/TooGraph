import { buildConnectorCurvePath } from "./connectionCurvePath.ts";

export type RouteEdgeWaypoint = {
  x: number;
  y: number;
};

export type RouteEdgePathInput = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourceOffset?: number;
  laneOffset?: number;
  cornerRadius?: number;
};

const DEFAULT_ROUTE_SOURCE_OFFSET = 28;
const DEFAULT_ROUTE_SOURCE_STEP = 18;

function roundCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeWaypoints(points: RouteEdgeWaypoint[]) {
  const deduped = points.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    const previous = points[index - 1];
    return previous.x !== point.x || previous.y !== point.y;
  });

  return deduped.filter((point, index, source) => {
    if (index === 0 || index === source.length - 1) {
      return true;
    }
    const previous = source[index - 1];
    const next = source[index + 1];
    const isCollinear =
      (previous.x === point.x && point.x === next.x) ||
      (previous.y === point.y && point.y === next.y);
    return !isCollinear;
  });
}

function buildRoundedOrthogonalPath(points: RouteEdgeWaypoint[], cornerRadius: number) {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    return `M ${roundCoordinate(points[0].x)} ${roundCoordinate(points[0].y)}`;
  }

  let path = `M ${roundCoordinate(points[0].x)} ${roundCoordinate(points[0].y)}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;

    const deltaInX = current.x - previous.x;
    const deltaInY = current.y - previous.y;
    const deltaOutX = next.x - current.x;
    const deltaOutY = next.y - current.y;
    const lengthIn = Math.abs(deltaInX) + Math.abs(deltaInY);
    const lengthOut = Math.abs(deltaOutX) + Math.abs(deltaOutY);
    const radius = Math.min(cornerRadius, lengthIn / 2, lengthOut / 2);

    if (radius <= 0) {
      path += ` L ${roundCoordinate(current.x)} ${roundCoordinate(current.y)}`;
      continue;
    }

    const beforeX = current.x - Math.sign(deltaInX) * radius;
    const beforeY = current.y - Math.sign(deltaInY) * radius;
    const afterX = current.x + Math.sign(deltaOutX) * radius;
    const afterY = current.y + Math.sign(deltaOutY) * radius;

    path += ` L ${roundCoordinate(beforeX)} ${roundCoordinate(beforeY)}`;
    path += ` Q ${roundCoordinate(current.x)} ${roundCoordinate(current.y)} ${roundCoordinate(afterX)} ${roundCoordinate(afterY)}`;
  }

  const last = points[points.length - 1]!;
  path += ` L ${roundCoordinate(last.x)} ${roundCoordinate(last.y)}`;
  return path;
}

export function resolveRouteEdgeSourceOffset(
  branchIndex: number,
  baseOffset = DEFAULT_ROUTE_SOURCE_OFFSET,
  step = DEFAULT_ROUTE_SOURCE_STEP,
) {
  return baseOffset + Math.max(0, branchIndex) * step;
}

export function buildRouteEdgeWaypoints({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceOffset = DEFAULT_ROUTE_SOURCE_OFFSET,
  laneOffset = 28,
}: RouteEdgePathInput): RouteEdgeWaypoint[] {
  const preferredLaneY = targetY - laneOffset;
  const laneY = Math.abs(targetY - sourceY) <= laneOffset ? sourceY : preferredLaneY;
  return normalizeWaypoints([
    { x: sourceX, y: sourceY },
    { x: sourceX + sourceOffset, y: sourceY },
    { x: sourceX + sourceOffset, y: laneY },
    { x: targetX, y: laneY },
    { x: targetX, y: targetY },
  ]);
}

export function buildRouteEdgePath({
  ...input
}: RouteEdgePathInput) {
  return buildConnectorCurvePath({
    sourceX: input.sourceX,
    sourceY: input.sourceY,
    targetX: input.targetX,
    targetY: input.targetY,
    sourceSide: "right",
    targetSide: "left",
    sourceOffset: input.sourceOffset,
    targetOffset: input.laneOffset ? input.laneOffset * 2.5 : undefined,
  });
}

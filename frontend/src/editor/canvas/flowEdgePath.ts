import { buildConnectorCurvePath } from "./connectionCurvePath.ts";

const UPSTREAM_HORIZONTAL_CLEARANCE = 72;
const UPSTREAM_TOP_CLEARANCE = 160;
const UPSTREAM_NODE_TOP_GUTTER = 48;
const UPSTREAM_CORNER_RADIUS = 18;

export type SequenceFlowPathInput = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourceNodeX?: number;
  sourceNodeY?: number;
  targetNodeX?: number;
  targetNodeY?: number;
};

export function buildSequenceFlowPath(input: SequenceFlowPathInput) {
  const sourceReferenceX = input.sourceNodeX ?? input.sourceX;
  const targetReferenceX = input.targetNodeX ?? input.targetX;

  if (targetReferenceX >= sourceReferenceX) {
    return buildConnectorCurvePath({
      sourceX: input.sourceX,
      sourceY: input.sourceY,
      targetX: input.targetX,
      targetY: input.targetY,
      sourceSide: "right",
      targetSide: "left",
    });
  }

  const topY = resolveUpstreamTopY(input);

  return buildRoundedOrthogonalPath(
    [
      { x: input.sourceX, y: input.sourceY },
      { x: input.sourceX + UPSTREAM_HORIZONTAL_CLEARANCE, y: input.sourceY },
      { x: input.sourceX + UPSTREAM_HORIZONTAL_CLEARANCE, y: topY },
      { x: input.targetX - UPSTREAM_HORIZONTAL_CLEARANCE, y: topY },
      { x: input.targetX - UPSTREAM_HORIZONTAL_CLEARANCE, y: input.targetY },
      { x: input.targetX, y: input.targetY },
    ],
    UPSTREAM_CORNER_RADIUS,
  );
}

function resolveUpstreamTopY(input: SequenceFlowPathInput) {
  if (input.sourceNodeY !== undefined && input.targetNodeY !== undefined) {
    return Math.min(input.sourceNodeY, input.targetNodeY) - UPSTREAM_NODE_TOP_GUTTER;
  }

  return Math.min(input.sourceY, input.targetY) - UPSTREAM_TOP_CLEARANCE;
}

function buildRoundedOrthogonalPath(points: Array<{ x: number; y: number }>, cornerRadius: number) {
  const dedupedPoints = dedupeConsecutivePoints(points);
  if (dedupedPoints.length === 0) {
    return "";
  }
  if (dedupedPoints.length === 1) {
    const point = dedupedPoints[0]!;
    return `M ${roundCoordinate(point.x)} ${roundCoordinate(point.y)}`;
  }

  const firstPoint = dedupedPoints[0]!;
  const lastPoint = dedupedPoints[dedupedPoints.length - 1]!;
  const segments = [`M ${roundCoordinate(firstPoint.x)} ${roundCoordinate(firstPoint.y)}`];

  for (let index = 1; index < dedupedPoints.length - 1; index += 1) {
    const previousPoint = dedupedPoints[index - 1]!;
    const currentPoint = dedupedPoints[index]!;
    const nextPoint = dedupedPoints[index + 1]!;
    const incomingX = currentPoint.x - previousPoint.x;
    const incomingY = currentPoint.y - previousPoint.y;
    const outgoingX = nextPoint.x - currentPoint.x;
    const outgoingY = nextPoint.y - currentPoint.y;
    const incomingLength = Math.abs(incomingX) + Math.abs(incomingY);
    const outgoingLength = Math.abs(outgoingX) + Math.abs(outgoingY);
    const radius = Math.min(cornerRadius, incomingLength / 2, outgoingLength / 2);

    if (radius <= 0 || (incomingX !== 0 && outgoingX !== 0) || (incomingY !== 0 && outgoingY !== 0)) {
      segments.push(`L ${roundCoordinate(currentPoint.x)} ${roundCoordinate(currentPoint.y)}`);
      continue;
    }

    const beforeCorner = {
      x: currentPoint.x - Math.sign(incomingX) * radius,
      y: currentPoint.y - Math.sign(incomingY) * radius,
    };
    const afterCorner = {
      x: currentPoint.x + Math.sign(outgoingX) * radius,
      y: currentPoint.y + Math.sign(outgoingY) * radius,
    };

    segments.push(`L ${roundCoordinate(beforeCorner.x)} ${roundCoordinate(beforeCorner.y)}`);
    segments.push(
      `Q ${roundCoordinate(currentPoint.x)} ${roundCoordinate(currentPoint.y)} ${roundCoordinate(afterCorner.x)} ${roundCoordinate(afterCorner.y)}`,
    );
  }

  segments.push(`L ${roundCoordinate(lastPoint.x)} ${roundCoordinate(lastPoint.y)}`);
  return segments.join(" ");
}

function dedupeConsecutivePoints(points: Array<{ x: number; y: number }>) {
  return points.filter((point, index) => {
    const previousPoint = points[index - 1];
    return !previousPoint || previousPoint.x !== point.x || previousPoint.y !== point.y;
  });
}

function roundCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

const FLOW_TERMINAL_OVERLAP = 28;
const FLOW_TERMINAL_STAGGER = FLOW_TERMINAL_OVERLAP / 2;
const FLOW_LANE_SPACING = 28;
const DOWNSTREAM_TIGHT_MIN_CONTROL = 12;
const DOWNSTREAM_CONTROL_MIN = 36;
const DOWNSTREAM_CONTROL_MAX = 180;
const DOWNSTREAM_CONTROL_RATIO = 0.32;
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
  sourceLaneIndex?: number;
  sourceLaneCount?: number;
  targetLaneIndex?: number;
  targetLaneCount?: number;
};

export function buildSequenceFlowPath(input: SequenceFlowPathInput) {
  const sourceLaneOffset = resolveLaneOffset(input.sourceLaneIndex, input.sourceLaneCount);
  const targetLaneOffset = resolveLaneOffset(input.targetLaneIndex, input.targetLaneCount);

  if (input.targetX > input.sourceX) {
    return buildLaneBezierPath(input, sourceLaneOffset, targetLaneOffset);
  }

  const topY = resolveUpstreamTopY(input, sourceLaneOffset, targetLaneOffset);
  const startLeadX = input.sourceX + FLOW_TERMINAL_OVERLAP;
  const sourceBranchX =
    input.sourceX +
    UPSTREAM_HORIZONTAL_CLEARANCE +
    resolveTerminalStagger(input.sourceLaneIndex, input.sourceLaneCount);
  const targetDropX = resolveReturnDropX(input, sourceBranchX);
  const endLeadX = input.targetX - FLOW_TERMINAL_OVERLAP;

  return buildRoundedOrthogonalPath(
    [
      { x: input.sourceX, y: input.sourceY },
      { x: startLeadX, y: input.sourceY },
      { x: sourceBranchX, y: input.sourceY },
      { x: sourceBranchX, y: topY },
      { x: targetDropX, y: topY },
      { x: targetDropX, y: input.targetY },
      { x: endLeadX, y: input.targetY },
      { x: input.targetX, y: input.targetY },
    ],
    UPSTREAM_CORNER_RADIUS,
  );
}

function buildLaneBezierPath(input: SequenceFlowPathInput, sourceLaneOffset: number, targetLaneOffset: number) {
  const directDistance = input.targetX - input.sourceX;
  if (directDistance <= FLOW_TERMINAL_OVERLAP * 2) {
    return buildTightBezierPath(input, sourceLaneOffset, targetLaneOffset);
  }

  const startLeadX = input.sourceX + FLOW_TERMINAL_OVERLAP;
  const endLeadX = input.targetX - FLOW_TERMINAL_OVERLAP;
  const laneDistance = endLeadX - startLeadX;

  const controlSpan = resolveDownstreamControlSpan(laneDistance);

  return [
    `M ${roundCoordinate(input.sourceX)} ${roundCoordinate(input.sourceY)}`,
    `L ${roundCoordinate(startLeadX)} ${roundCoordinate(input.sourceY)}`,
    `C ${roundCoordinate(startLeadX + controlSpan)} ${roundCoordinate(input.sourceY + sourceLaneOffset)} ${roundCoordinate(endLeadX - controlSpan)} ${roundCoordinate(input.targetY + targetLaneOffset)} ${roundCoordinate(endLeadX)} ${roundCoordinate(input.targetY)}`,
    `L ${roundCoordinate(input.targetX)} ${roundCoordinate(input.targetY)}`,
  ].join(" ");
}

function buildTightBezierPath(input: SequenceFlowPathInput, sourceLaneOffset: number, targetLaneOffset: number) {
  const controlSpan = Math.max((input.targetX - input.sourceX) / 2, DOWNSTREAM_TIGHT_MIN_CONTROL);

  return [
    `M ${roundCoordinate(input.sourceX)} ${roundCoordinate(input.sourceY)}`,
    `C ${roundCoordinate(input.sourceX + controlSpan)} ${roundCoordinate(input.sourceY + sourceLaneOffset)} ${roundCoordinate(input.targetX - controlSpan)} ${roundCoordinate(input.targetY + targetLaneOffset)} ${roundCoordinate(input.targetX)} ${roundCoordinate(input.targetY)}`,
  ].join(" ");
}

function resolveUpstreamTopY(input: SequenceFlowPathInput, sourceLaneOffset: number, targetLaneOffset: number) {
  if (input.sourceNodeY !== undefined && input.targetNodeY !== undefined) {
    return Math.min(input.sourceNodeY, input.targetNodeY) - UPSTREAM_NODE_TOP_GUTTER - sourceLaneOffset + targetLaneOffset;
  }

  return Math.min(input.sourceY, input.targetY) - UPSTREAM_TOP_CLEARANCE - sourceLaneOffset + targetLaneOffset;
}

function resolveLaneOffset(index?: number, count?: number) {
  if (index === undefined || count === undefined || count <= 1) {
    return 0;
  }

  return (index - (count - 1) / 2) * FLOW_LANE_SPACING;
}

function resolveTerminalStagger(index?: number, count?: number) {
  if (index === undefined || count === undefined || count <= 1) {
    return 0;
  }

  return index * FLOW_TERMINAL_STAGGER;
}

function resolveReturnDropX(input: SequenceFlowPathInput, sourceBranchX: number) {
  const targetDropX =
    input.targetX -
    UPSTREAM_HORIZONTAL_CLEARANCE -
    resolveTerminalStagger(input.targetLaneIndex, input.targetLaneCount);

  const targetNodeIsStillOnOrRightOfSource =
    input.sourceNodeX !== undefined && input.targetNodeX !== undefined && input.targetNodeX >= input.sourceNodeX;

  if (input.targetY > input.sourceY && targetNodeIsStillOnOrRightOfSource && targetDropX < sourceBranchX) {
    return sourceBranchX;
  }

  return targetDropX;
}

function resolveDownstreamControlSpan(distance: number) {
  return Math.min(
    Math.max(distance * DOWNSTREAM_CONTROL_RATIO, DOWNSTREAM_CONTROL_MIN),
    Math.min(DOWNSTREAM_CONTROL_MAX, distance / 2),
  );
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

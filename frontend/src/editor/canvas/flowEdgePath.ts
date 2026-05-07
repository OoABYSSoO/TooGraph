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
const LOWER_ROW_THRESHOLD = 120;

export type SequenceFlowPathConfig = {
  terminalOverlap: number;
  terminalStagger: number;
  laneSpacing: number;
  downstreamTightMinControl: number;
  downstreamControlMin: number;
  downstreamControlMax: number;
  downstreamControlRatio: number;
  upstreamHorizontalClearance: number;
  upstreamTopClearance: number;
  upstreamNodeTopGutter: number;
  upstreamCornerRadius: number;
  lowerRowThreshold: number;
};

export const DEFAULT_SEQUENCE_FLOW_PATH_CONFIG: SequenceFlowPathConfig = {
  terminalOverlap: FLOW_TERMINAL_OVERLAP,
  terminalStagger: FLOW_TERMINAL_STAGGER,
  laneSpacing: FLOW_LANE_SPACING,
  downstreamTightMinControl: DOWNSTREAM_TIGHT_MIN_CONTROL,
  downstreamControlMin: DOWNSTREAM_CONTROL_MIN,
  downstreamControlMax: DOWNSTREAM_CONTROL_MAX,
  downstreamControlRatio: DOWNSTREAM_CONTROL_RATIO,
  upstreamHorizontalClearance: UPSTREAM_HORIZONTAL_CLEARANCE,
  upstreamTopClearance: UPSTREAM_TOP_CLEARANCE,
  upstreamNodeTopGutter: UPSTREAM_NODE_TOP_GUTTER,
  upstreamCornerRadius: UPSTREAM_CORNER_RADIUS,
  lowerRowThreshold: LOWER_ROW_THRESHOLD,
};

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

export function buildSequenceFlowPath(input: SequenceFlowPathInput, config: SequenceFlowPathConfig = DEFAULT_SEQUENCE_FLOW_PATH_CONFIG) {
  const sourceLaneOffset = resolveLaneOffset(input.sourceLaneIndex, input.sourceLaneCount, config);
  const targetLaneOffset = resolveLaneOffset(input.targetLaneIndex, input.targetLaneCount, config);

  if (shouldUseVerticalDropPath(input, config)) {
    return buildVerticalDropPath(input, sourceLaneOffset, targetLaneOffset, config);
  }

  if (input.targetX > input.sourceX) {
    return buildLaneBezierPath(input, sourceLaneOffset, targetLaneOffset, config);
  }

  const topY = resolveUpstreamTopY(input, sourceLaneOffset, targetLaneOffset, config);
  const startLeadX = input.sourceX + config.terminalOverlap;
  const sourceBranchX =
    input.sourceX +
    config.upstreamHorizontalClearance +
    resolveTerminalStagger(input.sourceLaneIndex, input.sourceLaneCount, config);
  const targetDropX = resolveReturnDropX(input, sourceBranchX, config);
  const endLeadX = input.targetX - config.terminalOverlap;

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
    config.upstreamCornerRadius,
  );
}

export function buildSelfFeedbackFlowPath(input: SequenceFlowPathInput, config: SequenceFlowPathConfig = DEFAULT_SEQUENCE_FLOW_PATH_CONFIG) {
  const sourceLaneOffset = resolveLaneOffset(input.sourceLaneIndex, input.sourceLaneCount, config);
  const targetLaneOffset = resolveLaneOffset(input.targetLaneIndex, input.targetLaneCount, config);
  const topY = resolveUpstreamTopY(input, sourceLaneOffset, targetLaneOffset, config);
  const startLeadX = input.sourceX + config.terminalOverlap;
  const sourceBranchX =
    input.sourceX +
    config.upstreamHorizontalClearance +
    resolveTerminalStagger(input.sourceLaneIndex, input.sourceLaneCount, config);
  const targetDropX =
    input.targetX -
    config.upstreamHorizontalClearance -
    resolveTerminalStagger(input.targetLaneIndex, input.targetLaneCount, config);
  const endLeadX = input.targetX - config.terminalOverlap;

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
    config.upstreamCornerRadius,
  );
}

function buildVerticalDropPath(input: SequenceFlowPathInput, sourceLaneOffset: number, targetLaneOffset: number, config: SequenceFlowPathConfig) {
  const startLeadX = input.sourceX + config.terminalOverlap;
  const sourceBranchX = resolveVerticalDropSourceRailX(input, config);
  const transferY = resolveVerticalDropTransferY(input, sourceLaneOffset, targetLaneOffset, config);
  const targetDropX =
    input.targetX -
    config.upstreamHorizontalClearance -
    resolveTerminalStagger(input.targetLaneIndex, input.targetLaneCount, config);
  const endLeadX = input.targetX - config.terminalOverlap;

  return buildRoundedOrthogonalPath(
    [
      { x: input.sourceX, y: input.sourceY },
      { x: startLeadX, y: input.sourceY },
      { x: sourceBranchX, y: input.sourceY },
      { x: sourceBranchX, y: transferY },
      { x: targetDropX, y: transferY },
      { x: targetDropX, y: input.targetY },
      { x: endLeadX, y: input.targetY },
      { x: input.targetX, y: input.targetY },
    ],
    config.upstreamCornerRadius,
  );
}

function buildLaneBezierPath(input: SequenceFlowPathInput, sourceLaneOffset: number, targetLaneOffset: number, config: SequenceFlowPathConfig) {
  const directDistance = input.targetX - input.sourceX;
  if (directDistance <= config.terminalOverlap * 2) {
    return buildTightBezierPath(input, sourceLaneOffset, targetLaneOffset, config);
  }

  const startLeadX = input.sourceX + config.terminalOverlap;
  const endLeadX = input.targetX - config.terminalOverlap;
  const laneDistance = endLeadX - startLeadX;

  const controlSpan = resolveDownstreamControlSpan(laneDistance, config);

  return [
    `M ${roundCoordinate(input.sourceX)} ${roundCoordinate(input.sourceY)}`,
    `L ${roundCoordinate(startLeadX)} ${roundCoordinate(input.sourceY)}`,
    `C ${roundCoordinate(startLeadX + controlSpan)} ${roundCoordinate(input.sourceY + sourceLaneOffset)} ${roundCoordinate(endLeadX - controlSpan)} ${roundCoordinate(input.targetY + targetLaneOffset)} ${roundCoordinate(endLeadX)} ${roundCoordinate(input.targetY)}`,
    `L ${roundCoordinate(input.targetX)} ${roundCoordinate(input.targetY)}`,
  ].join(" ");
}

function buildTightBezierPath(input: SequenceFlowPathInput, sourceLaneOffset: number, targetLaneOffset: number, config: SequenceFlowPathConfig) {
  const controlSpan = Math.max((input.targetX - input.sourceX) / 2, config.downstreamTightMinControl);

  return [
    `M ${roundCoordinate(input.sourceX)} ${roundCoordinate(input.sourceY)}`,
    `C ${roundCoordinate(input.sourceX + controlSpan)} ${roundCoordinate(input.sourceY + sourceLaneOffset)} ${roundCoordinate(input.targetX - controlSpan)} ${roundCoordinate(input.targetY + targetLaneOffset)} ${roundCoordinate(input.targetX)} ${roundCoordinate(input.targetY)}`,
  ].join(" ");
}

function shouldUseVerticalDropPath(input: SequenceFlowPathInput, config: SequenceFlowPathConfig) {
  if (input.targetY <= input.sourceY || input.targetX > input.sourceX) {
    return false;
  }
  if (input.sourceNodeY === undefined || input.targetNodeY === undefined) {
    return false;
  }
  return input.targetNodeY - input.sourceNodeY >= config.lowerRowThreshold;
}

function resolveVerticalDropSourceRailX(input: SequenceFlowPathInput, config: SequenceFlowPathConfig) {
  const sourceNodeWidthEstimate =
    input.sourceNodeX !== undefined ? Math.max(input.sourceX - input.sourceNodeX, config.terminalOverlap * 2) : 0;
  const targetRightEstimate =
    input.targetNodeX !== undefined && sourceNodeWidthEstimate > 0 ? input.targetNodeX + sourceNodeWidthEstimate : input.targetX;

  return (
    Math.max(input.sourceX, targetRightEstimate) +
    config.upstreamHorizontalClearance +
    resolveTerminalStagger(input.sourceLaneIndex, input.sourceLaneCount, config)
  );
}

function resolveVerticalDropTransferY(input: SequenceFlowPathInput, sourceLaneOffset: number, targetLaneOffset: number, config: SequenceFlowPathConfig) {
  const midpointY = input.sourceY + (input.targetY - input.sourceY) / 2;
  const targetApproachY =
    input.targetNodeY !== undefined ? input.targetNodeY - config.upstreamNodeTopGutter : Number.POSITIVE_INFINITY;

  return Math.max(input.sourceY + config.terminalOverlap, Math.min(midpointY, targetApproachY)) - sourceLaneOffset + targetLaneOffset;
}

function resolveUpstreamTopY(input: SequenceFlowPathInput, sourceLaneOffset: number, targetLaneOffset: number, config: SequenceFlowPathConfig) {
  if (input.sourceNodeY !== undefined && input.targetNodeY !== undefined) {
    return Math.min(input.sourceNodeY, input.targetNodeY) - config.upstreamNodeTopGutter - sourceLaneOffset + targetLaneOffset;
  }

  return Math.min(input.sourceY, input.targetY) - config.upstreamTopClearance - sourceLaneOffset + targetLaneOffset;
}

function resolveLaneOffset(index: number | undefined, count: number | undefined, config: SequenceFlowPathConfig) {
  if (index === undefined || count === undefined || count <= 1) {
    return 0;
  }

  return (index - (count - 1) / 2) * config.laneSpacing;
}

function resolveTerminalStagger(index: number | undefined, count: number | undefined, config: SequenceFlowPathConfig) {
  if (index === undefined || count === undefined || count <= 1) {
    return 0;
  }

  return index * config.terminalStagger;
}

function resolveReturnDropX(input: SequenceFlowPathInput, sourceBranchX: number, config: SequenceFlowPathConfig) {
  const targetDropX =
    input.targetX -
    config.upstreamHorizontalClearance -
    resolveTerminalStagger(input.targetLaneIndex, input.targetLaneCount, config);

  const targetNodeIsStillOnOrRightOfSource =
    input.sourceNodeX !== undefined && input.targetNodeX !== undefined && input.targetNodeX >= input.sourceNodeX;

  if (input.targetY > input.sourceY && targetNodeIsStillOnOrRightOfSource && targetDropX < sourceBranchX) {
    return sourceBranchX;
  }

  return targetDropX;
}

function resolveDownstreamControlSpan(distance: number, config: SequenceFlowPathConfig) {
  return Math.min(
    Math.max(distance * config.downstreamControlRatio, config.downstreamControlMin),
    Math.min(config.downstreamControlMax, distance / 2),
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

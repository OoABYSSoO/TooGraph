import type { GraphConnectionAnchorKind, PendingGraphConnection } from "../../lib/graph-connections.ts";
import {
  CREATE_AGENT_INPUT_STATE_KEY,
  VIRTUAL_ANY_INPUT_STATE_KEY,
  VIRTUAL_ANY_OUTPUT_COLOR,
  VIRTUAL_ANY_OUTPUT_STATE_KEY,
} from "../../lib/virtual-any-input.ts";
import type { GraphNode, GraphPosition, StateDefinition } from "../../types/node-system.ts";
import type { PendingStateInputSource } from "./canvasPendingStatePortModel.ts";
import type { MeasuredNodeSize } from "./canvasNodePresentationModel.ts";
import type { ProjectedCanvasAnchor } from "./edgeProjection.ts";
import type { MeasuredAnchorOffset } from "./resolvedCanvasLayout.ts";

const STATE_TARGET_ROW_FALLBACK_GAP = 44;

export type CanvasNodeCreationMenuPayload = {
  position: GraphPosition;
  sourceNodeId?: string;
  sourceAnchorKind?: Extract<GraphConnectionAnchorKind, "flow-out" | "route-out" | "state-out">;
  sourceBranchKey?: string;
  sourceStateKey?: string;
  sourceValueType?: string | null;
  targetNodeId?: string;
  targetAnchorKind?: Extract<GraphConnectionAnchorKind, "state-in">;
  targetStateKey?: string;
  targetValueType?: string | null;
  clientX: number;
  clientY: number;
};

type StateSchemaLike = Record<string, Pick<StateDefinition, "type"> | undefined>;

export function resolveCanvasConnectionStateValueType(
  stateKey: string | null | undefined,
  stateSchema: StateSchemaLike,
) {
  if (
    !stateKey ||
    stateKey === VIRTUAL_ANY_INPUT_STATE_KEY ||
    stateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY ||
    stateKey === CREATE_AGENT_INPUT_STATE_KEY
  ) {
    return null;
  }
  return stateSchema[stateKey]?.type ?? null;
}

export function buildCanvasNodeCreationMenuPayload(input: {
  connection: PendingGraphConnection | null;
  position: GraphPosition;
  clientX: number;
  clientY: number;
  stateSchema: StateSchemaLike;
}): CanvasNodeCreationMenuPayload | null {
  const connection = input.connection;
  if (!connection) {
    return null;
  }

  if (connection.sourceKind === "state-in") {
    return {
      position: input.position,
      targetNodeId: connection.sourceNodeId,
      targetAnchorKind: connection.sourceKind,
      ...(connection.sourceStateKey ? { targetStateKey: connection.sourceStateKey } : {}),
      targetValueType: resolveCanvasConnectionStateValueType(connection.sourceStateKey, input.stateSchema),
      clientX: input.clientX,
      clientY: input.clientY,
    };
  }

  if (connection.sourceKind === "flow-out" || connection.sourceKind === "route-out" || connection.sourceKind === "state-out") {
    return {
      position: input.position,
      sourceNodeId: connection.sourceNodeId,
      sourceAnchorKind: connection.sourceKind,
      ...(connection.branchKey ? { sourceBranchKey: connection.branchKey } : {}),
      ...(connection.sourceStateKey ? { sourceStateKey: connection.sourceStateKey } : {}),
      sourceValueType: resolveCanvasConnectionStateValueType(connection.sourceStateKey, input.stateSchema),
      clientX: input.clientX,
      clientY: input.clientY,
    };
  }

  return null;
}

export function isCanvasStateTargetAnchorAllowedForConnection(
  connection: PendingGraphConnection | null,
  anchor: Pick<ProjectedCanvasAnchor, "kind" | "stateKey">,
) {
  if (connection?.sourceKind !== "state-out") {
    return true;
  }

  if (connection.sourceStateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY) {
    return anchor.kind === "state-in" && typeof anchor.stateKey === "string";
  }

  return (
    anchor.stateKey === CREATE_AGENT_INPUT_STATE_KEY ||
    anchor.stateKey === VIRTUAL_ANY_INPUT_STATE_KEY ||
    anchor.stateKey === connection.sourceStateKey
  );
}

export function resolveCanvasAgentCreateInputTargetAnchor(input: {
  nodeId: string;
  node: GraphNode | undefined;
  pendingSource: PendingStateInputSource | null | undefined;
  projectedAnchors: readonly ProjectedCanvasAnchor[];
  baseProjectedAnchors: readonly ProjectedCanvasAnchor[];
  measuredAnchorOffsets: Record<string, MeasuredAnchorOffset>;
}): ProjectedCanvasAnchor | null {
  const existingCreateInputAnchor = input.projectedAnchors.find(
    (anchor) =>
      anchor.nodeId === input.nodeId &&
      anchor.kind === "state-in" &&
      anchor.stateKey === CREATE_AGENT_INPUT_STATE_KEY,
  );
  if (existingCreateInputAnchor) {
    return existingCreateInputAnchor;
  }

  const node = input.node;
  if (!input.pendingSource || !node || node.kind !== "agent") {
    return null;
  }

  const fallbackInputAnchor = input.baseProjectedAnchors.find(
    (anchor) =>
      anchor.nodeId === input.nodeId &&
      anchor.kind === "state-in" &&
      anchor.stateKey === VIRTUAL_ANY_INPUT_STATE_KEY,
  );
  const measuredCreateInputOffset = input.measuredAnchorOffsets[`${input.nodeId}:state-in:${CREATE_AGENT_INPUT_STATE_KEY}`];
  const existingInputAnchors = input.baseProjectedAnchors.filter(
    (anchor) =>
      anchor.nodeId === input.nodeId &&
      anchor.kind === "state-in" &&
      anchor.stateKey !== VIRTUAL_ANY_INPUT_STATE_KEY,
  );
  const lastInputAnchor = existingInputAnchors.at(-1);

  return {
    id: `${input.nodeId}:state-in:${CREATE_AGENT_INPUT_STATE_KEY}`,
    nodeId: input.nodeId,
    kind: "state-in",
    x: measuredCreateInputOffset
      ? node.ui.position.x + measuredCreateInputOffset.offsetX
      : (fallbackInputAnchor?.x ?? lastInputAnchor?.x ?? node.ui.position.x + 6),
    y: measuredCreateInputOffset
      ? node.ui.position.y + measuredCreateInputOffset.offsetY
      : (fallbackInputAnchor?.y ?? (lastInputAnchor ? lastInputAnchor.y + STATE_TARGET_ROW_FALLBACK_GAP : node.ui.position.y + 145)),
    side: "left",
    color: input.pendingSource.stateColor,
    stateKey: CREATE_AGENT_INPUT_STATE_KEY,
  };
}

export function resolveCanvasEligibleTargetAnchorForNodeBody(input: {
  connection: PendingGraphConnection | null;
  nodeId: string;
  node: GraphNode | undefined;
  projectedAnchors: readonly ProjectedCanvasAnchor[];
  baseProjectedAnchors: readonly ProjectedCanvasAnchor[];
  measuredAnchorOffsets: Record<string, MeasuredAnchorOffset>;
  measuredNodeSize: MeasuredNodeSize | undefined;
  eligibleTargetAnchorIds: ReadonlySet<string>;
  pendingAgentInputSource: PendingStateInputSource | null | undefined;
  canComplete: (anchor: ProjectedCanvasAnchor) => boolean;
}): ProjectedCanvasAnchor | null {
  if (input.connection?.sourceKind === "state-in") {
    return resolveCanvasEligibleStateInputSourceAnchorForNodeBody(input);
  }

  if (input.connection?.sourceKind === "state-out") {
    return resolveCanvasEligibleStateTargetAnchorForNodeBody(input);
  }

  const candidateAnchor = input.projectedAnchors.find((anchor) => anchor.nodeId === input.nodeId && anchor.kind === "flow-in");
  if (!candidateAnchor || !input.eligibleTargetAnchorIds.has(candidateAnchor.id)) {
    return null;
  }
  return candidateAnchor;
}

export function resolveCanvasEligibleStateInputSourceAnchorForNodeBody(input: {
  connection: PendingGraphConnection | null;
  nodeId: string;
  node: GraphNode | undefined;
  projectedAnchors: readonly ProjectedCanvasAnchor[];
  measuredNodeSize: MeasuredNodeSize | undefined;
  canComplete: (anchor: ProjectedCanvasAnchor) => boolean;
}) {
  if (input.connection?.sourceKind !== "state-in" || !input.connection.sourceStateKey) {
    return null;
  }

  const matchingOutputAnchor = input.projectedAnchors.find(
    (anchor) =>
      anchor.nodeId === input.nodeId &&
      anchor.kind === "state-out" &&
      anchor.stateKey === input.connection?.sourceStateKey,
  );
  if (matchingOutputAnchor && input.canComplete(matchingOutputAnchor)) {
    return matchingOutputAnchor;
  }

  const createOutputAnchor = input.projectedAnchors.find(
    (anchor) =>
      anchor.nodeId === input.nodeId &&
      anchor.kind === "state-out" &&
      anchor.stateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY,
  );
  if (createOutputAnchor && input.canComplete(createOutputAnchor)) {
    return createOutputAnchor;
  }

  const node = input.node;
  if (!node) {
    return null;
  }

  const fallbackOutputAnchor = {
    id: `${input.nodeId}:state-out:${VIRTUAL_ANY_OUTPUT_STATE_KEY}:reverse`,
    nodeId: input.nodeId,
    kind: "state-out" as const,
    x: node.ui.position.x + (input.measuredNodeSize?.width ?? resolveFallbackWidth(node)),
    y: node.ui.position.y + 88,
    side: "right" as const,
    color: VIRTUAL_ANY_OUTPUT_COLOR,
    stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
  };
  return input.canComplete(fallbackOutputAnchor) ? fallbackOutputAnchor : null;
}

export function resolveCanvasConcreteStateInputSourceAnchorAtPointerY(input: {
  connection: PendingGraphConnection | null;
  nodeId: string;
  projectedAnchors: readonly ProjectedCanvasAnchor[];
  pointerY: number;
  canComplete: (anchor: ProjectedCanvasAnchor) => boolean;
}) {
  const concreteStateOutputAnchors = input.projectedAnchors
    .filter(
      (anchor) =>
        anchor.nodeId === input.nodeId &&
        anchor.kind === "state-out" &&
        isConcreteCanvasStateKey(anchor.stateKey) &&
        input.canComplete(anchor),
    )
    .sort((left, right) => left.y - right.y);
  if (concreteStateOutputAnchors.length === 0) {
    return null;
  }

  const createOutputAnchor = input.projectedAnchors.find(
    (anchor) =>
      anchor.nodeId === input.nodeId &&
      anchor.kind === "state-out" &&
      anchor.stateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY &&
      input.canComplete(anchor),
  );
  return selectAnchorByPointerY(concreteStateOutputAnchors, input.pointerY, createOutputAnchor);
}

export function resolveCanvasEligibleStateTargetAnchorForNodeBody(input: {
  connection: PendingGraphConnection | null;
  nodeId: string;
  node: GraphNode | undefined;
  projectedAnchors: readonly ProjectedCanvasAnchor[];
  baseProjectedAnchors: readonly ProjectedCanvasAnchor[];
  measuredAnchorOffsets: Record<string, MeasuredAnchorOffset>;
  pendingAgentInputSource: PendingStateInputSource | null | undefined;
  eligibleTargetAnchorIds: ReadonlySet<string>;
  canComplete: (anchor: ProjectedCanvasAnchor) => boolean;
}) {
  const createInputAnchor = resolveCanvasAgentCreateInputTargetAnchor({
    nodeId: input.nodeId,
    node: input.node,
    pendingSource: input.pendingAgentInputSource,
    projectedAnchors: input.projectedAnchors,
    baseProjectedAnchors: input.baseProjectedAnchors,
    measuredAnchorOffsets: input.measuredAnchorOffsets,
  });
  if (createInputAnchor && input.canComplete(createInputAnchor)) {
    return createInputAnchor;
  }

  const candidateAnchor = input.projectedAnchors.find(
    (anchor) =>
      anchor.nodeId === input.nodeId &&
      anchor.kind === "state-in" &&
      isCanvasStateTargetAnchorAllowedForConnection(input.connection, anchor),
  );
  if (!candidateAnchor || !input.eligibleTargetAnchorIds.has(candidateAnchor.id)) {
    return null;
  }
  return candidateAnchor;
}

export function resolveCanvasConcreteStateTargetAnchorAtPointerY(input: {
  connection: PendingGraphConnection | null;
  nodeId: string;
  node: GraphNode | undefined;
  projectedAnchors: readonly ProjectedCanvasAnchor[];
  baseProjectedAnchors: readonly ProjectedCanvasAnchor[];
  measuredAnchorOffsets: Record<string, MeasuredAnchorOffset>;
  pendingAgentInputSource: PendingStateInputSource | null | undefined;
  eligibleTargetAnchorIds: ReadonlySet<string>;
  pointerY: number;
}) {
  const concreteStateInputAnchors = input.projectedAnchors
    .filter(
      (anchor) =>
        anchor.nodeId === input.nodeId &&
        anchor.kind === "state-in" &&
        anchor.stateKey !== CREATE_AGENT_INPUT_STATE_KEY &&
        anchor.stateKey !== VIRTUAL_ANY_INPUT_STATE_KEY &&
        isCanvasStateTargetAnchorAllowedForConnection(input.connection, anchor) &&
        input.eligibleTargetAnchorIds.has(anchor.id),
    )
    .sort((left, right) => left.y - right.y);
  if (concreteStateInputAnchors.length === 0) {
    return null;
  }

  const createInputAnchor = resolveCanvasAgentCreateInputTargetAnchor({
    nodeId: input.nodeId,
    node: input.node,
    pendingSource: input.pendingAgentInputSource,
    projectedAnchors: input.projectedAnchors,
    baseProjectedAnchors: input.baseProjectedAnchors,
    measuredAnchorOffsets: input.measuredAnchorOffsets,
  });
  return selectAnchorByPointerY(concreteStateInputAnchors, input.pointerY, createInputAnchor);
}

function selectAnchorByPointerY(
  anchors: readonly ProjectedCanvasAnchor[],
  pointerY: number,
  trailingAnchor: ProjectedCanvasAnchor | null | undefined,
) {
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    const previousAnchor = anchors[index - 1];
    const nextAnchor = anchors[index + 1];
    const previousY = previousAnchor?.y ?? anchor.y - STATE_TARGET_ROW_FALLBACK_GAP;
    const nextY = nextAnchor?.y ?? trailingAnchor?.y ?? anchor.y + STATE_TARGET_ROW_FALLBACK_GAP;
    const upperBoundary = (previousY + anchor.y) / 2;
    const lowerBoundary = (anchor.y + nextY) / 2;
    if (pointerY >= upperBoundary && pointerY < lowerBoundary) {
      return anchor;
    }
  }
  return null;
}

function isConcreteCanvasStateKey(stateKey: string | null | undefined) {
  return (
    typeof stateKey === "string" &&
    stateKey.length > 0 &&
    stateKey !== CREATE_AGENT_INPUT_STATE_KEY &&
    stateKey !== VIRTUAL_ANY_INPUT_STATE_KEY &&
    stateKey !== VIRTUAL_ANY_OUTPUT_STATE_KEY
  );
}

function resolveFallbackWidth(node: Pick<GraphNode, "kind">) {
  if (node.kind === "condition") {
    return 560;
  }
  return 460;
}

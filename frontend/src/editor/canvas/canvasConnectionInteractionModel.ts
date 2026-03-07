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
import { buildFlowHotspotStyle } from "./canvasInteractionStyleModel.ts";

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

type CanvasNodeCreationMenuInput = {
  connection: PendingGraphConnection | null;
  position: GraphPosition;
  clientX: number;
  clientY: number;
  stateSchema: StateSchemaLike;
};

export type CanvasPendingConnectionCreationMenuRequest = {
  payload: CanvasNodeCreationMenuPayload;
  clearConnectionInteraction: true;
  clearSelectedEdge: true;
};

export type CanvasConnectionPointerUpAction =
  | { type: "clear-connection-interaction" }
  | { type: "complete-connection"; targetAnchor: ProjectedCanvasAnchor }
  | { type: "open-creation-menu" };

export type CanvasConnectionPointerMoveRequest = {
  hoverNodeId: string | null;
  targetAnchor: ProjectedCanvasAnchor | null;
  fallbackPoint: GraphPosition;
};

type CanvasAnchorPointerDownSetupPolicy = {
  focusCanvas: true;
  clearCanvasTransientState: true;
  selectNodeId: string;
};

export type CanvasAnchorPointerDownAction =
  | { type: "locked-edit-attempt" }
  | ({
      type: "complete-connection";
      targetAnchor: ProjectedCanvasAnchor;
    } & CanvasAnchorPointerDownSetupPolicy)
  | ({ type: "ignore-anchor" } & CanvasAnchorPointerDownSetupPolicy)
  | ({
      type: "start-or-toggle-connection";
      clearWindowSelection: true;
    } & CanvasAnchorPointerDownSetupPolicy);

export type CanvasNodePointerDownConnectionAction =
  | {
      type: "complete-connection";
      targetAnchor: ProjectedCanvasAnchor;
      preventDefault: true;
      focusCanvas: boolean;
    }
  | { type: "continue-node-pointer-down" };

type CanvasAutoSnapResolverInput = {
  connection: PendingGraphConnection | null;
  nodeIdAtPointer: string | null;
  canvasPoint: GraphPosition;
  flowAnchors: readonly ProjectedCanvasAnchor[];
  projectedAnchors: readonly ProjectedCanvasAnchor[];
  baseProjectedAnchors: readonly ProjectedCanvasAnchor[];
  nodes: Record<string, GraphNode | undefined>;
  measuredAnchorOffsets: Record<string, MeasuredAnchorOffset>;
  measuredNodeSizes: Record<string, MeasuredNodeSize | undefined>;
  eligibleTargetAnchorIds: ReadonlySet<string>;
  pendingAgentInputSourceByNodeId: Record<string, PendingStateInputSource | null | undefined>;
  canComplete: (anchor: ProjectedCanvasAnchor) => boolean;
};

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

export function buildCanvasNodeCreationMenuPayload(input: CanvasNodeCreationMenuInput): CanvasNodeCreationMenuPayload | null {
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

export function resolveCanvasPendingConnectionCreationMenuRequest(
  input: CanvasNodeCreationMenuInput,
): CanvasPendingConnectionCreationMenuRequest | null {
  const payload = buildCanvasNodeCreationMenuPayload(input);
  if (!payload) {
    return null;
  }

  return {
    payload,
    clearConnectionInteraction: true,
    clearSelectedEdge: true,
  };
}

export function resolveCanvasConnectionPointerUpAction(input: {
  connection: PendingGraphConnection | null;
  interactionLocked: boolean;
  autoSnappedTargetAnchor: ProjectedCanvasAnchor | null;
}): CanvasConnectionPointerUpAction | null {
  if (!input.connection) {
    return null;
  }

  if (input.interactionLocked) {
    return { type: "clear-connection-interaction" };
  }

  if (input.autoSnappedTargetAnchor) {
    return {
      type: "complete-connection",
      targetAnchor: input.autoSnappedTargetAnchor,
    };
  }

  return { type: "open-creation-menu" };
}

export function resolveCanvasNodePointerDownConnectionAction(input: {
  connection: PendingGraphConnection | null;
  targetAnchor: ProjectedCanvasAnchor | null;
  preserveInlineEditorFocus: boolean;
}): CanvasNodePointerDownConnectionAction | null {
  if (!input.connection) {
    return null;
  }

  if (!input.targetAnchor) {
    return { type: "continue-node-pointer-down" };
  }

  return {
    type: "complete-connection",
    targetAnchor: input.targetAnchor,
    preventDefault: true,
    focusCanvas: !input.preserveInlineEditorFocus,
  };
}

export function resolveCanvasConnectionPointerMoveRequest(input: {
  connection: PendingGraphConnection | null;
  hoverNodeId: string | null;
  targetAnchor: ProjectedCanvasAnchor | null;
  fallbackPoint: GraphPosition;
}): CanvasConnectionPointerMoveRequest | null {
  if (!input.connection) {
    return null;
  }

  return {
    hoverNodeId: input.hoverNodeId,
    targetAnchor: input.targetAnchor,
    fallbackPoint: input.fallbackPoint,
  };
}

export function resolveCanvasAnchorPointerDownAction(input: {
  interactionLocked: boolean;
  anchor: ProjectedCanvasAnchor;
  canComplete: boolean;
  canStart: boolean;
}): CanvasAnchorPointerDownAction {
  if (input.interactionLocked) {
    return { type: "locked-edit-attempt" };
  }

  const setupPolicy = {
    focusCanvas: true,
    clearCanvasTransientState: true,
    selectNodeId: input.anchor.nodeId,
  } as const;

  if (input.canComplete) {
    return {
      type: "complete-connection",
      targetAnchor: input.anchor,
      ...setupPolicy,
    };
  }

  if (!input.canStart) {
    return {
      type: "ignore-anchor",
      ...setupPolicy,
    };
  }

  return {
    type: "start-or-toggle-connection",
    clearWindowSelection: true,
    ...setupPolicy,
  };
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

export function resolveCanvasAutoSnappedTargetAnchor(
  input: CanvasAutoSnapResolverInput,
): ProjectedCanvasAnchor | null {
  const connection = input.connection;
  if (!connection) {
    return null;
  }

  if (connection.sourceKind === "state-in") {
    return resolveCanvasAutoSnappedStateInputSourceAnchor(input);
  }

  if (connection.sourceKind === "state-out") {
    return resolveCanvasAutoSnappedStateTargetAnchor(input);
  }

  const hotspotAnchor = resolveCanvasFlowHotspotTargetAnchor({
    anchors: input.flowAnchors,
    canvasPoint: input.canvasPoint,
    eligibleTargetAnchorIds: input.eligibleTargetAnchorIds,
  });
  if (hotspotAnchor) {
    return hotspotAnchor;
  }

  if (!input.nodeIdAtPointer) {
    return null;
  }
  return resolveCanvasEligibleTargetAnchorForNodeBody({
    connection,
    nodeId: input.nodeIdAtPointer,
    node: input.nodes[input.nodeIdAtPointer],
    projectedAnchors: input.projectedAnchors,
    baseProjectedAnchors: input.baseProjectedAnchors,
    measuredAnchorOffsets: input.measuredAnchorOffsets,
    measuredNodeSize: input.measuredNodeSizes[input.nodeIdAtPointer],
    eligibleTargetAnchorIds: input.eligibleTargetAnchorIds,
    pendingAgentInputSource: input.pendingAgentInputSourceByNodeId[input.nodeIdAtPointer] ?? null,
    canComplete: input.canComplete,
  });
}

export function resolveCanvasAutoSnappedStateInputSourceAnchor(
  input: CanvasAutoSnapResolverInput,
): ProjectedCanvasAnchor | null {
  const connection = input.connection;
  if (connection?.sourceKind !== "state-in" || !input.nodeIdAtPointer) {
    return null;
  }

  const directStateInputSourceAnchor = resolveCanvasConcreteStateInputSourceAnchorAtPointerY({
    connection: input.connection,
    nodeId: input.nodeIdAtPointer,
    projectedAnchors: input.projectedAnchors,
    pointerY: input.canvasPoint.y,
    canComplete: input.canComplete,
  });
  if (directStateInputSourceAnchor) {
    return directStateInputSourceAnchor;
  }

  return resolveCanvasEligibleStateInputSourceAnchorForNodeBody({
    connection,
    nodeId: input.nodeIdAtPointer,
    node: input.nodes[input.nodeIdAtPointer],
    projectedAnchors: input.projectedAnchors,
    measuredNodeSize: input.measuredNodeSizes[input.nodeIdAtPointer],
    canComplete: input.canComplete,
  });
}

export function resolveCanvasAutoSnappedStateTargetAnchor(
  input: CanvasAutoSnapResolverInput,
): ProjectedCanvasAnchor | null {
  const connection = input.connection;
  if (connection?.sourceKind !== "state-out" || !input.nodeIdAtPointer) {
    return null;
  }

  const directStateTargetAnchor = resolveCanvasConcreteStateTargetAnchorAtPointerY({
    connection: input.connection,
    nodeId: input.nodeIdAtPointer,
    node: input.nodes[input.nodeIdAtPointer],
    projectedAnchors: input.projectedAnchors,
    baseProjectedAnchors: input.baseProjectedAnchors,
    measuredAnchorOffsets: input.measuredAnchorOffsets,
    pendingAgentInputSource: input.pendingAgentInputSourceByNodeId[input.nodeIdAtPointer] ?? null,
    eligibleTargetAnchorIds: input.eligibleTargetAnchorIds,
    pointerY: input.canvasPoint.y,
  });
  if (directStateTargetAnchor) {
    return directStateTargetAnchor;
  }

  return resolveCanvasEligibleStateTargetAnchorForNodeBody({
    connection,
    nodeId: input.nodeIdAtPointer,
    node: input.nodes[input.nodeIdAtPointer],
    projectedAnchors: input.projectedAnchors,
    baseProjectedAnchors: input.baseProjectedAnchors,
    measuredAnchorOffsets: input.measuredAnchorOffsets,
    pendingAgentInputSource: input.pendingAgentInputSourceByNodeId[input.nodeIdAtPointer] ?? null,
    eligibleTargetAnchorIds: input.eligibleTargetAnchorIds,
    canComplete: input.canComplete,
  });
}

export function resolveCanvasFlowHotspotTargetAnchor(input: {
  anchors: readonly ProjectedCanvasAnchor[];
  canvasPoint: GraphPosition;
  eligibleTargetAnchorIds: ReadonlySet<string>;
}) {
  return (
    input.anchors.find(
      (anchor) =>
        input.eligibleTargetAnchorIds.has(anchor.id) &&
        isCanvasPointWithinFlowHotspot(anchor, input.canvasPoint),
    ) ?? null
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

function isCanvasPointWithinFlowHotspot(anchor: ProjectedCanvasAnchor, point: GraphPosition) {
  const hotspot = buildFlowHotspotStyle(anchor);
  const left = parseFloat(hotspot.left);
  const top = parseFloat(hotspot.top);
  const width = parseFloat(hotspot.width);
  const height = parseFloat(hotspot.height);

  return (
    point.x >= left - width / 2 &&
    point.x <= left + width / 2 &&
    point.y >= top - height / 2 &&
    point.y <= top + height / 2
  );
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

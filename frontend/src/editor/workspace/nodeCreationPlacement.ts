import { buildAnchorModel } from "../anchors/anchorModel.ts";
import type { PlacedAnchor } from "../anchors/anchorPlacement.ts";
import { placeAnchors } from "../anchors/anchorPlacement.ts";
import { buildNodeAnchorFrame } from "../canvas/nodeAnchorFrame.ts";
import type { GraphNode, GraphPosition, NodeCreationContext } from "../../types/node-system.ts";

export type NodeCreationPlacementContext = Partial<
  Pick<
    NodeCreationContext,
    | "position"
    | "sourceAnchorKind"
    | "sourceStateKey"
    | "targetAnchorKind"
    | "targetStateKey"
  >
>;

export function resolveNodeCreationFinalPositionFromGesture(input: {
  nodeId: string;
  node: GraphNode;
  context?: NodeCreationPlacementContext | null;
}): GraphPosition {
  if (!isGraphPosition(input.context?.position)) {
    return input.node.ui.position;
  }
  const offset = resolveNodeCreationPlacementOffset({
    nodeId: input.nodeId,
    node: input.node,
    context: input.context,
  });
  return roundGraphPosition({
    x: input.context.position.x - offset.x,
    y: input.context.position.y - offset.y,
  });
}

export function resolveNodeCreationGesturePositionForFinalPosition(input: {
  nodeId: string;
  node: GraphNode;
  finalPosition?: GraphPosition | null;
  context?: NodeCreationPlacementContext | null;
}): GraphPosition {
  const finalPosition = isGraphPosition(input.finalPosition) ? input.finalPosition : input.node.ui.position;
  const offset = resolveNodeCreationPlacementOffset({
    nodeId: input.nodeId,
    node: input.node,
    context: input.context,
  });
  return roundGraphPosition({
    x: finalPosition.x + offset.x,
    y: finalPosition.y + offset.y,
  });
}

function resolveNodeCreationPlacementOffset(input: {
  nodeId: string;
  node: GraphNode;
  context?: NodeCreationPlacementContext | null;
}): GraphPosition {
  const node = buildPlacementNode(input.node, input.context);
  const frame = buildNodeAnchorFrame(node, { position: { x: 0, y: 0 } });
  const anchor = resolveCreationAlignmentAnchor({
    nodeId: input.nodeId,
    node,
    context: input.context,
  });
  if (anchor) {
    return { x: anchor.x, y: anchor.y };
  }
  return {
    x: frame.width / 2,
    y: (frame.height ?? 0) / 2,
  };
}

function resolveCreationAlignmentAnchor(input: {
  nodeId: string;
  node: GraphNode;
  context?: NodeCreationPlacementContext | null;
}): PlacedAnchor | null {
  const anchors = placeAnchors(
    buildAnchorModel(input.nodeId, input.node),
    buildNodeAnchorFrame(input.node, { position: { x: 0, y: 0 } }),
  );

  if (input.context?.sourceAnchorKind === "state-out") {
    return (
      findAnchorByStateKey(anchors.stateInputs, input.context.sourceStateKey) ??
      anchors.stateInputs[0] ??
      anchors.flowIn ??
      null
    );
  }

  if (input.context?.targetAnchorKind === "state-in") {
    return (
      findAnchorByStateKey(anchors.stateOutputs, input.context.targetStateKey) ??
      anchors.stateOutputs[0] ??
      anchors.flowOut ??
      null
    );
  }

  if (input.context?.sourceAnchorKind === "flow-out" || input.context?.sourceAnchorKind === "route-out") {
    return anchors.flowIn;
  }

  return null;
}

function findAnchorByStateKey(anchors: PlacedAnchor[], stateKey: string | null | undefined) {
  const normalizedStateKey = compactText(stateKey);
  if (!normalizedStateKey) {
    return null;
  }
  return anchors.find((anchor) => anchor.stateKey === normalizedStateKey) ?? null;
}

function buildPlacementNode(node: GraphNode, context?: NodeCreationPlacementContext | null): GraphNode {
  const nextNode = cloneGraphNodeForPlacement(node);
  const sourceStateKey = compactText(context?.sourceStateKey);
  if (context?.sourceAnchorKind === "state-out" && sourceStateKey) {
    bindStateInputForPlacement(nextNode, sourceStateKey);
  }

  const targetStateKey = compactText(context?.targetStateKey);
  if (context?.targetAnchorKind === "state-in" && targetStateKey) {
    bindStateOutputForPlacement(nextNode, targetStateKey);
  }

  return nextNode;
}

function cloneGraphNodeForPlacement(node: GraphNode): GraphNode {
  return {
    ...node,
    ui: { ...node.ui },
    reads: node.reads.map((binding) => ({ ...binding })),
    writes: node.writes.map((binding) => ({ ...binding })),
    config: { ...node.config },
  } as GraphNode;
}

function bindStateInputForPlacement(node: GraphNode, stateKey: string) {
  if (node.kind === "input") {
    return;
  }

  if (node.kind === "output") {
    node.reads = [{ state: stateKey, required: true }];
    return;
  }

  if (node.kind === "condition") {
    node.reads = [{ state: stateKey, required: true }];
    node.config = {
      ...node.config,
      rule: { ...node.config.rule, source: stateKey },
    };
    return;
  }

  if (node.kind === "subgraph") {
    if (node.reads.length > 0) {
      node.reads = [{ ...node.reads[0], state: stateKey, required: true }, ...node.reads.slice(1)];
      return;
    }
    node.reads = [{ state: stateKey, required: true }];
    return;
  }

  if (!node.reads.some((binding) => binding.state === stateKey)) {
    node.reads = [...node.reads, { state: stateKey, required: true }];
  }
}

function bindStateOutputForPlacement(node: GraphNode, stateKey: string) {
  if (node.kind === "input") {
    node.writes = [{ state: stateKey, mode: "replace" }];
    return;
  }

  if (node.kind === "subgraph") {
    if (node.writes.length > 0) {
      node.writes = [{ ...node.writes[0], state: stateKey, mode: "replace" }, ...node.writes.slice(1)];
      return;
    }
    node.writes = [{ state: stateKey, mode: "replace" }];
    return;
  }

  if (node.kind === "agent" && !node.writes.some((binding) => binding.state === stateKey)) {
    node.writes = [...node.writes, { state: stateKey, mode: "replace" }];
  }
}

function isGraphPosition(value: GraphPosition | null | undefined): value is GraphPosition {
  return typeof value?.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y);
}

function roundGraphPosition(position: GraphPosition): GraphPosition {
  return {
    x: roundCoordinate(position.x),
    y: roundCoordinate(position.y),
  };
}

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

function compactText(value: unknown): string {
  return String(value ?? "").trim();
}

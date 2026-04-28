import type { PendingGraphConnection } from "../../lib/graph-connections.ts";
import {
  CREATE_AGENT_INPUT_STATE_KEY,
  VIRTUAL_ANY_INPUT_COLOR,
  VIRTUAL_ANY_INPUT_STATE_KEY,
  VIRTUAL_ANY_OUTPUT_COLOR,
  VIRTUAL_ANY_OUTPUT_STATE_KEY,
} from "../../lib/virtual-any-input.ts";
import type { GraphDocument, GraphNode, GraphPayload } from "../../types/node-system.ts";
import type { PendingStateInputSource } from "./canvasPendingStatePortModel.ts";
import type { ProjectedCanvasAnchor } from "./edgeProjection.ts";
import type { MeasuredAnchorOffset } from "./resolvedCanvasLayout.ts";

type VirtualCreatePortVisibilityInput = {
  nodeId: string;
  node: GraphNode | undefined;
  selectedNodeId?: string | null;
  hoveredNodeId?: string | null;
  hoveredPointAnchorNodeId?: string | null;
  activeConnectionHoverNodeId?: string | null;
  pendingConnection?: PendingGraphConnection | null;
};

export function shouldShowAgentCreateInputPortByDefault(node: GraphNode | undefined) {
  return node?.kind === "agent" && node.reads.length === 0;
}

export function shouldShowAgentCreateOutputPortByDefault(node: GraphNode | undefined) {
  return (node?.kind === "agent" || node?.kind === "input") && node.writes.length === 0;
}

export function isAgentCreateInputAnchorVisible(input: VirtualCreatePortVisibilityInput) {
  return (
    shouldShowAgentCreateInputPortByDefault(input.node) ||
    input.selectedNodeId === input.nodeId ||
    input.hoveredNodeId === input.nodeId ||
    input.hoveredPointAnchorNodeId === input.nodeId ||
    input.activeConnectionHoverNodeId === input.nodeId ||
    (
      input.pendingConnection?.sourceNodeId === input.nodeId &&
      input.pendingConnection?.sourceKind === "state-in" &&
      input.pendingConnection?.sourceStateKey === VIRTUAL_ANY_INPUT_STATE_KEY
    )
  );
}

export function isAgentCreateOutputAnchorVisible(input: VirtualCreatePortVisibilityInput) {
  return (
    shouldShowAgentCreateOutputPortByDefault(input.node) ||
    input.selectedNodeId === input.nodeId ||
    input.hoveredNodeId === input.nodeId ||
    input.hoveredPointAnchorNodeId === input.nodeId ||
    input.activeConnectionHoverNodeId === input.nodeId ||
    (
      input.pendingConnection?.sourceNodeId === input.nodeId &&
      input.pendingConnection?.sourceKind === "state-out" &&
      input.pendingConnection?.sourceStateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY
    )
  );
}

export function filterBaseProjectedAnchorsForVirtualCreatePorts(input: {
  anchors: readonly ProjectedCanvasAnchor[];
  pendingAgentInputSourceByNodeId: Record<string, PendingStateInputSource>;
  isAgentCreateOutputAnchorVisible: (nodeId: string) => boolean;
}) {
  return input.anchors.filter(
    (anchor) =>
      !(
        anchor.kind === "state-in" &&
        anchor.stateKey === VIRTUAL_ANY_INPUT_STATE_KEY &&
        input.pendingAgentInputSourceByNodeId[anchor.nodeId]
      ) &&
      !(
        anchor.kind === "state-out" &&
        anchor.stateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY &&
        !input.isAgentCreateOutputAnchorVisible(anchor.nodeId)
      ),
  );
}

export function buildTransientAgentCreateInputAnchors(input: {
  document: GraphPayload | GraphDocument;
  measuredAnchorOffsets: Record<string, MeasuredAnchorOffset>;
  pendingAgentInputSourceByNodeId: Record<string, PendingStateInputSource>;
  isAgentCreateInputAnchorVisible: (nodeId: string) => boolean;
}): ProjectedCanvasAnchor[] {
  return Object.entries(input.document.nodes).flatMap(([nodeId, node]) => {
    if (
      node.kind !== "agent" ||
      node.reads.length === 0 ||
      input.pendingAgentInputSourceByNodeId[nodeId] ||
      !input.isAgentCreateInputAnchorVisible(nodeId)
    ) {
      return [];
    }

    const anchorId = `${nodeId}:state-in:${VIRTUAL_ANY_INPUT_STATE_KEY}`;
    const measuredOffset = input.measuredAnchorOffsets[anchorId];
    if (!measuredOffset) {
      return [];
    }

    return [
      {
        id: anchorId,
        nodeId,
        kind: "state-in" as const,
        x: node.ui.position.x + measuredOffset.offsetX,
        y: node.ui.position.y + measuredOffset.offsetY,
        side: "left" as const,
        color: VIRTUAL_ANY_INPUT_COLOR,
        stateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
      },
    ];
  });
}

export function buildTransientAgentInputAnchors(input: {
  document: GraphPayload | GraphDocument;
  measuredAnchorOffsets: Record<string, MeasuredAnchorOffset>;
  pendingAgentInputSourceByNodeId: Record<string, PendingStateInputSource>;
}): ProjectedCanvasAnchor[] {
  return Object.entries(input.pendingAgentInputSourceByNodeId).flatMap(([nodeId, source]) => {
    const node = input.document.nodes[nodeId];
    const anchorId = `${nodeId}:state-in:${CREATE_AGENT_INPUT_STATE_KEY}`;
    const measuredOffset = input.measuredAnchorOffsets[anchorId];
    if (!node || !measuredOffset) {
      return [];
    }

    return [
      {
        id: anchorId,
        nodeId,
        kind: "state-in" as const,
        x: node.ui.position.x + measuredOffset.offsetX,
        y: node.ui.position.y + measuredOffset.offsetY,
        side: "left" as const,
        color: source.stateColor,
        stateKey: CREATE_AGENT_INPUT_STATE_KEY,
      },
    ];
  });
}

export function buildTransientAgentOutputAnchors(input: {
  document: GraphPayload | GraphDocument;
  measuredAnchorOffsets: Record<string, MeasuredAnchorOffset>;
  isAgentCreateOutputAnchorVisible: (nodeId: string) => boolean;
}): ProjectedCanvasAnchor[] {
  return Object.entries(input.document.nodes).flatMap(([nodeId, node]) => {
    if (node.kind !== "agent" || node.writes.length === 0 || !input.isAgentCreateOutputAnchorVisible(nodeId)) {
      return [];
    }

    const anchorId = `${nodeId}:state-out:${VIRTUAL_ANY_OUTPUT_STATE_KEY}`;
    const measuredOffset = input.measuredAnchorOffsets[anchorId];
    if (!measuredOffset) {
      return [];
    }

    return [
      {
        id: anchorId,
        nodeId,
        kind: "state-out" as const,
        x: node.ui.position.x + measuredOffset.offsetX,
        y: node.ui.position.y + measuredOffset.offsetY,
        side: "right" as const,
        color: VIRTUAL_ANY_OUTPUT_COLOR,
        stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
      },
    ];
  });
}

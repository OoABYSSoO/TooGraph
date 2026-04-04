import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";
import { buildAnchorModel } from "../anchors/anchorModel.ts";
import { placeAnchors } from "../anchors/anchorPlacement.ts";
import type { MeasuredNodeSize } from "./canvasNodePresentationModel.ts";
import { buildConnectorCurvePath } from "./connectionCurvePath.ts";
import { buildSelfFeedbackFlowPath, buildSequenceFlowPath } from "./flowEdgePath.ts";
import { buildNodeAnchorFrame } from "./nodeAnchorFrame.ts";

export type ProjectedCanvasEdge = {
  id: string;
  kind: "flow" | "route" | "data";
  source: string;
  target: string;
  path: string;
  color?: string;
  label?: string;
  state?: string;
  branch?: string;
  routing?: ProjectedCanvasEdgeRouting;
};

export type ProjectedCanvasEdgeRouting = {
  sourceLaneIndex: number;
  sourceLaneCount: number;
  targetLaneIndex: number;
  targetLaneCount: number;
};

export type ProjectedCanvasEdgeGroups = {
  flowRouteEdges: ProjectedCanvasEdge[];
  dataEdges: ProjectedCanvasEdge[];
};

export type ProjectedCanvasAnchor = {
  id: string;
  nodeId: string;
  kind: "flow-in" | "flow-out" | "state-in" | "state-out" | "route-out";
  x: number;
  y: number;
  side: "left" | "right" | "top" | "bottom";
  color?: string;
  stateKey?: string;
  branch?: string;
};

export type ProjectedCanvasAnchorGroups = {
  flowAnchors: ProjectedCanvasAnchor[];
  routeHandles: ProjectedCanvasAnchor[];
  pointAnchors: ProjectedCanvasAnchor[];
};

export type ProjectCanvasProjectionOptions = {
  measuredNodeSizes?: Record<string, MeasuredNodeSize>;
};

export function groupProjectedCanvasEdges(edges: readonly ProjectedCanvasEdge[]): ProjectedCanvasEdgeGroups {
  return {
    flowRouteEdges: edges.filter((edge) => edge.kind === "flow" || edge.kind === "route"),
    dataEdges: edges.filter((edge) => edge.kind === "data"),
  };
}

export function groupProjectedCanvasAnchors(anchors: readonly ProjectedCanvasAnchor[]): ProjectedCanvasAnchorGroups {
  return {
    flowAnchors: anchors.filter((anchor) => anchor.kind === "flow-in" || anchor.kind === "flow-out"),
    routeHandles: anchors.filter((anchor) => anchor.kind === "route-out"),
    pointAnchors: anchors.filter((anchor) => anchor.kind === "state-in" || anchor.kind === "state-out"),
  };
}

export function projectCanvasEdges(document: GraphPayload | GraphDocument, options: ProjectCanvasProjectionOptions = {}): ProjectedCanvasEdge[] {
  const placements = buildNodePlacements(document, options);
  const flowRoutingLookup = buildFlowRoutingLookup(document);

  const flowEdges = document.edges
    .map((edge) => {
      const source = placements.get(edge.source);
      const target = placements.get(edge.target);
      const sourceNode = document.nodes[edge.source];
      const targetNode = document.nodes[edge.target];
      if (!source?.flowOut || !target?.flowIn) {
        return null;
      }
      const routing = flowRoutingLookup.get(`flow:${edge.source}->${edge.target}`);
      return {
        id: `flow:${edge.source}->${edge.target}`,
        kind: "flow" as const,
        source: edge.source,
        target: edge.target,
        routing,
        path: buildFlowPath(
          source.flowOut.x,
          source.flowOut.y,
          target.flowIn.x,
          target.flowIn.y,
          sourceNode?.ui.position.x,
          sourceNode?.ui.position.y,
          targetNode?.ui.position.x,
          targetNode?.ui.position.y,
          routing,
        ),
      };
    })
    .filter(Boolean) as ProjectedCanvasEdge[];

  const routeEdges = document.conditional_edges.flatMap((edge) => {
    const source = placements.get(edge.source);
    if (!source) {
      return [];
    }

    return Object.entries(edge.branches)
      .map(([branch, targetNodeId]) => {
        const routeSource = source.routeOutputs.find((candidate) => candidate.branch === branch);
        const target = placements.get(targetNodeId);
        const sourceNode = document.nodes[edge.source];
        const targetNode = document.nodes[targetNodeId];
        if (!routeSource || !target?.flowIn) {
          return null;
        }
        const routing = flowRoutingLookup.get(`route:${edge.source}:${branch}->${targetNodeId}`);
        return {
          id: `route:${edge.source}:${branch}->${targetNodeId}`,
          kind: "route" as const,
          source: edge.source,
          target: targetNodeId,
          branch,
          routing,
          path: buildFlowPath(
            routeSource.x,
            routeSource.y,
            target.flowIn.x,
            target.flowIn.y,
            sourceNode?.ui.position.x,
            sourceNode?.ui.position.y,
            targetNode?.ui.position.x,
            targetNode?.ui.position.y,
            routing,
          ),
        };
      })
      .filter(Boolean) as ProjectedCanvasEdge[];
  });

  const dataEdges = collectProjectedDataRelations(document)
    .map((relation) => {
      const source = placements.get(relation.source);
      const target = placements.get(relation.target);
      const sourceNode = document.nodes[relation.source];
      const targetNode = document.nodes[relation.target];
      const sourceAnchor = source?.stateOutputs.find((anchor) => anchor.stateKey === relation.state);
      const targetAnchor = target?.stateInputs.find((anchor) => anchor.stateKey === relation.state);
      if (!sourceAnchor || !targetAnchor) {
        return null;
      }

      return {
        id: `data:${relation.source}:${relation.state}->${relation.target}`,
        kind: "data" as const,
        source: relation.source,
        target: relation.target,
        color: document.state_schema[relation.state]?.color ?? undefined,
        state: relation.state,
        path: buildDataPath(
          sourceAnchor.x,
          sourceAnchor.y,
          targetAnchor.x,
          targetAnchor.y,
          sourceNode?.ui.position.x,
          sourceNode?.ui.position.y,
          targetNode?.ui.position.x,
          targetNode?.ui.position.y,
          relation.source === relation.target,
        ),
      };
    })
    .filter(Boolean) as ProjectedCanvasEdge[];

  return [...flowEdges, ...routeEdges, ...dataEdges];
}

export function projectCanvasAnchors(document: GraphPayload | GraphDocument, options: ProjectCanvasProjectionOptions = {}): ProjectedCanvasAnchor[] {
  const placements = buildNodePlacements(document, options);
  return Array.from(placements.entries()).flatMap(([nodeId, placement]) => [
    ...(placement.flowIn
      ? [
          {
            id: `${nodeId}:${placement.flowIn.id}`,
            nodeId,
            kind: "flow-in" as const,
            x: placement.flowIn.x,
            y: placement.flowIn.y,
            side: placement.flowIn.side,
          },
        ]
      : []),
    ...(placement.flowOut
      ? [
          {
            id: `${nodeId}:${placement.flowOut.id}`,
            nodeId,
            kind: "flow-out" as const,
            x: placement.flowOut.x,
            y: placement.flowOut.y,
            side: placement.flowOut.side,
          },
        ]
      : []),
    ...placement.stateInputs.map((anchor) => ({
      id: `${nodeId}:${anchor.id}`,
      nodeId,
      kind: "state-in" as const,
      x: anchor.x,
      y: anchor.y,
      side: anchor.side,
      color: document.state_schema[anchor.stateKey ?? ""]?.color ?? undefined,
      stateKey: anchor.stateKey,
    })),
    ...placement.stateOutputs.map((anchor) => ({
      id: `${nodeId}:${anchor.id}`,
      nodeId,
      kind: "state-out" as const,
      x: anchor.x,
      y: anchor.y,
      side: anchor.side,
      color: document.state_schema[anchor.stateKey ?? ""]?.color ?? undefined,
      stateKey: anchor.stateKey,
    })),
    ...placement.routeOutputs.map((anchor) => ({
      id: `${nodeId}:${anchor.id}`,
      nodeId,
      kind: "route-out" as const,
      x: anchor.x,
      y: anchor.y,
      side: anchor.side,
      branch: anchor.branch,
    })),
  ]);
}

function buildNodePlacements(document: GraphPayload | GraphDocument, options: ProjectCanvasProjectionOptions = {}) {
  return new Map(
    Object.entries(document.nodes).map(([nodeId, node]) => [
      nodeId,
      placeAnchors(buildAnchorModel(nodeId, node), buildNodeAnchorFrame(node, { size: options.measuredNodeSizes?.[nodeId] })),
    ]),
  );
}

function buildFlowPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  sourceNodeX?: number,
  sourceNodeY?: number,
  targetNodeX?: number,
  targetNodeY?: number,
  routing?: ProjectedCanvasEdgeRouting,
) {
  return buildSequenceFlowPath({
    sourceX: startX,
    sourceY: startY,
    targetX: endX,
    targetY: endY,
    sourceNodeX,
    sourceNodeY,
    targetNodeX,
    targetNodeY,
    sourceLaneIndex: routing?.sourceLaneIndex,
    sourceLaneCount: routing?.sourceLaneCount,
    targetLaneIndex: routing?.targetLaneIndex,
    targetLaneCount: routing?.targetLaneCount,
  });
}

type FlowRoutingDescriptor = {
  id: string;
  kind: "flow" | "route";
  source: string;
  target: string;
  branch?: string;
  sourceNodeX: number;
  sourceNodeY: number;
  targetNodeX: number;
  targetNodeY: number;
};

function buildFlowRoutingLookup(document: GraphPayload | GraphDocument) {
  const descriptors: FlowRoutingDescriptor[] = [
    ...document.edges.flatMap((edge) => {
      const sourceNode = document.nodes[edge.source];
      const targetNode = document.nodes[edge.target];
      if (!sourceNode || !targetNode) {
        return [];
      }
      return [
        {
          id: `flow:${edge.source}->${edge.target}`,
          kind: "flow" as const,
          source: edge.source,
          target: edge.target,
          sourceNodeX: sourceNode.ui.position.x,
          sourceNodeY: sourceNode.ui.position.y,
          targetNodeX: targetNode.ui.position.x,
          targetNodeY: targetNode.ui.position.y,
        },
      ];
    }),
    ...document.conditional_edges.flatMap((edge) =>
      Object.entries(edge.branches).flatMap(([branch, targetNodeId]) => {
        const sourceNode = document.nodes[edge.source];
        const targetNode = document.nodes[targetNodeId];
        if (!sourceNode || !targetNode) {
          return [];
        }
        return [
          {
            id: `route:${edge.source}:${branch}->${targetNodeId}`,
            kind: "route" as const,
            source: edge.source,
            target: targetNodeId,
            branch,
            sourceNodeX: sourceNode.ui.position.x,
            sourceNodeY: sourceNode.ui.position.y,
            targetNodeX: targetNode.ui.position.x,
            targetNodeY: targetNode.ui.position.y,
          },
        ];
      }),
    ),
  ];

  const routingByEdgeId = new Map<string, ProjectedCanvasEdgeRouting>();
  const outgoingGroups = new Map<string, FlowRoutingDescriptor[]>();
  const incomingGroups = new Map<string, FlowRoutingDescriptor[]>();

  for (const descriptor of descriptors) {
    const outgoing = outgoingGroups.get(descriptor.source) ?? [];
    outgoing.push(descriptor);
    outgoingGroups.set(descriptor.source, outgoing);

    const incoming = incomingGroups.get(descriptor.target) ?? [];
    incoming.push(descriptor);
    incomingGroups.set(descriptor.target, incoming);
  }

  for (const descriptorsBySource of outgoingGroups.values()) {
    descriptorsBySource.sort(compareOutgoingFlowDescriptors);
    descriptorsBySource.forEach((descriptor, index) => {
      routingByEdgeId.set(descriptor.id, {
        ...(routingByEdgeId.get(descriptor.id) ?? {
          sourceLaneIndex: 0,
          sourceLaneCount: descriptorsBySource.length,
          targetLaneIndex: 0,
          targetLaneCount: 1,
        }),
        sourceLaneIndex: index,
        sourceLaneCount: descriptorsBySource.length,
      });
    });
  }

  for (const descriptorsByTarget of incomingGroups.values()) {
    descriptorsByTarget.sort(compareIncomingFlowDescriptors);
    descriptorsByTarget.forEach((descriptor, index) => {
      routingByEdgeId.set(descriptor.id, {
        ...(routingByEdgeId.get(descriptor.id) ?? {
          sourceLaneIndex: 0,
          sourceLaneCount: 1,
          targetLaneIndex: 0,
          targetLaneCount: descriptorsByTarget.length,
        }),
        targetLaneIndex: index,
        targetLaneCount: descriptorsByTarget.length,
      });
    });
  }

  return routingByEdgeId;
}

function compareOutgoingFlowDescriptors(left: FlowRoutingDescriptor, right: FlowRoutingDescriptor) {
  return (
    compareNumbers(left.targetNodeY, right.targetNodeY) ||
    compareNumbers(left.targetNodeX, right.targetNodeX) ||
    compareNumbers(resolveFlowDescriptorKindPriority(left), resolveFlowDescriptorKindPriority(right)) ||
    compareNumbers(resolveFlowDescriptorBranchPriority(left.branch), resolveFlowDescriptorBranchPriority(right.branch)) ||
    left.target.localeCompare(right.target) ||
    left.id.localeCompare(right.id)
  );
}

function compareIncomingFlowDescriptors(left: FlowRoutingDescriptor, right: FlowRoutingDescriptor) {
  return (
    compareNumbers(left.sourceNodeY, right.sourceNodeY) ||
    compareNumbers(left.sourceNodeX, right.sourceNodeX) ||
    compareNumbers(resolveFlowDescriptorKindPriority(left), resolveFlowDescriptorKindPriority(right)) ||
    compareNumbers(resolveFlowDescriptorBranchPriority(left.branch), resolveFlowDescriptorBranchPriority(right.branch)) ||
    left.source.localeCompare(right.source) ||
    left.id.localeCompare(right.id)
  );
}

function compareNumbers(left: number, right: number) {
  return left - right;
}

function resolveFlowDescriptorKindPriority(descriptor: Pick<FlowRoutingDescriptor, "kind">) {
  return descriptor.kind === "flow" ? 0 : 1;
}

function resolveFlowDescriptorBranchPriority(branch: string | undefined) {
  const normalizedBranch = branch?.trim().toLowerCase() ?? "";
  if (normalizedBranch === "true") {
    return 0;
  }
  if (normalizedBranch === "false") {
    return 1;
  }
  if (normalizedBranch === "exhausted" || normalizedBranch === "exausted") {
    return 2;
  }
  return 3;
}

function buildDataPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  sourceNodeX?: number,
  sourceNodeY?: number,
  targetNodeX?: number,
  targetNodeY?: number,
  isSelfFeedback = false,
) {
  if (isSelfFeedback) {
    return buildSelfFeedbackFlowPath({
      sourceX: startX,
      sourceY: startY,
      targetX: endX,
      targetY: endY,
      sourceNodeX,
      sourceNodeY,
      targetNodeX,
      targetNodeY,
    });
  }

  if (endX <= startX) {
    return buildSequenceFlowPath({
      sourceX: startX,
      sourceY: startY,
      targetX: endX,
      targetY: endY,
      sourceNodeX,
      sourceNodeY,
      targetNodeX,
      targetNodeY,
    });
  }

  return buildConnectorCurvePath({
    sourceX: startX,
    sourceY: startY,
    targetX: endX,
    targetY: endY,
    sourceSide: "right",
    targetSide: "left",
  });
}

type ProjectedDataRelation = {
  source: string;
  target: string;
  state: string;
};

function collectProjectedDataRelations(document: GraphPayload | GraphDocument): ProjectedDataRelation[] {
  const successors = buildSuccessorMap(document);
  const reachability = new Map(
    Object.keys(document.nodes).map((nodeId) => [nodeId, collectReachableNodes(nodeId, successors)]),
  );
  const writersByState = new Map<string, string[]>();

  for (const [nodeId, node] of Object.entries(document.nodes)) {
    for (const binding of node.writes) {
      const current = writersByState.get(binding.state) ?? [];
      current.push(nodeId);
      writersByState.set(binding.state, current);
    }
  }

  const relations: ProjectedDataRelation[] = [];
  for (const [nodeId, node] of Object.entries(document.nodes)) {
    for (const binding of node.reads) {
      const candidateWriters = (writersByState.get(binding.state) ?? []).filter(
        (writerId) => writerId === nodeId || reachability.get(writerId)?.has(nodeId),
      );
      if (candidateWriters.length === 0) {
        continue;
      }
      relations.push(
        ...candidateWriters.map((writerId) => ({
          source: writerId,
          target: nodeId,
          state: binding.state,
        })),
      );
    }
  }

  return relations;
}

function buildSuccessorMap(document: GraphPayload | GraphDocument): Map<string, string[]> {
  const successors = new Map<string, string[]>();
  for (const nodeId of Object.keys(document.nodes)) {
    successors.set(nodeId, []);
  }
  for (const edge of document.edges) {
    successors.set(edge.source, [...(successors.get(edge.source) ?? []), edge.target]);
  }
  for (const conditionalEdge of document.conditional_edges) {
    for (const target of Object.values(conditionalEdge.branches)) {
      successors.set(conditionalEdge.source, [...(successors.get(conditionalEdge.source) ?? []), target]);
    }
  }
  return successors;
}

function collectReachableNodes(startNodeId: string, successors: Map<string, string[]>): Set<string> {
  const visited = new Set<string>();
  const stack = [...(successors.get(startNodeId) ?? [])];
  while (stack.length > 0) {
    const nextNodeId = stack.pop();
    if (!nextNodeId || visited.has(nextNodeId)) {
      continue;
    }
    visited.add(nextNodeId);
    stack.push(...(successors.get(nextNodeId) ?? []));
  }
  return visited;
}

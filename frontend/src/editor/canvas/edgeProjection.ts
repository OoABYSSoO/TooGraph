import type { GraphDocument, GraphNode, GraphPayload } from "../../types/node-system.ts";
import { buildAnchorModel } from "../anchors/anchorModel.ts";
import { placeAnchors, type NodeFrame } from "../anchors/anchorPlacement.ts";
import { buildConnectorCurvePath } from "./connectionCurvePath.ts";
import { buildSequenceFlowPath } from "./flowEdgePath.ts";

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

const DEFAULT_NODE_WIDTH = 460;
const CONDITION_NODE_WIDTH = 560;

export function projectCanvasEdges(document: GraphPayload | GraphDocument): ProjectedCanvasEdge[] {
  const placements = buildNodePlacements(document);

  const flowEdges = document.edges
    .map((edge) => {
      const source = placements.get(edge.source);
      const target = placements.get(edge.target);
      const sourceNode = document.nodes[edge.source];
      const targetNode = document.nodes[edge.target];
      if (!source?.flowOut || !target?.flowIn) {
        return null;
      }
      return {
        id: `flow:${edge.source}->${edge.target}`,
        kind: "flow" as const,
        source: edge.source,
        target: edge.target,
        path: buildFlowPath(
          source.flowOut.x,
          source.flowOut.y,
          target.flowIn.x,
          target.flowIn.y,
          sourceNode?.ui.position.x,
          sourceNode?.ui.position.y,
          targetNode?.ui.position.x,
          targetNode?.ui.position.y,
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
        return {
          id: `route:${edge.source}:${branch}->${targetNodeId}`,
          kind: "route" as const,
          source: edge.source,
          target: targetNodeId,
          branch,
          path: buildFlowPath(
            routeSource.x,
            routeSource.y,
            target.flowIn.x,
            target.flowIn.y,
            sourceNode?.ui.position.x,
            sourceNode?.ui.position.y,
            targetNode?.ui.position.x,
            targetNode?.ui.position.y,
          ),
        };
      })
      .filter(Boolean) as ProjectedCanvasEdge[];
  });

  const dataEdges = collectProjectedDataRelations(document)
    .map((relation) => {
      const source = placements.get(relation.source);
      const target = placements.get(relation.target);
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
        path: buildDataPath(sourceAnchor.x, sourceAnchor.y, targetAnchor.x, targetAnchor.y),
      };
    })
    .filter(Boolean) as ProjectedCanvasEdge[];

  return [...flowEdges, ...routeEdges, ...dataEdges];
}

export function projectCanvasAnchors(document: GraphPayload | GraphDocument): ProjectedCanvasAnchor[] {
  const placements = buildNodePlacements(document);
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

function buildNodePlacements(document: GraphPayload | GraphDocument) {
  return new Map(
    Object.entries(document.nodes).map(([nodeId, node]) => [
      nodeId,
      placeAnchors(buildAnchorModel(nodeId, node), buildNodeFrame(node)),
    ]),
  );
}

function buildNodeFrame(node: GraphNode): NodeFrame {
  return {
    x: node.ui.position.x,
    y: node.ui.position.y,
    width: node.kind === "condition" ? CONDITION_NODE_WIDTH : DEFAULT_NODE_WIDTH,
    headerHeight: 68,
    bodyTop: 116,
    rowGap: 44,
    footerTop: node.kind === "condition" ? 192 : 0,
  };
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
  });
}

function buildDataPath(startX: number, startY: number, endX: number, endY: number) {
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
        (writerId) => writerId !== nodeId && reachability.get(writerId)?.has(nodeId),
      );
      const remainingWriters = candidateWriters.filter(
        (writerId) =>
          !candidateWriters.some(
            (otherWriterId) =>
              otherWriterId !== writerId &&
              reachability.get(writerId)?.has(otherWriterId) &&
              reachability.get(otherWriterId)?.has(nodeId),
          ),
      );
      if (remainingWriters.length !== 1) {
        continue;
      }
      relations.push({
        source: remainingWriters[0]!,
        target: nodeId,
        state: binding.state,
      });
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

import type { GraphDocument, GraphNode, GraphPayload } from "../../types/node-system.ts";
import { buildAnchorModel } from "../anchors/anchorModel.ts";
import { placeAnchors, type NodeFrame } from "../anchors/anchorPlacement.ts";

export type ProjectedCanvasEdge = {
  id: string;
  kind: "flow" | "route";
  source: string;
  target: string;
  path: string;
};

export type ProjectedCanvasAnchor = {
  id: string;
  nodeId: string;
  kind: "flow-in" | "flow-out" | "state-in" | "state-out" | "route-out";
  x: number;
  y: number;
  stateKey?: string;
  branch?: string;
};

const DEFAULT_NODE_WIDTH = 460;

export function projectCanvasEdges(document: GraphPayload | GraphDocument): ProjectedCanvasEdge[] {
  const placements = buildNodePlacements(document);

  const flowEdges = document.edges
    .map((edge) => {
      const source = placements.get(edge.source);
      const target = placements.get(edge.target);
      if (!source?.flowOut || !target?.flowIn) {
        return null;
      }
      return {
        id: `flow:${edge.source}->${edge.target}`,
        kind: "flow" as const,
        source: edge.source,
        target: edge.target,
        path: buildFlowPath(source.flowOut.x, source.flowOut.y, target.flowIn.x, target.flowIn.y),
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
        if (!routeSource || !target?.flowIn) {
          return null;
        }
        return {
          id: `route:${edge.source}:${branch}->${targetNodeId}`,
          kind: "route" as const,
          source: edge.source,
          target: targetNodeId,
          path: buildRoutePath(routeSource.x, routeSource.y, target.flowIn.x, target.flowIn.y, source.routeOutputs.indexOf(routeSource)),
        };
      })
      .filter(Boolean) as ProjectedCanvasEdge[];
  });

  return [...flowEdges, ...routeEdges];
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
          },
        ]
      : []),
    ...placement.stateInputs.map((anchor) => ({
      id: `${nodeId}:${anchor.id}`,
      nodeId,
      kind: "state-in" as const,
      x: anchor.x,
      y: anchor.y,
      stateKey: anchor.stateKey,
    })),
    ...placement.stateOutputs.map((anchor) => ({
      id: `${nodeId}:${anchor.id}`,
      nodeId,
      kind: "state-out" as const,
      x: anchor.x,
      y: anchor.y,
      stateKey: anchor.stateKey,
    })),
    ...placement.routeOutputs.map((anchor) => ({
      id: `${nodeId}:${anchor.id}`,
      nodeId,
      kind: "route-out" as const,
      x: anchor.x,
      y: anchor.y,
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
    width: DEFAULT_NODE_WIDTH,
    headerHeight: 68,
    bodyTop: 116,
    rowGap: 44,
    footerTop: node.kind === "condition" ? 270 : 0,
  };
}

function buildFlowPath(startX: number, startY: number, endX: number, endY: number) {
  const midX = startX + (endX - startX) / 2;
  return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
}

function buildRoutePath(startX: number, startY: number, endX: number, endY: number, routeIndex: number) {
  const offsetX = startX + 28 + routeIndex * 18;
  const midY = startY <= endY ? startY + 32 : startY - 32;
  return `M ${startX} ${startY} L ${offsetX} ${startY} L ${offsetX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
}

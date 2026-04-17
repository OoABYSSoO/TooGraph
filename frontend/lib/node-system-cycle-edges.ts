import type { CanonicalGraphPayload } from "./node-system-canonical.ts";

type TraversalEdge = {
  id: string;
  source: string;
  target: string;
};

function collectTraversalEdges(graph: CanonicalGraphPayload): TraversalEdge[] {
  return [
    ...graph.edges.map((edge) => ({
      id: `edge:${edge.source}:${edge.sourceHandle}:${edge.target}:${edge.targetHandle}`,
      source: edge.source,
      target: edge.target,
    })),
    ...graph.conditional_edges.flatMap((edge) =>
      Object.entries(edge.branches).map(([branchKey, target]) => ({
        id: `conditional:${edge.source}:${branchKey}:${target}`,
        source: edge.source,
        target,
      })),
    ),
  ];
}

export function collectCycleBackEdgeIds(graph: CanonicalGraphPayload): Set<string> {
  const traversalEdges = collectTraversalEdges(graph);
  const edgesBySource = new Map<string, TraversalEdge[]>();
  for (const edge of traversalEdges) {
    const current = edgesBySource.get(edge.source) ?? [];
    current.push(edge);
    edgesBySource.set(edge.source, current);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const colorByNode = new Map<string, number>();
  const backEdgeIds = new Set<string>();
  const allNodeIds = new Set([
    ...Object.keys(graph.nodes),
    ...traversalEdges.map((edge) => edge.source),
    ...traversalEdges.map((edge) => edge.target),
  ]);

  function visit(nodeId: string) {
    colorByNode.set(nodeId, GRAY);
    for (const edge of edgesBySource.get(nodeId) ?? []) {
      const neighborColor = colorByNode.get(edge.target) ?? WHITE;
      if (neighborColor === GRAY) {
        backEdgeIds.add(edge.id);
        continue;
      }
      if (neighborColor === WHITE) {
        visit(edge.target);
      }
    }
    colorByNode.set(nodeId, BLACK);
  }

  for (const nodeId of allNodeIds) {
    if ((colorByNode.get(nodeId) ?? WHITE) === WHITE) {
      visit(nodeId);
    }
  }

  return backEdgeIds;
}

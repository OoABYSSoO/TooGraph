import type { CanonicalGraphPayload } from "./node-system-canonical.ts";

export type ProjectedDataRelation = {
  source: string;
  target: string;
  state: string;
};

export function collectProjectedDataRelations(graph: CanonicalGraphPayload): ProjectedDataRelation[] {
  const successors = buildSuccessorMap(graph);
  const reachability = new Map(
    Object.keys(graph.nodes).map((nodeId) => [nodeId, collectReachableNodes(nodeId, successors)]),
  );
  const writersByState = new Map<string, string[]>();

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    for (const binding of node.writes) {
      const current = writersByState.get(binding.state) ?? [];
      current.push(nodeId);
      writersByState.set(binding.state, current);
    }
  }

  const relations: ProjectedDataRelation[] = [];
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
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
        source: remainingWriters[0],
        target: nodeId,
        state: binding.state,
      });
    }
  }

  return relations;
}

function buildSuccessorMap(graph: CanonicalGraphPayload): Map<string, string[]> {
  const successors = new Map<string, string[]>();
  for (const nodeId of Object.keys(graph.nodes)) {
    successors.set(nodeId, []);
  }
  for (const edge of graph.edges) {
    successors.set(edge.source, [...(successors.get(edge.source) ?? []), edge.target]);
  }
  for (const conditionalEdge of graph.conditional_edges) {
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

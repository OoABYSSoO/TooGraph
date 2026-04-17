import type { CanonicalEdge, CanonicalGraphPayload } from "./node-system-canonical.ts";
import { listEditorInputPortsFromCanonicalNode, listEditorOutputPortsFromCanonicalNode } from "./node-system-canonical.ts";
import { FLOW_SOURCE_HANDLE, FLOW_TARGET_HANDLE } from "./node-system-route-handles.ts";

export type CanonicalOrdinaryEdgePresentation = {
  id: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  projectedState: string | null;
};

export function resolveCanonicalOrdinaryEdgeProjectedState(
  graph: CanonicalGraphPayload,
  edge: Pick<CanonicalEdge, "source" | "target">,
): string | null {
  const sourceNode = graph.nodes[edge.source];
  const targetNode = graph.nodes[edge.target];
  if (!sourceNode || !targetNode) {
    return null;
  }

  const sourceStates = new Set(
    listEditorOutputPortsFromCanonicalNode(sourceNode, graph.state_schema).map((port) => port.key),
  );
  const targetStates = new Set(
    listEditorInputPortsFromCanonicalNode(targetNode, graph.state_schema).map((port) => port.key),
  );
  const projectedStates = [...sourceStates].filter((stateKey) => targetStates.has(stateKey));
  return projectedStates.length === 1 ? projectedStates[0] : null;
}

export function resolveCanonicalOrdinaryEdgePresentation(
  graph: CanonicalGraphPayload,
  edge: Pick<CanonicalEdge, "source" | "target">,
): CanonicalOrdinaryEdgePresentation {
  const projectedState = resolveCanonicalOrdinaryEdgeProjectedState(graph, edge);
  if (!projectedState) {
    return {
      id: buildCanonicalOrdinaryEdgeIdFromNodes(edge.source, edge.target),
      sourceHandle: FLOW_SOURCE_HANDLE,
      targetHandle: FLOW_TARGET_HANDLE,
      projectedState: null,
    };
  }

  return {
    id: buildCanonicalOrdinaryEdgeIdFromNodes(edge.source, edge.target),
    sourceHandle: FLOW_SOURCE_HANDLE,
    targetHandle: FLOW_TARGET_HANDLE,
    projectedState,
  };
}

export function buildCanonicalOrdinaryEdgeId(
  _graph: CanonicalGraphPayload,
  edge: Pick<CanonicalEdge, "source" | "target">,
): string {
  return buildCanonicalOrdinaryEdgeIdFromNodes(edge.source, edge.target);
}

function buildCanonicalOrdinaryEdgeIdFromNodes(source: string, target: string): string {
  return `edge:${source}:${target}`;
}

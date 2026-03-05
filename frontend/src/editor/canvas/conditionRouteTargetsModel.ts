import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";

export type ConditionRouteTargets = Record<string, string | null>;

export function buildConditionRouteTargets(document: GraphPayload | GraphDocument, nodeId: string): ConditionRouteTargets {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "condition") {
    return {};
  }

  const routeBranches = document.conditional_edges.find((edge) => edge.source === nodeId)?.branches ?? {};
  return Object.fromEntries(
    node.config.branches.map((branchKey) => {
      const targetNodeId = routeBranches[branchKey];
      const targetNode = targetNodeId ? document.nodes[targetNodeId] : null;
      return [branchKey, targetNode?.name ?? targetNodeId ?? null];
    }),
  );
}

export function buildConditionRouteTargetsByNodeId(document: GraphPayload | GraphDocument): Record<string, ConditionRouteTargets> {
  return Object.fromEntries(
    Object.entries(document.nodes)
      .filter(([, node]) => node.kind === "condition")
      .map(([nodeId]) => [nodeId, buildConditionRouteTargets(document, nodeId)]),
  );
}

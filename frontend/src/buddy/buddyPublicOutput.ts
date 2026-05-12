import type { ConditionalEdge, GraphEdge, GraphPayload } from "../types/node-system.ts";

export type BuddyPublicOutputBinding = {
  outputNodeId: string;
  outputNodeName: string;
  stateKey: string;
  stateName: string;
  stateType: string;
  displayMode: string;
  upstreamNodeIds: string[];
};

export type BuddyPublicOutputMessageKind = "text" | "card";

export function buildBuddyPublicOutputBindings(
  graph: Pick<GraphPayload, "state_schema" | "nodes" | "edges" | "conditional_edges">,
): BuddyPublicOutputBinding[] {
  return Object.entries(graph.nodes)
    .filter(([, node]) => node.kind === "output")
    .flatMap(([outputNodeId, node]) => {
      const read = node.reads[0];
      const stateKey = typeof read?.state === "string" ? read.state.trim() : "";
      if (!stateKey || node.reads.length !== 1) {
        return [];
      }
      const stateDefinition = graph.state_schema[stateKey];
      return [
        {
          outputNodeId,
          outputNodeName: node.name?.trim() || outputNodeId,
          stateKey,
          stateName: stateDefinition?.name?.trim() || stateKey,
          stateType: stateDefinition?.type?.trim() || "text",
          displayMode: normalizeDisplayMode(node.config?.displayMode),
          upstreamNodeIds: resolveDirectUpstreamNodeIds(graph, outputNodeId),
        },
      ];
    });
}

export function resolveBuddyPublicOutputMessageKind(input: {
  stateType: string;
  displayMode: string | null | undefined;
}): BuddyPublicOutputMessageKind {
  const stateType = input.stateType.trim();
  const displayMode = String(input.displayMode ?? "").trim();
  if (stateType === "markdown" || stateType === "text" || displayMode === "markdown" || displayMode === "plain") {
    return "text";
  }
  return "card";
}

function normalizeDisplayMode(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "auto";
}

function resolveDirectUpstreamNodeIds(
  graph: { edges?: GraphEdge[]; conditional_edges?: ConditionalEdge[] },
  outputNodeId: string,
) {
  const upstream = new Set<string>();
  for (const edge of graph.edges ?? []) {
    if (edge.target === outputNodeId && edge.source) {
      upstream.add(edge.source);
    }
  }
  for (const route of graph.conditional_edges ?? []) {
    for (const target of Object.values(route.branches ?? {})) {
      if (target === outputNodeId && route.source) {
        upstream.add(route.source);
      }
    }
  }
  return Array.from(upstream);
}

import type { GraphDocument, GraphPayload } from "@/types/node-system";

type GraphLike = GraphPayload | GraphDocument;

export function sortStateKeysByFirstAppearance(keys: string[], document: GraphLike) {
  const firstAppearanceOrder = buildStateFirstAppearanceOrder(document);
  return [...keys].sort((left, right) => compareStateKeys(left, right, firstAppearanceOrder));
}

export function sortHumanReviewStateKeys(keys: string[], document: GraphLike) {
  const firstAppearanceOrder = buildStateFirstAppearanceOrder(document);
  return [...keys].sort((left, right) => {
    const leftIsHumanInput = isUnlinkedAgentInputState(document, left);
    const rightIsHumanInput = isUnlinkedAgentInputState(document, right);
    if (leftIsHumanInput !== rightIsHumanInput) {
      return leftIsHumanInput ? -1 : 1;
    }
    return compareStateKeys(left, right, firstAppearanceOrder);
  });
}

export function isUnlinkedAgentInputState(document: GraphLike, stateKey: string) {
  let hasAgentReader = false;
  let hasWriter = false;
  for (const node of Object.values(document.nodes)) {
    if (node.kind === "agent" && node.reads.some((read) => read.state === stateKey)) {
      hasAgentReader = true;
    }
    if (node.writes.some((write) => write.state === stateKey)) {
      hasWriter = true;
    }
  }
  return hasAgentReader && !hasWriter;
}

function buildStateFirstAppearanceOrder(document: GraphLike) {
  const order = new Map<string, number>();
  for (const nodeId of resolveExecutionNodeOrder(document)) {
    const node = document.nodes[nodeId];
    if (!node) {
      continue;
    }
    for (const binding of [...node.reads, ...node.writes]) {
      if (document.state_schema[binding.state] && !order.has(binding.state)) {
        order.set(binding.state, order.size);
      }
    }
  }

  for (const stateKey of Object.keys(document.state_schema)) {
    if (!order.has(stateKey)) {
      order.set(stateKey, order.size);
    }
  }

  return order;
}

function resolveExecutionNodeOrder(document: GraphLike) {
  const nodeIds = Object.keys(document.nodes);
  const nodeIdSet = new Set(nodeIds);
  const incomingCount = new Map(nodeIds.map((nodeId) => [nodeId, 0]));
  const outgoingByNodeId = new Map(nodeIds.map((nodeId) => [nodeId, [] as string[]]));

  const registerEdge = (source: string, target: string) => {
    if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) {
      return;
    }
    outgoingByNodeId.get(source)?.push(target);
    incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
  };

  for (const edge of document.edges) {
    registerEdge(edge.source, edge.target);
  }
  for (const conditionalEdge of document.conditional_edges) {
    for (const target of Object.values(conditionalEdge.branches)) {
      registerEdge(conditionalEdge.source, target);
    }
  }

  const queue = nodeIds.filter((nodeId) => (incomingCount.get(nodeId) ?? 0) === 0);
  const visited = new Set<string>();
  const orderedNodeIds: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    orderedNodeIds.push(nodeId);

    for (const target of outgoingByNodeId.get(nodeId) ?? []) {
      const nextIncomingCount = (incomingCount.get(target) ?? 0) - 1;
      incomingCount.set(target, nextIncomingCount);
      if (nextIncomingCount === 0) {
        queue.push(target);
      }
    }
  }

  return [...orderedNodeIds, ...nodeIds.filter((nodeId) => !visited.has(nodeId))];
}

function compareStateKeys(left: string, right: string, firstAppearanceOrder: Map<string, number>) {
  const leftOrder = firstAppearanceOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = firstAppearanceOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.localeCompare(right);
}

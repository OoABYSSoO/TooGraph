import { toRaw } from "vue";

import { applyConditionBranchMapping, createConditionBranchKey } from "./condition-branch-mapping.ts";

import type { AgentNode, ConditionNode, GraphDocument, GraphPayload, InputNode, OutputNode, TemplateRecord } from "../types/node-system.ts";

export function createDraftFromTemplate(template: TemplateRecord): GraphPayload {
  const rawTemplate = toRaw(template) as TemplateRecord;

  return cloneGraphDocument({
    graph_id: null,
    name: rawTemplate.default_graph_name,
    state_schema: rawTemplate.state_schema,
    nodes: rawTemplate.nodes,
    edges: rawTemplate.edges,
    conditional_edges: rawTemplate.conditional_edges,
    metadata: rawTemplate.metadata,
  });
}

export function createEmptyDraftGraph(name = "Untitled Graph"): GraphPayload {
  return {
    graph_id: null,
    name,
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

export function cloneGraphDocument<T extends GraphPayload | GraphDocument>(document: T): T {
  const rawDocument = toRaw(document) as T;
  return structuredClone(rawDocument);
}

export function updateOutputNodeConfigInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  updater: (current: OutputNode["config"]) => OutputNode["config"],
): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "output") {
    return document;
  }

  const nextConfig = updater(node.config);
  if (JSON.stringify(nextConfig) === JSON.stringify(node.config)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const nextNode = nextDocument.nodes[nodeId];
  if (nextNode.kind !== "output") {
    return document;
  }

  nextNode.config = nextConfig;
  return nextDocument;
}

export function updateAgentNodeConfigInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  updater: (current: AgentNode["config"]) => AgentNode["config"],
): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "agent") {
    return document;
  }

  const nextConfig = updater(node.config);
  if (JSON.stringify(nextConfig) === JSON.stringify(node.config)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const nextNode = nextDocument.nodes[nodeId];
  if (nextNode.kind !== "agent") {
    return document;
  }

  nextNode.config = nextConfig;
  return nextDocument;
}

export function updateConditionNodeConfigInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  updater: (current: ConditionNode["config"]) => ConditionNode["config"],
): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "condition") {
    return document;
  }

  const nextConfig = updater(node.config);
  if (JSON.stringify(nextConfig) === JSON.stringify(node.config)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const nextNode = nextDocument.nodes[nodeId];
  if (nextNode.kind !== "condition") {
    return document;
  }

  nextNode.config = nextConfig;
  return nextDocument;
}

export function updateConditionBranchInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  currentKey: string,
  nextKey: string,
  mappingKeys: string[],
): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "condition") {
    return document;
  }

  const normalizedNextKey = nextKey.trim();
  if (!normalizedNextKey || !node.config.branches.includes(currentKey)) {
    return document;
  }
  if (normalizedNextKey !== currentKey && node.config.branches.includes(normalizedNextKey)) {
    return document;
  }

  const nextBranches =
    normalizedNextKey === currentKey
      ? node.config.branches
      : node.config.branches.map((branchKey) => (branchKey === currentKey ? normalizedNextKey : branchKey));
  const nextBranchMapping = applyConditionBranchMapping(node.config.branchMapping, currentKey, normalizedNextKey, mappingKeys);
  const nextConditionalEdges =
    normalizedNextKey === currentKey
      ? document.conditional_edges
      : document.conditional_edges.map((edge) => {
          if (edge.source !== nodeId || !Object.prototype.hasOwnProperty.call(edge.branches, currentKey)) {
            return edge;
          }
          return {
            ...edge,
            branches: Object.fromEntries(
              Object.entries(edge.branches).map(([branchKey, target]) => [
                branchKey === currentKey ? normalizedNextKey : branchKey,
                target,
              ]),
            ),
          };
        });

  const branchesChanged = JSON.stringify(nextBranches) !== JSON.stringify(node.config.branches);
  const branchMappingChanged = JSON.stringify(nextBranchMapping) !== JSON.stringify(node.config.branchMapping);
  const conditionalEdgesChanged = JSON.stringify(nextConditionalEdges) !== JSON.stringify(document.conditional_edges);

  if (!branchesChanged && !branchMappingChanged && !conditionalEdgesChanged) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const nextNode = nextDocument.nodes[nodeId];
  if (nextNode.kind !== "condition") {
    return document;
  }

  nextNode.config.branches = nextBranches;
  nextNode.config.branchMapping = nextBranchMapping;
  nextDocument.conditional_edges = nextConditionalEdges;
  return nextDocument;
}

export function addConditionBranchToDocument<T extends GraphPayload | GraphDocument>(document: T, nodeId: string): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "condition") {
    return document;
  }

  const nextBranchKey = createConditionBranchKey(node.config.branches);
  const nextDocument = cloneGraphDocument(document);
  const nextNode = nextDocument.nodes[nodeId];
  if (nextNode.kind !== "condition") {
    return document;
  }

  nextNode.config.branches = [...nextNode.config.branches, nextBranchKey];
  return nextDocument;
}

export function removeConditionBranchFromDocument<T extends GraphPayload | GraphDocument>(document: T, nodeId: string, branchKey: string): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "condition") {
    return document;
  }

  if (!node.config.branches.includes(branchKey) || node.config.branches.length <= 1) {
    return document;
  }

  const nextBranches = node.config.branches.filter((candidate) => candidate !== branchKey);
  const nextBranchMapping = Object.fromEntries(
    Object.entries(node.config.branchMapping).filter(([, mappedBranchKey]) => mappedBranchKey !== branchKey),
  );
  const nextConditionalEdges = document.conditional_edges
    .map((edge) => {
      if (edge.source !== nodeId || !Object.prototype.hasOwnProperty.call(edge.branches, branchKey)) {
        return edge;
      }

      const nextEdgeBranches = Object.fromEntries(
        Object.entries(edge.branches).filter(([candidateBranchKey]) => candidateBranchKey !== branchKey),
      );

      return {
        ...edge,
        branches: nextEdgeBranches,
      };
    })
    .filter((edge) => Object.keys(edge.branches).length > 0);

  const nextDocument = cloneGraphDocument(document);
  const nextNode = nextDocument.nodes[nodeId];
  if (nextNode.kind !== "condition") {
    return document;
  }

  nextNode.config.branches = nextBranches;
  nextNode.config.branchMapping = nextBranchMapping;
  nextDocument.conditional_edges = nextConditionalEdges;
  return nextDocument;
}

export function updateInputNodeConfigInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  updater: (current: InputNode["config"]) => InputNode["config"],
): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "input") {
    return document;
  }

  const nextConfig = updater(node.config);
  if (JSON.stringify(nextConfig) === JSON.stringify(node.config)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const nextNode = nextDocument.nodes[nodeId];
  if (nextNode.kind !== "input") {
    return document;
  }

  nextNode.config = nextConfig;
  return nextDocument;
}

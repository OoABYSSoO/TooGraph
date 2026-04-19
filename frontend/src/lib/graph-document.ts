import { toRaw } from "vue";

import { applyConditionBranchMapping, createConditionBranchKey } from "./condition-branch-mapping.ts";
import {
  canConnectConditionRoute,
  canConnectFlowNodes,
  canConnectStateBinding,
  canReconnectConditionRoute,
  canReconnectFlowEdge,
} from "./graph-connections.ts";

import type { AgentNode, ConditionNode, GraphDocument, GraphNode, GraphPayload, InputNode, OutputNode, TemplateRecord } from "../types/node-system.ts";

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
  return structuredClone(normalizeCloneValue(document));
}

function normalizeCloneValue<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const rawValue = toRaw(value) as T;
  if (rawValue === null || typeof rawValue !== "object") {
    return rawValue;
  }

  const existing = seen.get(rawValue as object);
  if (existing) {
    return existing as T;
  }

  if (Array.isArray(rawValue)) {
    const normalizedArray: unknown[] = [];
    seen.set(rawValue as object, normalizedArray);
    for (const entry of rawValue) {
      normalizedArray.push(normalizeCloneValue(entry, seen));
    }
    return normalizedArray as T;
  }

  const normalizedObject: Record<string, unknown> = {};
  seen.set(rawValue as object, normalizedObject);
  for (const [key, entry] of Object.entries(rawValue)) {
    normalizedObject[key] = normalizeCloneValue(entry, seen);
  }
  return normalizedObject as T;
}

function areSkillKeyListsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((skillKey, index) => skillKey === right[index]);
}

function isKnowledgeBaseSkill(skillKey: string) {
  return skillKey === "search_knowledge_base";
}

function pickAgentKnowledgeQueryStateKey(
  node: AgentNode,
  stateSchema: Record<string, GraphPayload["state_schema"][string]>,
  knowledgeBaseStateKey: string,
) {
  const candidateReads = node.reads.filter((binding) => binding.state !== knowledgeBaseStateKey).filter((binding) => {
    const stateDefinition = stateSchema[binding.state];
    return stateDefinition?.type === "text" || stateDefinition?.type === "any";
  });
  const preferredKeys = ["question", "query", "input"];

  for (const key of preferredKeys) {
    if (candidateReads.some((binding) => binding.state === key)) {
      return key;
    }
  }

  const preferredTextRead = candidateReads.find((binding) => binding.required) ?? candidateReads[0];
  return preferredTextRead?.state ?? null;
}

function syncKnowledgeBaseSkillOnAgentNode(
  node: AgentNode,
  stateSchema: GraphPayload["state_schema"],
): AgentNode {
  const skillsWithoutKnowledgeBase = node.config.skills.filter((skillKey) => !isKnowledgeBaseSkill(skillKey));
  const knowledgeBaseStateKeys = Array.from(
    new Set(
      node.reads
        .filter((binding) => stateSchema[binding.state]?.type === "knowledge_base")
        .map((binding) => binding.state),
    ),
  );

  if (knowledgeBaseStateKeys.length !== 1) {
    return areSkillKeyListsEqual(skillsWithoutKnowledgeBase, node.config.skills)
      ? node
      : {
          ...node,
          config: {
            ...node.config,
            skills: skillsWithoutKnowledgeBase,
          },
        };
  }

  const queryStateKey = pickAgentKnowledgeQueryStateKey(node, stateSchema, knowledgeBaseStateKeys[0]);
  if (!queryStateKey) {
    return areSkillKeyListsEqual(skillsWithoutKnowledgeBase, node.config.skills)
      ? node
      : {
          ...node,
          config: {
            ...node.config,
            skills: skillsWithoutKnowledgeBase,
          },
        };
  }

  void queryStateKey;
  const nextSkills = [...skillsWithoutKnowledgeBase, "search_knowledge_base"];
  return areSkillKeyListsEqual(nextSkills, node.config.skills)
    ? node
    : {
        ...node,
        config: {
          ...node.config,
          skills: nextSkills,
        },
      };
}

export function syncKnowledgeBaseSkillsInDocument<T extends GraphPayload | GraphDocument>(document: T): T {
  let nextDocument: T | null = null;

  for (const [nodeId, node] of Object.entries(document.nodes)) {
    if (node.kind !== "agent") {
      continue;
    }

    const nextNode = syncKnowledgeBaseSkillOnAgentNode(node, document.state_schema);
    if (nextNode === node) {
      continue;
    }

    if (!nextDocument) {
      nextDocument = cloneGraphDocument(document);
    }
    nextDocument.nodes[nodeId] = nextNode;
  }

  return nextDocument ?? document;
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

export function updateNodeMetadataInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  updater: (current: Pick<GraphNode, "name" | "description">) => Pick<GraphNode, "name" | "description">,
): T {
  const node = document.nodes[nodeId];
  if (!node) {
    return document;
  }

  const nextMetadata = updater({
    name: node.name,
    description: node.description,
  });
  if (nextMetadata.name === node.name && nextMetadata.description === node.description) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  nextDocument.nodes[nodeId].name = nextMetadata.name;
  nextDocument.nodes[nodeId].description = nextMetadata.description;
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

export function connectFlowNodesInDocument<T extends GraphPayload | GraphDocument>(document: T, sourceNodeId: string, targetNodeId: string): T {
  if (!canConnectFlowNodes(document, sourceNodeId, targetNodeId)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  nextDocument.edges = [...nextDocument.edges, { source: sourceNodeId, target: targetNodeId }];
  return nextDocument;
}

export function connectStateBindingInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  sourceNodeId: string,
  sourceStateKey: string,
  targetNodeId: string,
  targetStateKey: string,
): T {
  if (!canConnectStateBinding(document, sourceNodeId, sourceStateKey, targetNodeId, targetStateKey)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const nextTargetNode = nextDocument.nodes[targetNodeId];
  const targetBindingIndex = nextTargetNode.reads.findIndex((binding) => binding.state === targetStateKey);
  if (targetBindingIndex === -1) {
    return document;
  }

  nextTargetNode.reads[targetBindingIndex] = {
    ...nextTargetNode.reads[targetBindingIndex],
    state: sourceStateKey,
  };

  return syncKnowledgeBaseSkillsInDocument(nextDocument);
}

export function connectConditionRouteInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  sourceNodeId: string,
  branchKey: string,
  targetNodeId: string,
): T {
  if (!canConnectConditionRoute(document, sourceNodeId, branchKey, targetNodeId)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const edgeIndex = nextDocument.conditional_edges.findIndex((edge) => edge.source === sourceNodeId);
  if (edgeIndex === -1) {
    nextDocument.conditional_edges = [
      ...nextDocument.conditional_edges,
      {
        source: sourceNodeId,
        branches: {
          [branchKey]: targetNodeId,
        },
      },
    ];
    return nextDocument;
  }

  const nextEdge = nextDocument.conditional_edges[edgeIndex];
  nextDocument.conditional_edges[edgeIndex] = {
    ...nextEdge,
    branches: {
      ...nextEdge.branches,
      [branchKey]: targetNodeId,
    },
  };
  return nextDocument;
}

export function removeFlowEdgeFromDocument<T extends GraphPayload | GraphDocument>(document: T, sourceNodeId: string, targetNodeId: string): T {
  if (!document.edges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  nextDocument.edges = nextDocument.edges.filter((edge) => !(edge.source === sourceNodeId && edge.target === targetNodeId));
  return nextDocument;
}

export function reconnectFlowEdgeInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  sourceNodeId: string,
  currentTargetNodeId: string,
  nextTargetNodeId: string,
): T {
  if (!canReconnectFlowEdge(document, sourceNodeId, currentTargetNodeId, nextTargetNodeId)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  nextDocument.edges = nextDocument.edges.map((edge) =>
    edge.source === sourceNodeId && edge.target === currentTargetNodeId
      ? {
          source: sourceNodeId,
          target: nextTargetNodeId,
        }
      : edge,
  );
  return nextDocument;
}

export function removeConditionRouteFromDocument<T extends GraphPayload | GraphDocument>(document: T, sourceNodeId: string, branchKey: string): T {
  const edgeIndex = document.conditional_edges.findIndex(
    (edge) => edge.source === sourceNodeId && Object.prototype.hasOwnProperty.call(edge.branches, branchKey),
  );
  if (edgeIndex === -1) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const nextEdge = nextDocument.conditional_edges[edgeIndex];
  const nextBranches = Object.fromEntries(
    Object.entries(nextEdge.branches).filter(([candidateBranchKey]) => candidateBranchKey !== branchKey),
  );

  if (Object.keys(nextBranches).length === 0) {
    nextDocument.conditional_edges.splice(edgeIndex, 1);
    return nextDocument;
  }

  nextDocument.conditional_edges[edgeIndex] = {
    ...nextEdge,
    branches: nextBranches,
  };
  return nextDocument;
}

export function reconnectConditionRouteInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  sourceNodeId: string,
  branchKey: string,
  nextTargetNodeId: string,
): T {
  const currentTargetNodeId = document.conditional_edges.find((edge) => edge.source === sourceNodeId)?.branches[branchKey];
  if (
    typeof currentTargetNodeId !== "string" ||
    !canReconnectConditionRoute(document, sourceNodeId, branchKey, currentTargetNodeId, nextTargetNodeId)
  ) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const edgeIndex = nextDocument.conditional_edges.findIndex((edge) => edge.source === sourceNodeId);
  if (edgeIndex === -1) {
    return document;
  }

  const nextEdge = nextDocument.conditional_edges[edgeIndex];
  nextDocument.conditional_edges[edgeIndex] = {
    ...nextEdge,
    branches: {
      ...nextEdge.branches,
      [branchKey]: nextTargetNodeId,
    },
  };
  return nextDocument;
}

export function removeNodeFromDocument<T extends GraphPayload | GraphDocument>(document: T, nodeId: string): T {
  if (!document.nodes[nodeId]) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  delete nextDocument.nodes[nodeId];
  nextDocument.edges = nextDocument.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
  nextDocument.conditional_edges = nextDocument.conditional_edges
    .filter((edge) => edge.source !== nodeId)
    .map((edge) => ({
      ...edge,
      branches: Object.fromEntries(Object.entries(edge.branches).filter(([, targetNodeId]) => targetNodeId !== nodeId)),
    }))
    .filter((edge) => Object.keys(edge.branches).length > 0);
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

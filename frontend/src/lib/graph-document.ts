import { toRaw } from "vue";

import { normalizeConditionLoopLimit } from "../editor/nodes/conditionLoopLimit.ts";
import { applyConditionBranchMapping, createConditionBranchKey } from "./condition-branch-mapping.ts";
import {
  canConnectConditionRoute,
  canConnectFlowNodes,
  canConnectStateBinding,
  canReconnectConditionRoute,
  canReconnectFlowEdge,
} from "./graph-connections.ts";
import { isCreateAgentInputStateKey, isVirtualAnyInputStateKey } from "./virtual-any-input.ts";

import type { AgentNode, ConditionNode, GraphDocument, GraphNode, GraphPayload, InputNode, OutputNode, TemplateRecord } from "../types/node-system.ts";

export type AgentBreakpointTiming = "before" | "after";

const DEFAULT_EDITOR_SEED_TEMPLATE_ID = "hello_world";

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

export function resolveEditorSeedTemplate(
  templates: TemplateRecord[],
  defaultTemplateId?: string | null,
): TemplateRecord | null {
  const rawTemplates = templates.map((template) => toRaw(template) as TemplateRecord);
  return (
    rawTemplates.find((template) => template.template_id === defaultTemplateId) ??
    rawTemplates.find((template) => template.template_id === DEFAULT_EDITOR_SEED_TEMPLATE_ID) ??
    rawTemplates[0] ??
    null
  );
}

export function createEditorSeedDraftGraph(
  templates: TemplateRecord[],
  defaultTemplateId?: string | null,
  fallbackName = "Node System Playground",
): GraphPayload {
  const seedTemplate = resolveEditorSeedTemplate(templates, defaultTemplateId);
  if (seedTemplate) {
    return createDraftFromTemplate(seedTemplate);
  }
  return createEmptyDraftGraph(fallbackName);
}

export function pruneUnreferencedStateSchemaInDocument<T extends GraphPayload | GraphDocument>(document: T): T {
  const referencedStateKeys = new Set<string>();

  for (const node of Object.values(document.nodes)) {
    for (const binding of node.reads) {
      referencedStateKeys.add(binding.state);
    }
    for (const binding of node.writes) {
      referencedStateKeys.add(binding.state);
    }
    if (node.kind === "condition" && node.config.rule.source) {
      referencedStateKeys.add(node.config.rule.source);
    }
  }

  const nextStateEntries = Object.entries(document.state_schema).filter(([stateKey]) => referencedStateKeys.has(stateKey));
  if (nextStateEntries.length === Object.keys(document.state_schema).length) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  nextDocument.state_schema = Object.fromEntries(nextStateEntries);
  return nextDocument;
}

export function cloneGraphDocument<T extends GraphPayload | GraphDocument>(document: T): T {
  return clonePlainValue(document);
}

export function clonePlainValue<T>(value: T): T {
  return structuredClone(normalizeCloneValue(value));
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

function normalizeInterruptNodeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function resolveInterruptBeforeNodeIds(metadata: Record<string, unknown>) {
  const snakeNodeIds = normalizeInterruptNodeList(metadata.interrupt_before);
  return snakeNodeIds.concat(
    normalizeInterruptNodeList(metadata.interruptBefore).filter((nodeId) => !snakeNodeIds.includes(nodeId)),
  );
}

function resolveInterruptAfterNodeIds(metadata: Record<string, unknown>) {
  const snakeNodeIds = normalizeInterruptNodeList(metadata.interrupt_after);
  return snakeNodeIds.concat(
    normalizeInterruptNodeList(metadata.interruptAfter).filter((nodeId) => !snakeNodeIds.includes(nodeId)),
  );
}

function isAgentBreakpointTiming(value: unknown): value is AgentBreakpointTiming {
  return value === "before" || value === "after";
}

function normalizeAgentBreakpointTiming(value: unknown): AgentBreakpointTiming {
  return value === "before" ? "before" : "after";
}

function resolveAgentBreakpointTimingPreferences(metadata: Record<string, unknown>) {
  const rawPreferences = metadata.agent_breakpoint_timing;
  if (!rawPreferences || typeof rawPreferences !== "object" || Array.isArray(rawPreferences)) {
    return {};
  }

  const preferences: Record<string, AgentBreakpointTiming> = {};
  for (const [nodeId, timing] of Object.entries(rawPreferences)) {
    const trimmedNodeId = nodeId.trim();
    if (!trimmedNodeId || !isAgentBreakpointTiming(timing)) {
      continue;
    }
    preferences[trimmedNodeId] = timing;
  }
  return preferences;
}

function updateListMembership(list: string[], nodeId: string, included: boolean) {
  const withoutNode = list.filter((candidateId) => candidateId !== nodeId);
  return included ? [...withoutNode, nodeId] : withoutNode;
}

export function isAgentBreakpointEnabledInDocument(document: GraphPayload | GraphDocument, nodeId: string) {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "agent") {
    return false;
  }
  return resolveInterruptBeforeNodeIds(document.metadata).includes(nodeId) || resolveInterruptAfterNodeIds(document.metadata).includes(nodeId);
}

export function resolveAgentBreakpointTimingInDocument(document: GraphPayload | GraphDocument, nodeId: string): AgentBreakpointTiming {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "agent") {
    return "after";
  }
  if (resolveInterruptBeforeNodeIds(document.metadata).includes(nodeId)) {
    return "before";
  }
  if (resolveInterruptAfterNodeIds(document.metadata).includes(nodeId)) {
    return "after";
  }
  return resolveAgentBreakpointTimingPreferences(document.metadata)[nodeId] ?? "after";
}

export function updateAgentBreakpointInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  enabled: boolean,
  timing: AgentBreakpointTiming = resolveAgentBreakpointTimingInDocument(document, nodeId),
): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "agent") {
    return document;
  }

  const normalizedTiming = normalizeAgentBreakpointTiming(timing);
  return updateAgentBreakpointMetadata(document, nodeId, {
    enabled,
    timing: normalizedTiming,
  });
}

export function updateAgentBreakpointTimingInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  timing: AgentBreakpointTiming,
): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "agent") {
    return document;
  }

  return updateAgentBreakpointMetadata(document, nodeId, {
    enabled: isAgentBreakpointEnabledInDocument(document, nodeId),
    timing: normalizeAgentBreakpointTiming(timing),
  });
}

function updateAgentBreakpointMetadata<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  options: { enabled: boolean; timing: AgentBreakpointTiming },
): T {
  const currentBeforeNodeIds = resolveInterruptBeforeNodeIds(document.metadata);
  const currentAfterNodeIds = resolveInterruptAfterNodeIds(document.metadata);
  const preferences = {
    ...resolveAgentBreakpointTimingPreferences(document.metadata),
    [nodeId]: options.timing,
  };
  const nextBeforeNodeIds = updateListMembership(
    currentBeforeNodeIds.filter((candidateId) => candidateId !== nodeId),
    nodeId,
    options.enabled && options.timing === "before",
  );
  const nextAfterNodeIds = updateListMembership(
    currentAfterNodeIds.filter((candidateId) => candidateId !== nodeId),
    nodeId,
    options.enabled && options.timing === "after",
  );

  const nextDocument = cloneGraphDocument(document);
  const nextMetadata = { ...nextDocument.metadata };
  delete nextMetadata.interruptBefore;
  delete nextMetadata.interruptAfter;
  if (nextBeforeNodeIds.length > 0) {
    nextMetadata.interrupt_before = nextBeforeNodeIds;
  } else {
    delete nextMetadata.interrupt_before;
  }
  if (nextAfterNodeIds.length > 0) {
    nextMetadata.interrupt_after = nextAfterNodeIds;
  } else {
    delete nextMetadata.interrupt_after;
  }
  nextMetadata.agent_breakpoint_timing = preferences;

  if (JSON.stringify(nextMetadata) === JSON.stringify(nextDocument.metadata)) {
    return document;
  }

  nextDocument.metadata = nextMetadata;
  return nextDocument;
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

function normalizeConditionConfig(config: ConditionNode["config"]): ConditionNode["config"] {
  return {
    ...config,
    loopLimit: normalizeConditionLoopLimit(config.loopLimit),
  };
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

  const nextConfig = normalizeConditionConfig(updater(node.config));
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
  if (isCreateAgentInputStateKey(targetStateKey)) {
    if (nextTargetNode.kind !== "agent") {
      return document;
    }
    nextTargetNode.reads = [...nextTargetNode.reads, { state: sourceStateKey, required: true }];
    return syncKnowledgeBaseSkillsInDocument(nextDocument);
  }

  if (isVirtualAnyInputStateKey(targetStateKey)) {
    nextTargetNode.reads = [{ state: sourceStateKey, required: true }];
    if (nextTargetNode.kind === "condition" && !nextTargetNode.config.rule.source.trim()) {
      nextTargetNode.config.rule.source = sourceStateKey;
    }
    return syncKnowledgeBaseSkillsInDocument(nextDocument);
  }

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

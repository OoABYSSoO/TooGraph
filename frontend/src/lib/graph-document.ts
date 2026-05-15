import { toRaw } from "vue";

import { normalizeFixedConditionConfig } from "./condition-protocol.ts";
import {
  canConnectConditionRoute,
  canConnectFlowNodes,
  canConnectStateBinding,
  canReconnectConditionRoute,
  canReconnectFlowEdge,
  filterReplacedStateInputSourceEdges,
  shouldAddImplicitFlowEdgeForStateConnection,
} from "./graph-connections.ts";
import { isCreateAgentInputStateKey, isVirtualAnyInputStateKey, isVirtualAnyOutputStateKey } from "./virtual-any-input.ts";
import { resolveInputNodeVirtualOutputType } from "./input-boundary.ts";

import type {
  AgentNode,
  AgentSkillBinding,
  ConditionNode,
  GraphCorePayload,
  GraphDocument,
  GraphNode,
  GraphPayload,
  InputNode,
  OutputNode,
  ReadBinding,
  StateDefinition,
  TemplateRecord,
  WriteBinding,
} from "../types/node-system.ts";
import type { SkillDefinition, SkillIoField } from "../types/skills.ts";

const STATE_KEY_COUNTER_METADATA_KEY = "toograph_state_key_counter";
const DEFAULT_MATERIALIZED_STATE_COLORS = [
  "#d97706",
  "#2563eb",
  "#7c3aed",
  "#10b981",
  "#0891b2",
  "#e11d48",
  "#475569",
  "#9a3412",
];
const STATE_FIELD_TYPE_VALUES = new Set([
  "text",
  "number",
  "boolean",
  "markdown",
  "json",
  "image",
  "audio",
  "video",
  "file",
  "knowledge_base",
  "capability",
  "result_package",
]);

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
  return rawTemplates.find((template) => template.template_id === defaultTemplateId) ?? rawTemplates[0] ?? null;
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

export function reorderNodePortStateInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  side: "input" | "output",
  stateKey: string,
  targetIndex: number,
): T {
  if (!Number.isFinite(targetIndex)) {
    return document;
  }

  const node = document.nodes[nodeId];
  if (!node) {
    return document;
  }
  if (isManagedAgentPortState(document, nodeId, side, stateKey)) {
    return document;
  }

  const bindings = side === "input" ? node.reads : node.writes;
  const sourceIndex = bindings.findIndex((binding) => binding.state === stateKey);
  if (sourceIndex === -1) {
    return document;
  }

  const previewIndex = Math.max(0, Math.min(Math.floor(targetIndex), bindings.length - 1));
  const previewBindings = [...bindings];
  const [previewBinding] = previewBindings.splice(sourceIndex, 1);
  previewBindings.splice(previewIndex, 0, previewBinding);
  if (previewBindings.every((binding, index) => binding.state === bindings[index]?.state)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const nextNode = nextDocument.nodes[nodeId];
  const clonedBindings = side === "input" ? nextNode.reads : nextNode.writes;
  const remainingBindings = clonedBindings.filter((_, index) => index !== sourceIndex);
  const nextIndex = Math.max(0, Math.min(Math.floor(targetIndex), remainingBindings.length));
  const nextBindings = [...remainingBindings];
  nextBindings.splice(nextIndex, 0, clonedBindings[sourceIndex]);
  if (side === "input") {
    nextNode.reads = nextBindings;
  } else {
    nextNode.writes = nextBindings;
  }
  return nextDocument;
}

function defaultMaterializedStateValueForType(type: string): unknown {
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "json":
      return {};
    case "capability":
      return { kind: "none" };
    case "result_package":
      return {};
    default:
      return "";
  }
}

function readDefaultStateKeyCounter(document: GraphPayload | GraphDocument) {
  const value = document.metadata[STATE_KEY_COUNTER_METADATA_KEY];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function readHighestDefaultStateKeyIndex(keys: string[]) {
  return keys.reduce((highest, key) => {
    const match = key.match(/^state_(\d+)$/);
    if (!match) {
      return highest;
    }
    const index = Number(match[1]);
    return Number.isInteger(index) && index > highest ? index : highest;
  }, 0);
}

function rememberMaterializedStateKeyIndex(document: GraphPayload | GraphDocument, stateKey: string) {
  const match = stateKey.match(/^state_(\d+)$/);
  if (!match) {
    return;
  }
  const index = Number(match[1]);
  if (!Number.isInteger(index) || index <= 0) {
    return;
  }
  document.metadata = {
    ...document.metadata,
    [STATE_KEY_COUNTER_METADATA_KEY]: Math.max(readDefaultStateKeyCounter(document), index),
  };
}

function resolveMaterializedStateColor(stateKey: string, existingKeys: string[]) {
  const match = stateKey.match(/^state_(\d+)$/);
  const seed = match ? Number(match[1]) - 1 : existingKeys.length;
  const normalizedSeed = Number.isInteger(seed) && seed >= 0 ? seed : 0;
  return DEFAULT_MATERIALIZED_STATE_COLORS[normalizedSeed % DEFAULT_MATERIALIZED_STATE_COLORS.length] ?? "#d97706";
}

function buildNextMaterializedVirtualStateField(document: GraphPayload | GraphDocument, stateType = "text") {
  const existingKeys = Object.keys(document.state_schema);
  let index = Math.max(readDefaultStateKeyCounter(document), readHighestDefaultStateKeyIndex(existingKeys)) + 1;
  while (existingKeys.includes(`state_${index}`)) {
    index += 1;
  }
  const key = `state_${index}`;
  return {
    key,
    definition: {
      name: key,
      description: "",
      type: stateType,
      value: defaultMaterializedStateValueForType(stateType),
      color: resolveMaterializedStateColor(key, existingKeys),
    } satisfies StateDefinition,
  };
}

function bindStateToSourceOutput(node: GraphNode | undefined, stateKey: string) {
  if (!node) {
    return;
  }
  if (node.kind === "input") {
    node.writes = [{ state: stateKey, mode: "replace" }];
    return;
  }
  if (node.kind === "subgraph") {
    if (!node.writes.some((binding) => binding.state === stateKey)) {
      node.writes = [...node.writes, { state: stateKey, mode: "replace" }];
    }
    return;
  }
  if (node.kind !== "agent") {
    return;
  }
  if (!node.writes.some((binding) => binding.state === stateKey)) {
    node.writes = [...node.writes, { state: stateKey, mode: "replace" }];
  }
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

function normalizeInterruptNodeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function resolveInterruptAfterNodeIds(metadata: Record<string, unknown>) {
  return normalizeInterruptNodeList(metadata.interrupt_after);
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
  return resolveInterruptAfterNodeIds(document.metadata).includes(nodeId);
}

export function updateAgentBreakpointInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  enabled: boolean,
): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "agent") {
    return document;
  }

  return updateAgentBreakpointMetadata(document, nodeId, {
    enabled,
  });
}

function updateAgentBreakpointMetadata<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  options: { enabled: boolean },
): T {
  const currentAfterNodeIds = resolveInterruptAfterNodeIds(document.metadata);
  const nextAfterNodeIds = updateListMembership(
    currentAfterNodeIds.filter((candidateId) => candidateId !== nodeId),
    nodeId,
    options.enabled,
  );

  const nextDocument = cloneGraphDocument(document);
  const nextMetadata = { ...nextDocument.metadata };
  delete nextMetadata.interruptBefore;
  delete nextMetadata.interruptAfter;
  delete nextMetadata.interrupt_before;
  delete nextMetadata.agent_breakpoint_timing;
  if (nextAfterNodeIds.length > 0) {
    nextMetadata.interrupt_after = nextAfterNodeIds;
  } else {
    delete nextMetadata.interrupt_after;
  }

  if (JSON.stringify(nextMetadata) === JSON.stringify(nextDocument.metadata)) {
    return document;
  }

  nextDocument.metadata = nextMetadata;
  return nextDocument;
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

export function updateSubgraphNodeGraphInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  graph: GraphCorePayload,
): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "subgraph") {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const nextNode = nextDocument.nodes[nodeId];
  if (nextNode.kind !== "subgraph") {
    return document;
  }

  nextNode.config.graph = clonePlainValue(graph);
  syncSubgraphBoundaryPorts(nextDocument, nodeId, graph);

  if (
    JSON.stringify(nextDocument.nodes[nodeId]) === JSON.stringify(node) &&
    JSON.stringify(nextDocument.state_schema) === JSON.stringify(document.state_schema) &&
    JSON.stringify(nextDocument.metadata) === JSON.stringify(document.metadata)
  ) {
    return document;
  }

  return nextDocument;
}

type SubgraphBoundary = {
  stateKey: string;
  definition: StateDefinition | undefined;
};

function listSubgraphInputBoundaries(graph: GraphCorePayload): SubgraphBoundary[] {
  return Object.values(graph.nodes)
    .filter((node): node is InputNode => node.kind === "input" && node.writes.length > 0)
    .map((node) => {
      const stateKey = node.writes[0]!.state;
      return {
        stateKey,
        definition: graph.state_schema[stateKey],
      };
    });
}

function listSubgraphOutputBoundaries(graph: GraphCorePayload): SubgraphBoundary[] {
  return Object.values(graph.nodes)
    .filter((node): node is OutputNode => node.kind === "output" && node.reads.length > 0)
    .map((node) => {
      const stateKey = node.reads[0]!.state;
      return {
        stateKey,
        definition: graph.state_schema[stateKey],
      };
    });
}

function normalizeBoundaryStateType(definition: StateDefinition | undefined, fallbackType = "text") {
  const rawType = definition?.type?.trim() || fallbackType;
  return STATE_FIELD_TYPE_VALUES.has(rawType) ? rawType : fallbackType;
}

function syncSubgraphBoundaryPorts<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  graph: GraphCorePayload,
) {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "subgraph") {
    return;
  }

  node.reads = syncSubgraphReadBindings(document, node.reads, listSubgraphInputBoundaries(graph));
  node.writes = syncSubgraphWriteBindings(document, node.writes, listSubgraphOutputBoundaries(graph));
}

function syncSubgraphReadBindings(
  document: GraphPayload | GraphDocument,
  currentBindings: ReadBinding[],
  boundaries: SubgraphBoundary[],
): ReadBinding[] {
  return boundaries.map((boundary, index) => {
    const state = resolveSubgraphBoundaryParentState(document, currentBindings[index]?.state ?? null, boundary);
    return {
      state,
      required: true,
    };
  });
}

function syncSubgraphWriteBindings(
  document: GraphPayload | GraphDocument,
  currentBindings: WriteBinding[],
  boundaries: SubgraphBoundary[],
): WriteBinding[] {
  return boundaries.map((boundary, index) => {
    const state = resolveSubgraphBoundaryParentState(document, currentBindings[index]?.state ?? null, boundary);
    return {
      state,
      mode: "replace" as const,
    };
  });
}

function resolveSubgraphBoundaryParentState(
  document: GraphPayload | GraphDocument,
  currentStateKey: string | null,
  boundary: SubgraphBoundary,
) {
  if (currentStateKey) {
    document.state_schema[currentStateKey] = buildSyncedSubgraphBoundaryStateDefinition(
      currentStateKey,
      document.state_schema[currentStateKey],
      boundary.definition,
      Object.keys(document.state_schema),
    );
    return currentStateKey;
  }

  const stateType = normalizeBoundaryStateType(boundary.definition);
  const field = buildNextMaterializedVirtualStateField(document, stateType);
  document.state_schema[field.key] = buildSyncedSubgraphBoundaryStateDefinition(
    field.key,
    undefined,
    boundary.definition,
    Object.keys(document.state_schema),
  );
  rememberMaterializedStateKeyIndex(document, field.key);
  return field.key;
}

function buildSyncedSubgraphBoundaryStateDefinition(
  stateKey: string,
  currentDefinition: StateDefinition | undefined,
  boundaryDefinition: StateDefinition | undefined,
  existingKeys: string[],
): StateDefinition {
  const nextType = normalizeBoundaryStateType(boundaryDefinition, currentDefinition?.type?.trim() || "text");
  const currentType = currentDefinition?.type?.trim() || nextType;
  const shouldKeepValue = Boolean(currentDefinition) && currentType === nextType;
  const nextDefinition: StateDefinition = {
    name: boundaryDefinition?.name?.trim() || currentDefinition?.name?.trim() || stateKey,
    description: boundaryDefinition?.description?.trim() ?? currentDefinition?.description ?? "",
    type: nextType,
    value: shouldKeepValue ? currentDefinition?.value : defaultMaterializedStateValueForType(nextType),
    color: boundaryDefinition?.color?.trim() || currentDefinition?.color?.trim() || resolveMaterializedStateColor(stateKey, existingKeys),
  };
  if (currentDefinition?.binding !== undefined) {
    nextDefinition.binding = currentDefinition.binding;
  }
  return nextDefinition;
}

function normalizeConditionConfig(config: ConditionNode["config"]): ConditionNode["config"] {
  return normalizeFixedConditionConfig(config);
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
  options: { skillDefinitions?: SkillDefinition[] } = {},
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
  reconcileAgentSkillStateInputBindings(nextDocument, nodeId, options.skillDefinitions ?? []);
  reconcileAgentSkillOutputBindings(nextDocument, nodeId, options.skillDefinitions ?? []);
  reconcileAgentCapabilityInputBindingsInPlace(nextDocument, nodeId);
  return nextDocument;
}

export function reconcileAgentSkillOutputBindingsInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  skillDefinitions: SkillDefinition[],
): T {
  if (skillDefinitions.length === 0) {
    return document;
  }

  const agentNodeIds = Object.entries(document.nodes)
    .filter(([, node]) => node.kind === "agent")
    .map(([nodeId]) => nodeId);
  if (agentNodeIds.length === 0) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  for (const nodeId of agentNodeIds) {
    reconcileAgentSkillStateInputBindings(nextDocument, nodeId, skillDefinitions);
    reconcileAgentSkillOutputBindings(nextDocument, nodeId, skillDefinitions);
  }

  return JSON.stringify(nextDocument) === JSON.stringify(document) ? document : nextDocument;
}

export function reconcileAgentCapabilityInputBindingsInDocument<T extends GraphPayload | GraphDocument>(document: T, nodeId: string): T {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "agent") {
    return document;
  }

  const beforeNode = JSON.stringify(node);
  const beforeSchema = JSON.stringify(document.state_schema);
  const beforeEdges = JSON.stringify(document.edges);
  const beforeMetadata = JSON.stringify(document.metadata);
  const nextDocument = cloneGraphDocument(document);
  reconcileAgentCapabilityInputBindingsInPlace(nextDocument, nodeId);
  if (
    JSON.stringify(nextDocument.nodes[nodeId]) === beforeNode &&
    JSON.stringify(nextDocument.state_schema) === beforeSchema &&
    JSON.stringify(nextDocument.edges) === beforeEdges &&
    JSON.stringify(nextDocument.metadata) === beforeMetadata
  ) {
    return document;
  }
  return nextDocument;
}

export function reconcileAgentCapabilityInputBindingsInPlace<T extends GraphPayload | GraphDocument>(document: T, nodeId: string) {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "agent") {
    return;
  }

  const shouldManageDynamicCapability = isDynamicCapabilityExecutorNode(document, node);
  const managedStateKeys = collectManagedCapabilityResultStateKeys(document, nodeId);

  if (!shouldManageDynamicCapability) {
    if (managedStateKeys.size === 0) {
      return;
    }
    if (managedStateKeys.size > 0) {
      removeManagedStateKeysFromDocument(document, managedStateKeys);
    }
    if (node.config.skillKey.trim()) {
      return;
    }
    const restoredFreeWrites = normalizeWriteBindings(node.config.suspendedFreeWrites).filter((binding) => document.state_schema[binding.state]);
    const currentFreeWrites = node.writes.filter((binding) => !isManagedCapabilityResultStateForNode(document, nodeId, binding.state));
    node.writes = mergeWriteBindings(restoredFreeWrites, currentFreeWrites);
    delete node.config.suspendedFreeWrites;
    return;
  }

  const managedWriteKeys = node.writes
    .map((binding) => binding.state)
    .filter((stateKey) => isManagedCapabilityResultStateForNode(document, nodeId, stateKey));
  const keptManagedStateKey = managedWriteKeys[0] ?? findExistingCapabilityResultState(document, nodeId);
  const staleManagedStateKeys = new Set(
    [...managedStateKeys].filter((stateKey) => stateKey !== keptManagedStateKey),
  );
  if (staleManagedStateKeys.size > 0) {
    removeManagedStateKeysFromDocument(document, staleManagedStateKeys);
  }

  const suspendedFreeWrites = mergeWriteBindings(
    normalizeWriteBindings(node.config.suspendedFreeWrites).filter((binding) => document.state_schema[binding.state]),
    node.writes.filter((binding) => !isManagedCapabilityResultStateForNode(document, nodeId, binding.state)),
  );
  if (suspendedFreeWrites.length > 0) {
    node.config.suspendedFreeWrites = suspendedFreeWrites;
  } else {
    delete node.config.suspendedFreeWrites;
  }

  const resultStateKey = keptManagedStateKey ?? createManagedCapabilityResultState(document, nodeId);
  node.writes = [{ state: resultStateKey, mode: "replace" }];
}

function reconcileAgentSkillStateInputBindings<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  skillDefinitions: SkillDefinition[],
) {
  let node = document.nodes[nodeId];
  if (!node || node.kind !== "agent") {
    return;
  }

  const skillDefinitionMap = new Map(skillDefinitions.map((definition) => [definition.skillKey, definition]));
  const attachedSkillKey = node.config.skillKey.trim();
  const definition = attachedSkillKey ? skillDefinitionMap.get(attachedSkillKey) : undefined;
  const activeInputKeys = new Set(definition?.stateInputSchema?.map((field) => field.key) ?? []);

  if (!definition?.stateInputSchema?.length) {
    node.reads = node.reads.filter((binding) => !isManagedSkillInputReadBinding(binding));
    return;
  }

  const existingManagedReadByField = new Map<string, ReadBinding>();
  for (const readBinding of node.reads) {
    const binding = readBinding.binding;
    if (
      binding?.kind === "skill_input" &&
      binding.skillKey === attachedSkillKey &&
      binding.managed !== false &&
      activeInputKeys.has(binding.fieldKey) &&
      document.state_schema[readBinding.state]
    ) {
      existingManagedReadByField.set(binding.fieldKey, readBinding);
    }
  }

  const freeReads = node.reads.filter((binding) => !isManagedSkillInputReadBinding(binding));
  const boundStateKeys = new Set<string>();
  const managedReads: ReadBinding[] = [];

  for (const field of definition.stateInputSchema) {
    const existingRead = existingManagedReadByField.get(field.key);
    if (existingRead && document.state_schema[existingRead.state] && !boundStateKeys.has(existingRead.state)) {
      boundStateKeys.add(existingRead.state);
      managedReads.push(buildManagedSkillInputReadBinding(existingRead.state, attachedSkillKey, field));
      continue;
    }

    const inferredStateKey = inferSkillInputStateKey(
      document,
      field,
      new Set([...boundStateKeys]),
    );
    if (inferredStateKey) {
      boundStateKeys.add(inferredStateKey);
      managedReads.push(buildManagedSkillInputReadBinding(inferredStateKey, attachedSkillKey, field));
      continue;
    }

    const materializedStateKey = createManagedSkillInputState(document, definition, field);
    boundStateKeys.add(materializedStateKey);
    managedReads.push(buildManagedSkillInputReadBinding(materializedStateKey, attachedSkillKey, field));
  }

  node.reads = [
    ...managedReads,
    ...freeReads.filter((binding) => !boundStateKeys.has(binding.state)),
  ];
}

function reconcileAgentSkillOutputBindings<T extends GraphPayload | GraphDocument>(
  document: T,
  nodeId: string,
  skillDefinitions: SkillDefinition[],
) {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "agent") {
    return;
  }

  const skillDefinitionMap = new Map(skillDefinitions.map((definition) => [definition.skillKey, definition]));
  const attachedSkillKey = node.config.skillKey.trim();
  const attachedSkillKeys = new Set(attachedSkillKey ? [attachedSkillKey] : []);
  let currentBindings = normalizeAgentSkillBindings(node.config.skillBindings);
  let currentBindingBySkill = new Map(currentBindings.map((binding) => [binding.skillKey, binding]));
  const removedManagedStateKeys = collectRemovedManagedSkillOutputStateKeys(document, nodeId, currentBindings, attachedSkillKeys);
  const nextSkillBindings: AgentSkillBinding[] = [];
  const processedSkillKeys = new Set<string>();
  const refreshCurrentBindings = () => {
    currentBindings = normalizeAgentSkillBindings(node.config.skillBindings);
    currentBindingBySkill = new Map(currentBindings.map((binding) => [binding.skillKey, binding]));
  };

  if (removedManagedStateKeys.size > 0) {
    removeManagedStateKeysFromDocument(document, removedManagedStateKeys);
    refreshCurrentBindings();
  }

  if (attachedSkillKey) {
    const definition = skillDefinitionMap.get(attachedSkillKey);
    if (definition) {
      const activeOutputKeys = new Set(definition.stateOutputSchema.map((field) => field.key));
      const staleManagedStateKeys = collectStaleManagedSkillOutputStateKeys(
        document,
        nodeId,
        attachedSkillKey,
        activeOutputKeys,
      );
      if (staleManagedStateKeys.size > 0) {
        removeManagedStateKeysFromDocument(document, staleManagedStateKeys);
        refreshCurrentBindings();
      }
    }

    const suspendedFreeWrites = mergeWriteBindings(
      normalizeWriteBindings(node.config.suspendedFreeWrites).filter((binding) => document.state_schema[binding.state]),
      node.writes.filter(
        (binding) =>
          !isManagedSkillOutputStateForNode(document, nodeId, binding.state) &&
          !isManagedCapabilityResultStateForNode(document, nodeId, binding.state),
      ),
    );
    if (suspendedFreeWrites.length > 0) {
      node.config.suspendedFreeWrites = suspendedFreeWrites;
    } else {
      delete node.config.suspendedFreeWrites;
    }
    node.writes = node.writes.filter((binding) => isManagedSkillOutputStateForNode(document, nodeId, binding.state, attachedSkillKey));

    const existingBinding = currentBindingBySkill.get(attachedSkillKey);
    if (!definition?.stateOutputSchema.length) {
      if (existingBinding && Object.keys(existingBinding.outputMapping ?? {}).length > 0) {
        nextSkillBindings.push(existingBinding);
        processedSkillKeys.add(attachedSkillKey);
      }
    } else {
      const outputMapping = { ...(existingBinding?.outputMapping ?? {}) };
      for (const field of definition.stateOutputSchema) {
        const mappedState = outputMapping[field.key];
        if (mappedState && document.state_schema[mappedState]) {
          syncManagedSkillOutputStateDefinition(document, mappedState, definition, field);
          ensureAgentWriteBinding(node, mappedState);
          continue;
        }

        const existingStateKey = findExistingSkillOutputState(document, nodeId, attachedSkillKey, field.key);
        if (existingStateKey) {
          syncManagedSkillOutputStateDefinition(document, existingStateKey, definition, field);
        }
        const stateKey = existingStateKey ?? createManagedSkillOutputState(document, nodeId, definition, field);
        outputMapping[field.key] = stateKey;
        ensureAgentWriteBinding(node, stateKey);
      }

      nextSkillBindings.push({
        skillKey: attachedSkillKey,
        outputMapping,
      });
      processedSkillKeys.add(attachedSkillKey);
    }
  } else {
    const restoredFreeWrites = normalizeWriteBindings(node.config.suspendedFreeWrites).filter((binding) => document.state_schema[binding.state]);
    const currentFreeWrites = node.writes.filter((binding) => !isManagedSkillOutputStateForNode(document, nodeId, binding.state));
    node.writes = mergeWriteBindings(restoredFreeWrites, currentFreeWrites);
    delete node.config.suspendedFreeWrites;
  }

  for (const binding of currentBindings) {
    if (!attachedSkillKeys.has(binding.skillKey) || processedSkillKeys.has(binding.skillKey)) {
      continue;
    }
    nextSkillBindings.push(binding);
  }

  node.config.skillBindings = nextSkillBindings;
}

function normalizeWriteBindings(value: AgentNode["config"]["suspendedFreeWrites"]): WriteBinding[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((binding) => ({
      state: String(binding.state ?? "").trim(),
      mode: binding.mode === "append" ? "append" as const : "replace" as const,
    }))
    .filter((binding) => binding.state);
}

function mergeWriteBindings(...bindingGroups: WriteBinding[][]): WriteBinding[] {
  const seen = new Set<string>();
  const merged: WriteBinding[] = [];
  for (const bindings of bindingGroups) {
    for (const binding of bindings) {
      if (seen.has(binding.state)) {
        continue;
      }
      seen.add(binding.state);
      merged.push({ ...binding });
    }
  }
  return merged;
}

function normalizeAgentSkillBindings(value: AgentNode["config"]["skillBindings"]): AgentSkillBinding[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((binding) => ({
      skillKey: String(binding.skillKey ?? "").trim(),
      outputMapping: { ...(binding.outputMapping ?? {}) },
    }))
    .filter((binding) => binding.skillKey);
}

function collectRemovedManagedSkillOutputStateKeys(
  document: GraphPayload | GraphDocument,
  nodeId: string,
  currentBindings: AgentSkillBinding[],
  attachedSkillKeys: Set<string>,
) {
  const removedStateKeys = new Set<string>();
  for (const binding of currentBindings) {
    if (attachedSkillKeys.has(binding.skillKey)) {
      continue;
    }
    for (const stateKey of Object.values(binding.outputMapping ?? {})) {
      const stateBinding = document.state_schema[stateKey]?.binding;
      if (
        stateBinding?.kind === "skill_output" &&
        stateBinding.skillKey === binding.skillKey &&
        stateBinding.nodeId === nodeId &&
        stateBinding.managed !== false
      ) {
        removedStateKeys.add(stateKey);
      }
    }
  }
  return removedStateKeys;
}

function collectStaleManagedSkillOutputStateKeys(
  document: GraphPayload | GraphDocument,
  nodeId: string,
  skillKey: string,
  activeFieldKeys: Set<string>,
) {
  const staleStateKeys = new Set<string>();
  for (const [stateKey, definition] of Object.entries(document.state_schema)) {
    const binding = definition.binding;
    if (
      binding?.kind === "skill_output" &&
      binding.skillKey === skillKey &&
      binding.nodeId === nodeId &&
      binding.managed !== false &&
      !activeFieldKeys.has(binding.fieldKey)
    ) {
      staleStateKeys.add(stateKey);
    }
  }
  return staleStateKeys;
}

function removeManagedStateKeysFromDocument(document: GraphPayload | GraphDocument, stateKeys: Set<string>) {
  const touchedNodeIds = new Set<string>();
  for (const stateKey of stateKeys) {
    delete document.state_schema[stateKey];
  }

  for (const [nodeId, node] of Object.entries(document.nodes)) {
    const nextReads = node.reads.filter((binding) => !stateKeys.has(binding.state));
    const nextWrites = node.writes.filter((binding) => !stateKeys.has(binding.state));
    if (nextReads.length !== node.reads.length || nextWrites.length !== node.writes.length) {
      touchedNodeIds.add(nodeId);
      node.reads = nextReads;
      node.writes = nextWrites;
    }

    if (node.kind === "condition" && stateKeys.has(node.config.rule.source)) {
      node.config.rule.source = node.reads[0]?.state ?? "";
      touchedNodeIds.add(nodeId);
    }

    if (node.kind === "agent") {
      const nextSuspendedWrites = normalizeWriteBindings(node.config.suspendedFreeWrites).filter((binding) => !stateKeys.has(binding.state));
      if (nextSuspendedWrites.length > 0) {
        node.config.suspendedFreeWrites = nextSuspendedWrites;
      } else {
        delete node.config.suspendedFreeWrites;
      }
      node.config.skillBindings = normalizeAgentSkillBindings(node.config.skillBindings)
        .map((binding) => ({
          skillKey: binding.skillKey,
          outputMapping: Object.fromEntries(Object.entries(binding.outputMapping ?? {}).filter(([, stateKey]) => !stateKeys.has(stateKey))),
        }));
    }
  }

  document.edges = document.edges.filter((edge) => {
    if (!touchedNodeIds.has(edge.source) && !touchedNodeIds.has(edge.target)) {
      return true;
    }
    const sourceNode = document.nodes[edge.source];
    const targetNode = document.nodes[edge.target];
    if (!sourceNode || !targetNode) {
      return false;
    }
    return hasSharedStateBinding(sourceNode, targetNode);
  });
}

function hasSharedStateBinding(sourceNode: GraphNode, targetNode: GraphNode) {
  const targetReadStates = new Set(targetNode.reads.map((binding) => binding.state));
  return sourceNode.writes.some((binding) => targetReadStates.has(binding.state));
}

function isManagedSkillOutputStateForNode(
  document: GraphPayload | GraphDocument,
  nodeId: string,
  stateKey: string,
  skillKey?: string,
) {
  const stateBinding = document.state_schema[stateKey]?.binding;
  return (
    stateBinding?.kind === "skill_output" &&
    stateBinding.nodeId === nodeId &&
    stateBinding.managed !== false &&
    (skillKey === undefined || stateBinding.skillKey === skillKey)
  );
}

function isManagedSkillInputReadBinding(binding: ReadBinding) {
  return binding.binding?.kind === "skill_input" && binding.binding.managed !== false;
}

function isDynamicCapabilityExecutorNode(document: GraphPayload | GraphDocument, node: AgentNode) {
  if (node.config.skillKey.trim()) {
    return false;
  }
  return node.reads.some((binding) => document.state_schema[binding.state]?.type?.trim() === "capability");
}

function isManagedCapabilityInputState(document: GraphPayload | GraphDocument, nodeId: string, stateKey: string) {
  const node = document.nodes[nodeId];
  return node?.kind === "agent" && document.state_schema[stateKey]?.type?.trim() === "capability";
}

function isManagedCapabilityResultStateForNode(
  document: GraphPayload | GraphDocument,
  nodeId: string,
  stateKey: string,
) {
  const stateBinding = document.state_schema[stateKey]?.binding;
  return (
    stateBinding?.kind === "capability_result" &&
    stateBinding.nodeId === nodeId &&
    stateBinding.managed !== false
  );
}

function isManagedAgentPortState(
  document: GraphPayload | GraphDocument,
  nodeId: string,
  side: "input" | "output",
  stateKey: string,
) {
  if (side === "input") {
    return isManagedCapabilityInputState(document, nodeId, stateKey);
  }
  return isManagedSkillOutputStateForNode(document, nodeId, stateKey) || isManagedCapabilityResultStateForNode(document, nodeId, stateKey);
}

function collectManagedCapabilityResultStateKeys(document: GraphPayload | GraphDocument, nodeId: string) {
  const stateKeys = new Set<string>();
  for (const [stateKey, definition] of Object.entries(document.state_schema)) {
    const binding = definition.binding;
    if (binding?.kind === "capability_result" && binding.nodeId === nodeId && binding.managed !== false) {
      stateKeys.add(stateKey);
    }
  }
  return stateKeys;
}

function findExistingCapabilityResultState(document: GraphPayload | GraphDocument, nodeId: string) {
  return Object.entries(document.state_schema).find(([, definition]) => {
    const binding = definition.binding;
    return (
      binding?.kind === "capability_result" &&
      binding.nodeId === nodeId &&
      binding.managed !== false
    );
  })?.[0] ?? null;
}

function createManagedCapabilityResultState(document: GraphPayload | GraphDocument, nodeId: string) {
  const stateField = buildNextMaterializedVirtualStateField(document, "result_package");
  document.state_schema[stateField.key] = {
    ...stateField.definition,
    name: "Capability",
    description: "Dynamic capability execution result package.",
    type: "result_package",
    value: {},
    binding: {
      kind: "capability_result",
      nodeId,
      fieldKey: "result_package",
      managed: true,
    },
  };
  rememberMaterializedStateKeyIndex(document, stateField.key);
  return stateField.key;
}

function ensureAgentWriteBinding(node: AgentNode, stateKey: string) {
  if (node.writes.some((binding) => binding.state === stateKey)) {
    return;
  }
  node.writes = [...node.writes, { state: stateKey, mode: "replace" }];
}

function findExistingSkillOutputState(
  document: GraphPayload | GraphDocument,
  nodeId: string,
  skillKey: string,
  fieldKey: string,
) {
  return Object.entries(document.state_schema).find(([, definition]) => {
    const binding = definition.binding;
    return (
      binding?.kind === "skill_output" &&
      binding.skillKey === skillKey &&
      binding.nodeId === nodeId &&
      binding.fieldKey === fieldKey
    );
  })?.[0] ?? null;
}

function buildManagedSkillInputReadBinding(
  stateKey: string,
  skillKey: string,
  field: SkillIoField,
): ReadBinding {
  return {
    state: stateKey,
    required: Boolean(field.required),
    binding: {
      kind: "skill_input",
      skillKey,
      fieldKey: field.key,
      managed: true,
    },
  };
}

function inferSkillInputStateKey(
  document: GraphPayload | GraphDocument,
  field: SkillIoField,
  usedStateKeys: Set<string>,
) {
  const candidates: SkillInputStateCandidate[] = [];
  const fieldKey = normalizeName(field.key);
  const fieldName = normalizeName(field.name);
  for (const [stateKey, definition] of Object.entries(document.state_schema)) {
    if (usedStateKeys.has(stateKey)) {
      continue;
    }
    let score = 0;
    const stateKeyName = normalizeName(stateKey);
    const stateDisplayName = normalizeName(definition.name);
    if (stateKey === field.key) {
      score = 100;
    } else if (stateKeyName === fieldKey) {
      score = 90;
    } else if (fieldName && stateDisplayName === fieldName) {
      score = 80;
    } else if (stateTypeMatchesSkillField(definition, field)) {
      if (fieldKey && stateKeyName.includes(fieldKey)) {
        score = 70;
      } else if (fieldName && stateDisplayName.includes(fieldName)) {
        score = 60;
      }
    }
    if (score > 0) {
      candidates.push({ score, stateKey });
    }
  }

  if (candidates.length === 0) {
    return "";
  }
  candidates.sort((left, right) => right.score - left.score || left.stateKey.localeCompare(right.stateKey));
  const bestScore = candidates[0]?.score ?? 0;
  const bestCandidates = candidates.filter((candidate) => candidate.score === bestScore);
  return bestCandidates.length === 1 ? bestCandidates[0].stateKey : "";
}

type SkillInputStateCandidate = {
  score: number;
  stateKey: string;
};

function createManagedSkillInputState(
  document: GraphPayload | GraphDocument,
  skill: SkillDefinition,
  field: SkillIoField,
) {
  const stateType = normalizeSkillFieldStateType(field.valueType);
  const stateField = buildNextMaterializedVirtualStateField(document, stateType);
  document.state_schema[stateField.key] = {
    ...stateField.definition,
    name: field.name.trim() || field.key,
    description: field.description.trim() || `${skill.name.trim() || skill.skillKey} input: ${field.key}`,
    type: stateType,
  };
  rememberMaterializedStateKeyIndex(document, stateField.key);
  return stateField.key;
}

function createManagedSkillOutputState(
  document: GraphPayload | GraphDocument,
  nodeId: string,
  skill: SkillDefinition,
  field: SkillIoField,
) {
  const stateType = normalizeSkillFieldStateType(field.valueType);
  const stateField = buildNextMaterializedVirtualStateField(document, stateType);
  const skillName = skill.name.trim() || skill.skillKey;
  const fieldName = field.name.trim() || field.key;
  document.state_schema[stateField.key] = {
    ...stateField.definition,
    name: fieldName,
    description: field.description.trim() || `${skillName} output: ${field.key}`,
    type: stateType,
    binding: {
      kind: "skill_output",
      skillKey: skill.skillKey,
      nodeId,
      fieldKey: field.key,
      managed: true,
    },
  };
  rememberMaterializedStateKeyIndex(document, stateField.key);
  return stateField.key;
}

function syncManagedSkillOutputStateDefinition(
  document: GraphPayload | GraphDocument,
  stateKey: string,
  skill: SkillDefinition,
  field: SkillIoField,
) {
  const definition = document.state_schema[stateKey];
  if (!definition) {
    return;
  }
  const nextType = normalizeSkillFieldStateType(field.valueType);
  const currentType = definition.type?.trim() || nextType;
  const nextValue = currentType === nextType ? definition.value : defaultMaterializedStateValueForType(nextType);
  document.state_schema[stateKey] = {
    ...definition,
    name: field.name.trim() || field.key,
    description: field.description.trim() || `${skill.name.trim() || skill.skillKey} output: ${field.key}`,
    type: nextType,
    value: nextValue,
  };
}

function normalizeSkillFieldStateType(valueType: string) {
  const normalized = valueType.trim();
  return STATE_FIELD_TYPE_VALUES.has(normalized) ? normalized : "json";
}

function normalizeName(value: string) {
  return [...value.toLowerCase()].filter((character) => /[\p{Letter}\p{Number}]/u.test(character)).join("");
}

function stateTypeMatchesSkillField(definition: StateDefinition | undefined, field: SkillIoField) {
  if (!definition) {
    return false;
  }
  return definition.type?.trim() === normalizeSkillFieldStateType(field.valueType);
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
  void nodeId;
  void currentKey;
  void nextKey;
  void mappingKeys;
  return document;
}

export function addConditionBranchToDocument<T extends GraphPayload | GraphDocument>(document: T, nodeId: string): T {
  void nodeId;
  return document;
}

export function removeConditionBranchFromDocument<T extends GraphPayload | GraphDocument>(document: T, nodeId: string, branchKey: string): T {
  void nodeId;
  void branchKey;
  return document;
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
  sourceValueType?: string | null,
): T {
  if (!canConnectStateBinding(document, sourceNodeId, sourceStateKey, targetNodeId, targetStateKey)) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  let resolvedSourceStateKey = sourceStateKey;
  const nextSourceNode = nextDocument.nodes[sourceNodeId];
  const nextTargetNode = nextDocument.nodes[targetNodeId];
  if (isVirtualAnyOutputStateKey(sourceStateKey)) {
    if (
      nextSourceNode.kind === "agent" ||
      nextSourceNode.kind === "subgraph" ||
      isCreateAgentInputStateKey(targetStateKey) ||
      isVirtualAnyInputStateKey(targetStateKey)
    ) {
      const materializedState = buildNextMaterializedVirtualStateField(
        nextDocument,
        sourceValueType?.trim() || resolveInputNodeVirtualOutputType(nextSourceNode) || "text",
      );
      nextDocument.state_schema[materializedState.key] = materializedState.definition;
      rememberMaterializedStateKeyIndex(nextDocument, materializedState.key);
      resolvedSourceStateKey = materializedState.key;
    } else {
      if (!nextTargetNode.reads.some((binding) => binding.state === targetStateKey)) {
        return document;
      }
      resolvedSourceStateKey = targetStateKey;
    }
    bindStateToSourceOutput(nextDocument.nodes[sourceNodeId], resolvedSourceStateKey);
  }

  if (isCreateAgentInputStateKey(targetStateKey)) {
    if (nextTargetNode.kind !== "agent" && nextTargetNode.kind !== "subgraph") {
      return document;
    }
    nextTargetNode.reads = [...nextTargetNode.reads, { state: resolvedSourceStateKey, required: true }];
    reconcileAgentCapabilityInputBindingsInPlace(nextDocument, targetNodeId);
    addImplicitFlowEdgeForStateConnection(nextDocument, sourceNodeId, targetNodeId);
    return nextDocument;
  }

  if (isVirtualAnyInputStateKey(targetStateKey)) {
    nextTargetNode.reads =
      (nextTargetNode.kind === "agent" || nextTargetNode.kind === "subgraph") && nextTargetNode.reads.length > 0
        ? [...nextTargetNode.reads, { state: resolvedSourceStateKey, required: true }]
        : [{ state: resolvedSourceStateKey, required: true }];
    if (nextTargetNode.kind === "condition") {
      nextTargetNode.config.rule.source = resolvedSourceStateKey;
    }
    reconcileAgentCapabilityInputBindingsInPlace(nextDocument, targetNodeId);
    addImplicitFlowEdgeForStateConnection(nextDocument, sourceNodeId, targetNodeId);
    return nextDocument;
  }

  const targetBindingIndex = nextTargetNode.reads.findIndex((binding) => binding.state === targetStateKey);
  if (targetBindingIndex === -1) {
    return document;
  }

  nextTargetNode.reads[targetBindingIndex] = {
    ...nextTargetNode.reads[targetBindingIndex],
    state: resolvedSourceStateKey,
  };
  if (nextTargetNode.kind === "condition") {
    nextTargetNode.config.rule.source = resolvedSourceStateKey;
  }
  reconcileAgentCapabilityInputBindingsInPlace(nextDocument, targetNodeId);

  nextDocument.edges = filterReplacedStateInputSourceEdges(nextDocument, {
    sourceNodeId,
    targetNodeId,
    previousStateKey: targetStateKey,
    nextStateKey: resolvedSourceStateKey,
  });
  addImplicitFlowEdgeForStateConnection(nextDocument, sourceNodeId, targetNodeId);
  return nextDocument;
}

function addImplicitFlowEdgeForStateConnection<T extends GraphPayload | GraphDocument>(
  document: T,
  sourceNodeId: string,
  targetNodeId: string,
) {
  if (!shouldAddImplicitFlowEdgeForStateConnection(document, sourceNodeId, targetNodeId)) {
    return;
  }
  document.edges = [...document.edges, { source: sourceNodeId, target: targetNodeId }];
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

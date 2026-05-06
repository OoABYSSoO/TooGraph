import { NODE_CREATION_FAMILY_PRIORITY } from "./nodeCreationBuiltins.ts";

import type { GraphDocument, NodeCreationContext, NodeCreationEntry, PresetDocument } from "@/types/node-system";

type NodeCreationAnchorKind = "flow-out" | "route-out" | "state-out" | "state-in";

export type NodeCreationMenuState = {
  open: boolean;
  context: NodeCreationContext | null;
  position: { x: number; y: number } | null;
  query: string;
};

export type CreatedStateEdgeEditorRequest = {
  requestId: string;
  sourceNodeId: string;
  targetNodeId: string;
  stateKey: string;
  position: NodeCreationContext["position"];
};

type CreatedStateEdgeEditorResult = {
  createdNodeId: string;
  createdStateKey: string | null;
};

type BuildNodeCreationEntriesInput = {
  builtins: NodeCreationEntry[];
  presets: PresetDocument[];
  graphs?: GraphDocument[];
  query: string;
  sourceValueType: string | null;
  sourceAnchorKind?: NodeCreationAnchorKind | null;
};

function normalizeSearchValue(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function resolveNodeCreationMenuPosition(context: NodeCreationContext) {
  return typeof context.clientX === "number" && typeof context.clientY === "number"
    ? { x: context.clientX, y: context.clientY }
    : null;
}

export function buildOpenNodeCreationMenuState(context: NodeCreationContext): NodeCreationMenuState {
  return {
    open: true,
    context,
    position: resolveNodeCreationMenuPosition(context),
    query: "",
  };
}

export function buildClosedNodeCreationMenuState(): NodeCreationMenuState {
  return {
    open: false,
    context: null,
    position: null,
    query: "",
  };
}

export function buildUpdatedNodeCreationMenuQuery(
  currentState: NodeCreationMenuState | null,
  query: string,
): NodeCreationMenuState {
  return {
    open: currentState?.open ?? false,
    context: currentState?.context ?? null,
    position: currentState?.position ?? null,
    query,
  };
}

export function buildCreatedStateEdgeEditorRequest(
  context: NodeCreationContext,
  result: CreatedStateEdgeEditorResult,
  timestamp: number,
): CreatedStateEdgeEditorRequest | null {
  if (!result.createdStateKey) {
    return null;
  }

  const sourceNodeId = context.targetNodeId ? result.createdNodeId : context.sourceNodeId;
  const targetNodeId = context.targetNodeId ?? result.createdNodeId;
  if (!sourceNodeId || !targetNodeId) {
    return null;
  }

  return {
    requestId: `${sourceNodeId}:${result.createdStateKey}:${targetNodeId}:${timestamp}`,
    sourceNodeId,
    targetNodeId,
    stateKey: result.createdStateKey,
    position: context.position,
  };
}

function listPresetAcceptedValueTypes(preset: PresetDocument) {
  const acceptedTypes = Array.from(
    new Set(
      preset.definition.node.reads
        .map((binding) => preset.definition.state_schema[binding.state]?.type?.trim() ?? "")
        .filter((valueType) => valueType.length > 0),
    ),
  );
  return acceptedTypes.length > 0 ? acceptedTypes : null;
}

function toPresetEntry(preset: PresetDocument): NodeCreationEntry {
  return {
    id: `preset-${preset.presetId}`,
    family: preset.definition.node.kind,
    label: preset.definition.node.name.trim() || preset.definition.label.trim() || preset.presetId,
    description: preset.definition.description || preset.definition.node.description,
    mode: "preset",
    origin: "persisted",
    presetId: preset.presetId,
    acceptsValueTypes: listPresetAcceptedValueTypes(preset),
  };
}

function listGraphAcceptedValueTypes(graph: GraphDocument) {
  const acceptedTypes = Array.from(
    new Set(
      Object.values(graph.nodes)
        .filter((node) => node.kind === "input" && node.writes.length > 0)
        .map((node) => graph.state_schema[node.writes[0].state]?.type?.trim() ?? "")
        .filter((valueType) => valueType.length > 0),
    ),
  );
  return acceptedTypes.length > 0 ? acceptedTypes : null;
}

function toSubgraphEntry(graph: GraphDocument): NodeCreationEntry {
  return {
    id: `graph-${graph.graph_id}`,
    family: "subgraph",
    label: `${graph.name.trim() || graph.graph_id} Subgraph`,
    description: "Use a saved graph as an embedded subgraph instance.",
    mode: "subgraph",
    origin: "persisted",
    graphId: graph.graph_id,
    acceptsValueTypes: listGraphAcceptedValueTypes(graph),
  };
}

function matchesNodeCreationQuery(entry: NodeCreationEntry, query: string) {
  if (!query) {
    return true;
  }

  const haystacks = [
    entry.label,
    entry.description,
    entry.family,
    entry.presetId ?? "",
    entry.nodeKind ?? "",
    entry.id,
  ].map((value) => value.toLowerCase());

  return haystacks.some((value) => value.includes(query));
}

export function supportsCreationSourceType(
  entry: NodeCreationEntry,
  sourceValueType: string | null,
  sourceAnchorKind: NodeCreationAnchorKind | null = null,
) {
  if (sourceAnchorKind === "state-in") {
    return entry.family === "input" || entry.family === "agent";
  }

  if (entry.family === "input") {
    return !sourceValueType && !sourceAnchorKind;
  }

  if (!sourceValueType) {
    return true;
  }

  if (entry.family === "output") {
    return true;
  }

  if (!entry.acceptsValueTypes || entry.acceptsValueTypes.length === 0) {
    return true;
  }

  return entry.acceptsValueTypes.includes(sourceValueType);
}

export function filterNodeCreationEntries(
  entries: NodeCreationEntry[],
  query: string,
  sourceValueType: string | null,
  sourceAnchorKind: NodeCreationAnchorKind | null = null,
) {
  const normalizedQuery = normalizeSearchValue(query);
  return entries.filter(
    (entry) =>
      matchesNodeCreationQuery(entry, normalizedQuery) &&
      supportsCreationSourceType(entry, sourceValueType, sourceAnchorKind),
  );
}

export function sortNodeCreationEntries(entries: NodeCreationEntry[]) {
  return [...entries].sort((left, right) => {
    const familyDelta = NODE_CREATION_FAMILY_PRIORITY[left.family] - NODE_CREATION_FAMILY_PRIORITY[right.family];
    if (familyDelta !== 0) {
      return familyDelta;
    }
    if (left.mode !== right.mode) {
      return left.mode === "node" ? -1 : 1;
    }
    if ((left.origin ?? "builtin") !== (right.origin ?? "builtin")) {
      return (left.origin ?? "builtin") === "builtin" ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
}

export function buildNodeCreationEntries(input: BuildNodeCreationEntriesInput) {
  const presetEntries = input.presets.map(toPresetEntry);
  const graphEntries = (input.graphs ?? []).map(toSubgraphEntry);
  return sortNodeCreationEntries(
    filterNodeCreationEntries(
      [...input.builtins, ...presetEntries, ...graphEntries],
      input.query,
      input.sourceValueType,
      input.sourceAnchorKind ?? null,
    ),
  );
}

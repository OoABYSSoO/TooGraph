import { NODE_CREATION_FAMILY_PRIORITY } from "./nodeCreationBuiltins.ts";

import type { NodeCreationEntry, PresetDocument } from "@/types/node-system";

type BuildNodeCreationEntriesInput = {
  builtins: NodeCreationEntry[];
  presets: PresetDocument[];
  query: string;
  sourceValueType: string | null;
  sourceAnchorKind?: "flow-out" | "route-out" | "state-out" | null;
};

function normalizeSearchValue(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
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
  sourceAnchorKind: "flow-out" | "route-out" | "state-out" | null = null,
) {
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
  sourceAnchorKind: "flow-out" | "route-out" | "state-out" | null = null,
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
  return sortNodeCreationEntries(
    filterNodeCreationEntries(
      [...input.builtins, ...presetEntries],
      input.query,
      input.sourceValueType,
      input.sourceAnchorKind ?? null,
    ),
  );
}

import type { NodeFamily, PresetDocument } from "../types/node-system.ts";

export type PresetKindFilter = "all" | NodeFamily;

export type PresetManagementFilters = {
  query: string;
  kind: PresetKindFilter;
};

export type PresetOverview = {
  total: number;
  agent: number;
  stateFields: number;
  latestUpdatedAt: string | null;
};

export function buildPresetKindOptions(): PresetKindFilter[] {
  return ["all", "input", "agent", "condition", "output"];
}

export function filterPresetsForManagement(
  presets: PresetDocument[],
  filters: PresetManagementFilters,
): PresetDocument[] {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return presets.filter((preset) => {
    if (filters.kind !== "all" && preset.definition.node.kind !== filters.kind) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return buildPresetSearchText(preset).includes(normalizedQuery);
  });
}

export function buildPresetOverview(presets: PresetDocument[]): PresetOverview {
  return {
    total: presets.length,
    agent: presets.filter((preset) => preset.definition.node.kind === "agent").length,
    stateFields: presets.reduce((count, preset) => count + Object.keys(preset.definition.state_schema).length, 0),
    latestUpdatedAt: presets.map((preset) => preset.updatedAt).filter(Boolean).sort().at(-1) ?? null,
  };
}

function buildPresetSearchText(preset: PresetDocument): string {
  const node = preset.definition.node;
  const skills = node.kind === "agent" ? node.config.skills : [];
  const states = [
    ...Object.keys(preset.definition.state_schema),
    ...node.reads.map((binding) => binding.state),
    ...node.writes.map((binding) => binding.state),
  ];

  return [
    preset.presetId,
    preset.sourcePresetId ?? "",
    preset.status,
    preset.definition.label,
    preset.definition.description,
    node.kind,
    node.name,
    node.description,
    ...skills,
    ...states,
  ]
    .join(" ")
    .toLowerCase();
}

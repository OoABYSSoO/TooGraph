import type { GraphDocument, GraphPayload, PresetDocument, StateDefinition } from "@/types/node-system";

export type PresetPayload = {
  presetId: string;
  sourcePresetId: string | null;
  definition: PresetDocument["definition"];
};

export function slugifyPresetBase(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "node"
  );
}

export function buildPresetPayloadForNode(
  document: GraphPayload | GraphDocument,
  nodeId: string,
  options: { idSuffix?: string } = {},
): PresetPayload | null {
  const node = document.nodes[nodeId];
  if (!node) {
    return null;
  }

  const referencedStateKeys = Array.from(new Set([...node.reads.map((binding) => binding.state), ...node.writes.map((binding) => binding.state)]));
  const stateSchema = Object.fromEntries(
    referencedStateKeys
      .map((stateKey) => [stateKey, document.state_schema[stateKey]] as const)
      .filter((entry): entry is readonly [string, StateDefinition] => Boolean(entry[1])),
  );

  return {
    presetId: `preset.local.${node.kind}.${slugifyPresetBase(node.name)}.${options.idSuffix ?? createPresetIdSuffix()}`,
    sourcePresetId: null,
    definition: {
      label: node.name,
      description: node.description,
      state_schema: stateSchema,
      node: structuredClone(node),
    },
  };
}

function createPresetIdSuffix() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 6);
  }
  return Math.random().toString(36).slice(2, 8) || "preset";
}

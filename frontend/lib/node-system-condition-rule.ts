import type { CanonicalStateDefinition } from "./node-system-canonical.ts";

export function buildConditionRuleSourceOptions(
  reads: Array<{ state: string; required?: boolean }>,
  stateSchema: Record<string, CanonicalStateDefinition>,
) {
  return reads.map((binding) => ({
    value: binding.state,
    label: stateSchema[binding.state]?.name || binding.state,
  }));
}

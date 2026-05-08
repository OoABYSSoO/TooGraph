import type { GraphNode, StateDefinition } from "../types/node-system.ts";

export function isAgentOutputManagedByDynamicCapability(input: {
  nodeId: string;
  node: GraphNode | undefined;
  stateSchema: Record<string, StateDefinition> | undefined;
}) {
  const node = input.node;
  if (!node || node.kind !== "agent") {
    return false;
  }

  const hasIncomingCapability = !node.config.skillKey.trim() && node.reads.some(
    (binding) => input.stateSchema?.[binding.state]?.type?.trim() === "capability",
  );
  if (hasIncomingCapability) {
    return true;
  }

  return node.writes.some((binding) => {
    const stateBinding = input.stateSchema?.[binding.state]?.binding;
    return (
      stateBinding?.kind === "capability_result" &&
      stateBinding.nodeId === input.nodeId &&
      stateBinding.managed !== false
    );
  });
}

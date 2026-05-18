import type { ReadBinding } from "../types/node-system.ts";

export function resolveManagedActionInputSlotKey(binding: Pick<ReadBinding, "binding">) {
  const metadata = binding.binding;
  if (metadata?.kind !== "action_input" || metadata.managed === false) {
    return null;
  }
  return `action_input_${encodeSlotToken(metadata.actionKey)}_${encodeSlotToken(metadata.fieldKey)}`;
}

export function resolveManagedToolInputSlotKey(binding: Pick<ReadBinding, "binding">) {
  const metadata = binding.binding;
  if (metadata?.kind !== "tool_input" || metadata.managed === false) {
    return null;
  }
  return `tool_input_${encodeSlotToken(metadata.toolKey)}_${encodeSlotToken(metadata.fieldKey)}`;
}

function encodeSlotToken(value: string) {
  return encodeURIComponent(value.trim()).replace(/%/g, "_");
}

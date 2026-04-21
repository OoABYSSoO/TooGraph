import type { GraphNode } from "../types/node-system.ts";

export const VIRTUAL_ANY_INPUT_STATE_KEY = "__graphiteui_virtual_any_input__";
export const VIRTUAL_ANY_INPUT_LABEL = "any";
export const VIRTUAL_ANY_INPUT_COLOR = "#9a3412";
export const CREATE_AGENT_INPUT_STATE_KEY = "__graphiteui_create_agent_input__";

export function isVirtualAnyInputStateKey(stateKey: string | null | undefined) {
  return stateKey === VIRTUAL_ANY_INPUT_STATE_KEY;
}

export function isCreateAgentInputStateKey(stateKey: string | null | undefined) {
  return stateKey === CREATE_AGENT_INPUT_STATE_KEY;
}

export function shouldExposeVirtualAnyInput(node: Pick<GraphNode, "kind" | "reads">) {
  return node.kind !== "input" && node.reads.length === 0;
}

export function buildVirtualAnyInputPort() {
  return {
    key: VIRTUAL_ANY_INPUT_STATE_KEY,
    label: VIRTUAL_ANY_INPUT_LABEL,
    typeLabel: VIRTUAL_ANY_INPUT_LABEL,
    stateColor: VIRTUAL_ANY_INPUT_COLOR,
    virtual: true,
  } as const;
}

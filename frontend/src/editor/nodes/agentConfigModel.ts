import {
  GLOBAL_RUNTIME_MODEL_OPTION_VALUE,
  buildRuntimeModelDisplayLookup,
  buildRuntimeModelSelectOptions,
  resolveRuntimeModelCatalog,
} from "../../lib/runtimeModelCatalog.ts";

export const DEFAULT_AGENT_TEMPERATURE = 0.2;
export { GLOBAL_RUNTIME_MODEL_OPTION_VALUE };

export type AgentThinkingControlMode = "off" | "low" | "medium" | "high" | "xhigh";

export function normalizeAgentTemperature(value: number | undefined) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_AGENT_TEMPERATURE;
  return Math.min(2, Math.max(0, numeric));
}

export function resolveAgentTemperatureInputValue(value: string | number) {
  const nextValue = typeof value === "number" ? value : value === "" ? DEFAULT_AGENT_TEMPERATURE : Number(value);
  if (!Number.isFinite(nextValue)) {
    return null;
  }
  return normalizeAgentTemperature(nextValue);
}

export function normalizeAgentThinkingMode(value: string | null | undefined): AgentThinkingControlMode {
  if (value === "off" || value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }
  if (value === "minimal") {
    return "low";
  }
  if (value === "on") {
    return "high";
  }
  return "off";
}

export const buildAgentModelDisplayLookup = buildRuntimeModelDisplayLookup;

export function buildAgentModelSelectOptions(
  globalTextModelRef: string,
  availableModelRefs: string[],
  modelDisplayLookup: Record<string, string>,
) {
  return buildRuntimeModelSelectOptions(globalTextModelRef, availableModelRefs, modelDisplayLookup);
}

export function resolveAgentModelSelection(nextValue: string) {
  if (nextValue === GLOBAL_RUNTIME_MODEL_OPTION_VALUE) {
    return {
      modelSource: "global" as const,
      model: "",
    };
  }

  return {
    modelSource: "override" as const,
    model: nextValue,
  };
}

export const resolveAgentRuntimeCatalog = resolveRuntimeModelCatalog;

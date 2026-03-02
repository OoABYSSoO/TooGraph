import type { SettingsPayload } from "../../types/settings.ts";

export const DEFAULT_AGENT_TEMPERATURE = 0.2;

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
    return "medium";
  }
  return "off";
}

export function buildAgentModelDisplayLookup(
  models: Array<{
    model_ref: string;
    model: string;
    label: string;
    route_target?: string | null;
  }>,
) {
  const baseLabels = models.map((model) => getConcreteModelName(model));
  const duplicateCount = new Map<string, number>();

  for (const label of baseLabels) {
    duplicateCount.set(label, (duplicateCount.get(label) ?? 0) + 1);
  }

  return Object.fromEntries(
    models.map((model, index) => {
      const baseLabel = baseLabels[index];
      const alias = model.model?.trim() || formatModelChoiceLabel(model.model_ref);
      const label =
        (duplicateCount.get(baseLabel) ?? 0) > 1 && alias && alias !== baseLabel ? `${baseLabel} · ${alias}` : baseLabel;
      return [model.model_ref, label];
    }),
  ) as Record<string, string>;
}

export function buildAgentModelSelectOptions(
  resolvedModel: string,
  availableModelRefs: string[],
  modelDisplayLookup: Record<string, string>,
) {
  void resolvedModel;
  const seen = new Set<string>();

  return availableModelRefs.flatMap((modelRef) => {
    const trimmed = modelRef.trim();
    if (!trimmed || seen.has(trimmed)) {
      return [];
    }
    seen.add(trimmed);
    return [
      {
        value: trimmed,
        label: modelDisplayLookup[trimmed] || formatModelChoiceLabel(trimmed),
      },
    ];
  });
}

export function resolveAgentModelSelection(nextValue: string, globalTextModelRef: string) {
  if (nextValue === globalTextModelRef) {
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

export function resolveAgentRuntimeCatalog(settings: SettingsPayload | null | undefined) {
  const configuredModels = (settings?.model_catalog?.providers ?? [])
    .filter((provider) => provider.configured && provider.enabled !== false && (!provider.requires_login || provider.auth_status?.authenticated))
    .flatMap((provider) => provider.models);

  return {
    globalTextModelRef: settings?.agent_runtime_defaults?.model?.trim() || settings?.model.text_model_ref?.trim() || "",
    availableModelRefs: Array.from(
      new Set(
        configuredModels
          .map((model) => model.model_ref.trim())
          .filter((modelRef) => modelRef.length > 0),
      ),
    ),
    modelDisplayLookup: buildAgentModelDisplayLookup(configuredModels),
  };
}

function formatModelChoiceLabel(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) {
    return "";
  }
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
}

function getConcreteModelName(model: {
  model_ref: string;
  model: string;
  label: string;
  route_target?: string | null;
}) {
  return model.route_target?.trim() || model.label?.trim() || model.model?.trim() || formatModelChoiceLabel(model.model_ref);
}

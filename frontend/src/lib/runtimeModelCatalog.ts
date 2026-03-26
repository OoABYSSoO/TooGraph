import type { SettingsPayload, SettingsProviderModel } from "../types/settings.ts";

export type RuntimeModelOption = {
  value: string;
  label: string;
};

export type RuntimeModelCatalog = {
  globalTextModelRef: string;
  availableModelRefs: string[];
  modelDisplayLookup: Record<string, string>;
};

export function buildRuntimeModelDisplayLookup(models: SettingsProviderModel[]) {
  const baseLabels = models.map((model) => getConcreteModelName(model));
  const duplicateCount = new Map<string, number>();

  for (const label of baseLabels) {
    duplicateCount.set(label, (duplicateCount.get(label) ?? 0) + 1);
  }

  return Object.fromEntries(
    models.map((model, index) => {
      const baseLabel = baseLabels[index];
      const alias = model.model?.trim() || formatRuntimeModelChoiceLabel(model.model_ref);
      const label =
        (duplicateCount.get(baseLabel) ?? 0) > 1 && alias && alias !== baseLabel ? `${baseLabel} · ${alias}` : baseLabel;
      return [model.model_ref, label];
    }),
  ) as Record<string, string>;
}

export function buildRuntimeModelSelectOptions(
  availableModelRefs: string[],
  modelDisplayLookup: Record<string, string>,
): RuntimeModelOption[] {
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
        label: modelDisplayLookup[trimmed] || formatRuntimeModelChoiceLabel(trimmed),
      },
    ];
  });
}

export function buildRuntimeModelOptions(settings: SettingsPayload | null | undefined): RuntimeModelOption[] {
  const catalog = resolveRuntimeModelCatalog(settings);
  return buildRuntimeModelSelectOptions(catalog.availableModelRefs, catalog.modelDisplayLookup);
}

export function resolveRuntimeModelCatalog(settings: SettingsPayload | null | undefined): RuntimeModelCatalog {
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
    modelDisplayLookup: buildRuntimeModelDisplayLookup(configuredModels),
  };
}

function formatRuntimeModelChoiceLabel(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) {
    return "";
  }
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
}

function getConcreteModelName(model: SettingsProviderModel) {
  return model.route_target?.trim() || model.label?.trim() || model.model?.trim() || formatRuntimeModelChoiceLabel(model.model_ref);
}

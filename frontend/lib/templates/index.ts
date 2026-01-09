import type { GraphDocument, ThemePreset } from "@/types/editor";

import {
  createCreativeFactoryGraphDocument,
  CREATIVE_FACTORY_THEME_PRESETS,
  getCreativeFactoryThemePresetById,
} from "@/lib/templates/creative-factory";

export function createTemplateGraphDocument(templateId: string, graphId: string, themePresetId?: string): GraphDocument {
  if (templateId === "creative_factory") {
    return createCreativeFactoryGraphDocument(graphId, themePresetId);
  }
  return createCreativeFactoryGraphDocument(graphId, themePresetId);
}

export function createTemplateShellDocument(templateId: string, graphId: string, themePresetId?: string): GraphDocument {
  const preset = getTemplateThemePresetById(templateId, themePresetId ?? "") ?? getTemplateThemePresets(templateId)[0];
  return {
    graphId,
    name: preset?.graphName ?? "Creative Factory",
    templateId,
    themeConfig: preset?.themeConfig ?? getTemplateThemePresets(templateId)[0].themeConfig,
    stateSchema: [],
    nodes: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createStarterGraphDocument(graphId: string, themePresetId?: string): GraphDocument {
  return createTemplateShellDocument("creative_factory", graphId, themePresetId);
}

export function getTemplateThemePresetById(templateId: string, themePresetId: string) {
  if (templateId === "creative_factory") {
    return getCreativeFactoryThemePresetById(themePresetId);
  }
  return getCreativeFactoryThemePresetById(themePresetId);
}

export function getTemplateThemePresets(templateId: string): ThemePreset[] {
  if (templateId === "creative_factory") {
    return CREATIVE_FACTORY_THEME_PRESETS;
  }
  return CREATIVE_FACTORY_THEME_PRESETS;
}

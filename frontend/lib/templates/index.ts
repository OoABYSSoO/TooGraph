import type { GraphDocument, ThemePreset } from "@/types/editor";

import {
  CREATIVE_FACTORY_THEME_PRESETS,
  getCreativeFactoryThemePresetById,
} from "@/lib/templates/creative-factory";
import {
  HELLO_WORLD_THEME_PRESETS,
  getHelloWorldThemePresetById,
} from "@/lib/templates/hello-world";

function normalizeTemplateId(templateIdOrGraphId: string): string {
  if (templateIdOrGraphId === "creative_factory" || templateIdOrGraphId === "hello_world") {
    return templateIdOrGraphId;
  }
  if (templateIdOrGraphId === "creative-factory" || templateIdOrGraphId === "template-creative-factory") {
    return "creative_factory";
  }
  if (templateIdOrGraphId === "hello-world" || templateIdOrGraphId === "template-hello-world") {
    return "hello_world";
  }
  return "creative_factory";
}

export function createTemplateShellDocument(templateId: string, graphId: string, themePresetId?: string): GraphDocument {
  const normalizedTemplateId = normalizeTemplateId(templateId);
  const preset = getTemplateThemePresetById(normalizedTemplateId, themePresetId ?? "") ?? getTemplateThemePresets(normalizedTemplateId)[0];
  return {
    graphId,
    name: preset?.graphName ?? "Creative Factory",
    templateId: normalizedTemplateId,
    themeConfig: preset?.themeConfig ?? getTemplateThemePresets(normalizedTemplateId)[0].themeConfig,
    stateSchema: [],
    nodes: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createStarterGraphDocument(graphId: string, themePresetId?: string): GraphDocument {
  return createTemplateShellDocument(normalizeTemplateId(graphId), graphId, themePresetId);
}

export function getTemplateThemePresetById(templateId: string, themePresetId: string) {
  const normalizedTemplateId = normalizeTemplateId(templateId);
  if (normalizedTemplateId === "creative_factory") {
    return getCreativeFactoryThemePresetById(themePresetId);
  }
  if (normalizedTemplateId === "hello_world") {
    return getHelloWorldThemePresetById(themePresetId);
  }
  return getCreativeFactoryThemePresetById(themePresetId);
}

export function getTemplateThemePresets(templateId: string): ThemePreset[] {
  const normalizedTemplateId = normalizeTemplateId(templateId);
  if (normalizedTemplateId === "creative_factory") {
    return CREATIVE_FACTORY_THEME_PRESETS;
  }
  if (normalizedTemplateId === "hello_world") {
    return HELLO_WORLD_THEME_PRESETS;
  }
  return CREATIVE_FACTORY_THEME_PRESETS;
}

import type { ThemePreset } from "@/types/editor";

export const HELLO_WORLD_THEME_PRESETS: ThemePreset[] = [
  {
    id: "hello_local",
    label: "Hello Local",
    description: "Minimal local LLM validation flow.",
    graphName: "Hello World",
    nodeParamOverrides: {},
    themeConfig: {
      themePreset: "hello_local",
      domain: "llm_validation",
      genre: "hello_world",
      market: "local",
      platform: "openai_compatible",
      language: "zh",
      creativeStyle: "minimal",
      tone: "plain",
      languageConstraints: [],
      evaluationPolicy: {},
      assetSourcePolicy: {},
      strategyProfile: {
        hookTheme: "",
        payoffTheme: "",
        visualPattern: "",
        pacingPattern: "",
        evaluationFocus: [],
      },
    },
  },
];

export function getHelloWorldThemePresetById(themePresetId: string): ThemePreset | undefined {
  return HELLO_WORLD_THEME_PRESETS.find((preset) => preset.id === themePresetId);
}

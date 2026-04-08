"use client";

import type { ThemeConfig, ThemePreset } from "@/types/editor";

type Props = {
  graphName: string;
  themeConfig: ThemeConfig;
  presets: ThemePreset[];
  onGraphNameChange: (value: string) => void;
  onThemeConfigChange: (patch: Partial<ThemeConfig>) => void;
  onApplyPreset: (presetId: string) => void;
};

function joinList(values: string[]) {
  return values.join(", ");
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ThemeConfigPanel({
  graphName,
  themeConfig,
  presets,
  onGraphNameChange,
  onThemeConfigChange,
  onApplyPreset,
}: Props) {
  const selectedPreset = presets.find((preset) => preset.id === themeConfig.themePreset) ?? null;

  return (
    <section className="card editor-theme-card">
      <div className="theme-grid">
        <label className="field">
          <span>Graph Name</span>
          <input className="text-input" value={graphName} onChange={(event) => onGraphNameChange(event.target.value)} />
        </label>
        <label className="field">
          <span>Theme Preset</span>
          <select className="text-input" value={themeConfig.themePreset} onChange={(event) => onApplyPreset(event.target.value)}>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Domain</span>
          <input className="text-input" value={themeConfig.domain} onChange={(event) => onThemeConfigChange({ domain: event.target.value })} />
        </label>
        <label className="field">
          <span>Genre</span>
          <input className="text-input" value={themeConfig.genre} onChange={(event) => onThemeConfigChange({ genre: event.target.value })} />
        </label>
        <label className="field">
          <span>Market</span>
          <input className="text-input" value={themeConfig.market} onChange={(event) => onThemeConfigChange({ market: event.target.value })} />
        </label>
        <label className="field">
          <span>Platform</span>
          <input className="text-input" value={themeConfig.platform} onChange={(event) => onThemeConfigChange({ platform: event.target.value })} />
        </label>
        <label className="field">
          <span>Language</span>
          <input className="text-input" value={themeConfig.language} onChange={(event) => onThemeConfigChange({ language: event.target.value })} />
        </label>
        <label className="field">
          <span>Creative Style</span>
          <input className="text-input" value={themeConfig.creativeStyle} onChange={(event) => onThemeConfigChange({ creativeStyle: event.target.value })} />
        </label>
        <label className="field">
          <span>Tone</span>
          <input className="text-input" value={themeConfig.tone} onChange={(event) => onThemeConfigChange({ tone: event.target.value })} />
        </label>
      </div>
      <div className="theme-grid">
        <label className="field">
          <span>Hook Theme</span>
          <input
            className="text-input"
            value={themeConfig.strategyProfile.hookTheme}
            onChange={(event) =>
              onThemeConfigChange({
                strategyProfile: { ...themeConfig.strategyProfile, hookTheme: event.target.value },
              })
            }
          />
        </label>
        <label className="field">
          <span>Payoff Theme</span>
          <input
            className="text-input"
            value={themeConfig.strategyProfile.payoffTheme}
            onChange={(event) =>
              onThemeConfigChange({
                strategyProfile: { ...themeConfig.strategyProfile, payoffTheme: event.target.value },
              })
            }
          />
        </label>
        <label className="field">
          <span>Visual Pattern</span>
          <input
            className="text-input"
            value={themeConfig.strategyProfile.visualPattern}
            onChange={(event) =>
              onThemeConfigChange({
                strategyProfile: { ...themeConfig.strategyProfile, visualPattern: event.target.value },
              })
            }
          />
        </label>
        <label className="field">
          <span>Pacing Pattern</span>
          <input
            className="text-input"
            value={themeConfig.strategyProfile.pacingPattern}
            onChange={(event) =>
              onThemeConfigChange({
                strategyProfile: { ...themeConfig.strategyProfile, pacingPattern: event.target.value },
              })
            }
          />
        </label>
        <label className="field">
          <span>Evaluation Focus</span>
          <input
            className="text-input"
            value={joinList(themeConfig.strategyProfile.evaluationFocus)}
            onChange={(event) =>
              onThemeConfigChange({
                strategyProfile: { ...themeConfig.strategyProfile, evaluationFocus: splitList(event.target.value) },
              })
            }
          />
        </label>
      </div>
      {selectedPreset ? (
        <div className="preset-banner">
          <strong>{selectedPreset.label}</strong>
          <span>{selectedPreset.description}</span>
          <span>Hook: {themeConfig.strategyProfile.hookTheme}</span>
          <span>Payoff: {themeConfig.strategyProfile.payoffTheme}</span>
          <span>Visual: {themeConfig.strategyProfile.visualPattern}</span>
          <span>Focus: {themeConfig.strategyProfile.evaluationFocus.join(" / ") || "None"}</span>
        </div>
      ) : null}
    </section>
  );
}

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
    <section className="rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">
      <div className="grid grid-cols-4 gap-3.5 max-[960px]:grid-cols-1">
        <label className="grid gap-2 text-[0.94rem]">
          <span>Graph Name</span>
          <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={graphName} onChange={(event) => onGraphNameChange(event.target.value)} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Theme Preset</span>
          <select className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={themeConfig.themePreset} onChange={(event) => onApplyPreset(event.target.value)}>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Domain</span>
          <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={themeConfig.domain} onChange={(event) => onThemeConfigChange({ domain: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Genre</span>
          <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={themeConfig.genre} onChange={(event) => onThemeConfigChange({ genre: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Market</span>
          <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={themeConfig.market} onChange={(event) => onThemeConfigChange({ market: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Platform</span>
          <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={themeConfig.platform} onChange={(event) => onThemeConfigChange({ platform: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Language</span>
          <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={themeConfig.language} onChange={(event) => onThemeConfigChange({ language: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Creative Style</span>
          <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={themeConfig.creativeStyle} onChange={(event) => onThemeConfigChange({ creativeStyle: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Tone</span>
          <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={themeConfig.tone} onChange={(event) => onThemeConfigChange({ tone: event.target.value })} />
        </label>
      </div>
      <div className="mt-3.5 grid grid-cols-4 gap-3.5 max-[960px]:grid-cols-1">
        <label className="grid gap-2 text-[0.94rem]">
          <span>Hook Theme</span>
          <input
            className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
            value={themeConfig.strategyProfile.hookTheme}
            onChange={(event) =>
              onThemeConfigChange({
                strategyProfile: { ...themeConfig.strategyProfile, hookTheme: event.target.value },
              })
            }
          />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Payoff Theme</span>
          <input
            className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
            value={themeConfig.strategyProfile.payoffTheme}
            onChange={(event) =>
              onThemeConfigChange({
                strategyProfile: { ...themeConfig.strategyProfile, payoffTheme: event.target.value },
              })
            }
          />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Visual Pattern</span>
          <input
            className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
            value={themeConfig.strategyProfile.visualPattern}
            onChange={(event) =>
              onThemeConfigChange({
                strategyProfile: { ...themeConfig.strategyProfile, visualPattern: event.target.value },
              })
            }
          />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Pacing Pattern</span>
          <input
            className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
            value={themeConfig.strategyProfile.pacingPattern}
            onChange={(event) =>
              onThemeConfigChange({
                strategyProfile: { ...themeConfig.strategyProfile, pacingPattern: event.target.value },
              })
            }
          />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Evaluation Focus</span>
          <input
            className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
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
        <div className="mt-3.5 grid gap-1.5 rounded-2xl border border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.74)] px-3.5 py-3">
          <strong>{selectedPreset.label}</strong>
          <span className="text-[var(--muted)]">{selectedPreset.description}</span>
          <span className="text-[var(--muted)]">Hook: {themeConfig.strategyProfile.hookTheme}</span>
          <span className="text-[var(--muted)]">Payoff: {themeConfig.strategyProfile.payoffTheme}</span>
          <span className="text-[var(--muted)]">Visual: {themeConfig.strategyProfile.visualPattern}</span>
          <span className="text-[var(--muted)]">Focus: {themeConfig.strategyProfile.evaluationFocus.join(" / ") || "None"}</span>
        </div>
      ) : null}
    </section>
  );
}

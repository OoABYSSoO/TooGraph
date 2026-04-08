"use client";

import { Card, SubtleCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
    <Card>
      <div className="grid grid-cols-4 gap-3.5 max-[960px]:grid-cols-1">
        <label className="grid gap-2 text-[0.94rem]">
          <span>Graph Name</span>
          <Input value={graphName} onChange={(event) => onGraphNameChange(event.target.value)} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Theme Preset</span>
          <Select value={themeConfig.themePreset} onChange={(event) => onApplyPreset(event.target.value)}>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Domain</span>
          <Input value={themeConfig.domain} onChange={(event) => onThemeConfigChange({ domain: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Genre</span>
          <Input value={themeConfig.genre} onChange={(event) => onThemeConfigChange({ genre: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Market</span>
          <Input value={themeConfig.market} onChange={(event) => onThemeConfigChange({ market: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Platform</span>
          <Input value={themeConfig.platform} onChange={(event) => onThemeConfigChange({ platform: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Language</span>
          <Input value={themeConfig.language} onChange={(event) => onThemeConfigChange({ language: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Creative Style</span>
          <Input value={themeConfig.creativeStyle} onChange={(event) => onThemeConfigChange({ creativeStyle: event.target.value })} />
        </label>
        <label className="grid gap-2 text-[0.94rem]">
          <span>Tone</span>
          <Input value={themeConfig.tone} onChange={(event) => onThemeConfigChange({ tone: event.target.value })} />
        </label>
      </div>
      <div className="mt-3.5 grid grid-cols-4 gap-3.5 max-[960px]:grid-cols-1">
        <label className="grid gap-2 text-[0.94rem]">
          <span>Hook Theme</span>
          <Input
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
          <Input
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
          <Input
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
          <Input
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
          <Input
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
        <SubtleCard className="mt-3.5 grid gap-1.5 border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.74)] px-3.5 py-3">
          <strong>{selectedPreset.label}</strong>
          <span className="text-[var(--muted)]">{selectedPreset.description}</span>
          <span className="text-[var(--muted)]">Hook: {themeConfig.strategyProfile.hookTheme}</span>
          <span className="text-[var(--muted)]">Payoff: {themeConfig.strategyProfile.payoffTheme}</span>
          <span className="text-[var(--muted)]">Visual: {themeConfig.strategyProfile.visualPattern}</span>
          <span className="text-[var(--muted)]">Focus: {themeConfig.strategyProfile.evaluationFocus.join(" / ") || "None"}</span>
        </SubtleCard>
      ) : null}
    </Card>
  );
}

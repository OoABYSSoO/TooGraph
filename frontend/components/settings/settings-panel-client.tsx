"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoBlock } from "@/components/ui/info-block";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/lib/api";
import { useLanguage } from "@/components/providers/language-provider";

type SettingsPayload = {
  model: {
    text_model: string;
    text_model_ref: string;
    video_model: string;
    video_model_ref: string;
  };
  agent_runtime_defaults?: {
    model: string;
    thinking_enabled: boolean;
    temperature: number;
  };
  model_catalog?: {
    providers: Array<{
      provider_id: string;
      label: string;
      description: string;
      transport: string;
      configured: boolean;
      base_url: string;
      models: Array<{
        model_ref: string;
        model: string;
        label: string;
        route_target?: string | null;
      }>;
      example_model_refs: string[];
    }>;
  };
  revision: {
    max_revision_round: number;
  };
  evaluator: {
    default_score_threshold: number;
    routes: string[];
  };
  tools: string[];
};

type SettingsDraft = {
  text_model_ref: string;
  video_model_ref: string;
  thinking_enabled: boolean;
  temperature: number;
};

function formatModelChoiceLabel(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) return "";
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
}

function getConcreteModelName(model: {
  model_ref: string;
  model: string;
  label: string;
  route_target?: string | null;
}) {
  return (
    model.route_target?.trim() ||
    model.label?.trim() ||
    model.model?.trim() ||
    formatModelChoiceLabel(model.model_ref)
  );
}

function buildModelDisplayLookup(
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
        (duplicateCount.get(baseLabel) ?? 0) > 1 && alias && alias !== baseLabel
          ? `${baseLabel} · ${alias}`
          : baseLabel;
      return [model.model_ref, label];
    }),
  ) as Record<string, string>;
}

function buildDraftFromSettings(settings: SettingsPayload): SettingsDraft {
  return {
    text_model_ref: settings.agent_runtime_defaults?.model ?? settings.model.text_model_ref,
    video_model_ref: settings.model.video_model_ref,
    thinking_enabled: settings.agent_runtime_defaults?.thinking_enabled ?? true,
    temperature: settings.agent_runtime_defaults?.temperature ?? 0.2,
  };
}

export function SettingsPanelClient() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      try {
        const payload = await apiGet<SettingsPayload>("/api/settings");
        if (!cancelled) {
          setSettings(payload);
          setDraft(buildDraftFromSettings(payload));
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load settings.");
        }
      }
    }
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const configuredModels = useMemo(
    () =>
      (settings?.model_catalog?.providers ?? [])
        .filter((provider) => provider.configured)
        .flatMap((provider) => provider.models),
    [settings],
  );

  const modelDisplayLookup = useMemo(() => buildModelDisplayLookup(configuredModels), [configuredModels]);

  const configuredModelOptions = useMemo(
    () =>
      Array.from(
        new Map(
          configuredModels.map((model) => [
            model.model_ref,
            {
              value: model.model_ref,
              label: modelDisplayLookup[model.model_ref] || model.model_ref,
            },
          ]),
        ).values(),
      ),
    [configuredModels, modelDisplayLookup],
  );

  if (error) {
    return <EmptyState>{t("common.failed")}: {error}</EmptyState>;
  }

  if (!settings) {
    return <EmptyState>{t("common.loading")}</EmptyState>;
  }
  const currentDraft = draft ?? buildDraftFromSettings(settings);
  const isDirty =
    JSON.stringify(currentDraft) !== JSON.stringify(buildDraftFromSettings(settings));

  async function handleSave() {
    try {
      setIsSaving(true);
      setSaveMessage(null);
      const payload = await apiPost<SettingsPayload>("/api/settings", {
        model: {
          text_model_ref: currentDraft.text_model_ref,
          video_model_ref: currentDraft.video_model_ref,
        },
        agent_runtime_defaults: {
          model: currentDraft.text_model_ref,
          thinking_enabled: currentDraft.thinking_enabled,
          temperature: currentDraft.temperature,
        },
      });
      setSettings(payload);
      setDraft(buildDraftFromSettings(payload));
      setError(null);
      setSaveMessage("设置已保存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="grid grid-cols-12 gap-[18px] max-[960px]:grid-cols-1">
      <Card className="col-span-4 max-[960px]:col-span-1">
        <h2 className="mb-2.5">Default Runtime</h2>
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Default model</span>
            <select
              className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
              value={currentDraft.text_model_ref}
              onChange={(event) =>
                setDraft((current) => ({
                  ...(current ?? buildDraftFromSettings(settings)),
                  text_model_ref: event.target.value,
                }))
              }
            >
              {configuredModelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Default video model</span>
            <select
              className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
              value={currentDraft.video_model_ref}
              onChange={(event) =>
                setDraft((current) => ({
                  ...(current ?? buildDraftFromSettings(settings)),
                  video_model_ref: event.target.value,
                }))
              }
            >
              {configuredModelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>
      <Card className="col-span-4 max-[960px]:col-span-1">
        <h2 className="mb-2.5">Agent Runtime</h2>
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Default thinking</span>
            <select
              className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
              value={currentDraft.thinking_enabled ? "on" : "off"}
              onChange={(event) =>
                setDraft((current) => ({
                  ...(current ?? buildDraftFromSettings(settings)),
                  thinking_enabled: event.target.value === "on",
                }))
              }
            >
              <option value="off">off</option>
              <option value="on">on</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Default temperature</span>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={String(currentDraft.temperature)}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (!Number.isFinite(nextValue)) return;
                setDraft((current) => ({
                  ...(current ?? buildDraftFromSettings(settings)),
                  temperature: Math.min(2, Math.max(0, nextValue)),
                }));
              }}
            />
          </label>
          <div className="rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.6)] px-3.5 py-3 text-sm text-[var(--muted)]">
            New agent nodes start from this default value. Existing nodes can still be changed per node.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleSave} disabled={!isDirty || isSaving}>
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
            {saveMessage ? <span className="text-sm text-[var(--muted)]">{saveMessage}</span> : null}
          </div>
        </div>
      </Card>
      <Card className="col-span-4 max-[960px]:col-span-1">
        <h2 className="mb-2.5">Revision & Evaluator</h2>
        <div className="grid gap-3">
          <InfoBlock title="Max revision rounds">{settings.revision.max_revision_round}</InfoBlock>
          <InfoBlock title="Threshold">{settings.evaluator.default_score_threshold}</InfoBlock>
          <InfoBlock title="Routes">{settings.evaluator.routes.join(", ")}</InfoBlock>
        </div>
      </Card>
      <Card className="col-span-12">
        <h2 className="mb-2.5">Model Providers</h2>
        <div className="grid gap-3">
          {(settings.model_catalog?.providers ?? []).map((provider) => (
            <div key={provider.provider_id} className="rounded-[18px] border border-[var(--line)] bg-[rgba(255,255,255,0.7)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold">{provider.label}</div>
                <Badge>{provider.provider_id}</Badge>
                <Badge>{provider.transport}</Badge>
                <Badge>{provider.configured ? "configured" : "planned"}</Badge>
              </div>
              <div className="mt-2 text-sm text-[var(--muted)]">{provider.description}</div>
              <div className="mt-3 text-xs text-[var(--muted)]">Base URL: {provider.base_url}</div>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {provider.models.map((model) => (
                  <Badge key={model.model_ref} title={model.model_ref}>
                    {modelDisplayLookup[model.model_ref] || model.model_ref}
                  </Badge>
                ))}
                {!provider.models.length
                  ? provider.example_model_refs.map((modelRef) => (
                      <Badge key={modelRef}>{modelRef}</Badge>
                    ))
                  : null}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="col-span-12">
        <h2 className="mb-2.5">Tools</h2>
        <div className="flex flex-wrap gap-2.5">
          {settings.tools.map((tool) => (
            <Badge key={tool}>
              {tool}
            </Badge>
          ))}
        </div>
      </Card>
    </section>
  );
}

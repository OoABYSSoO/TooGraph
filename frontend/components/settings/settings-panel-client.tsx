"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import { useLanguage } from "@/components/providers/language-provider";

type SettingsPayload = {
  model: {
    text_model: string;
    video_model: string;
  };
  revision: {
    max_revision_round: number;
  };
  evaluator: {
    default_score_threshold: number;
    routes: string[];
  };
  tools: string[];
  skills: string[];
  templates: Array<{
    template_id: string;
    label: string;
    default_theme_preset: string;
  }>;
};

export function SettingsPanelClient() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      try {
        const payload = await apiGet<SettingsPayload>("/api/settings");
        if (!cancelled) {
          setSettings(payload);
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

  if (error) {
    return <section className="rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">{t("common.failed")}: {error}</section>;
  }

  if (!settings) {
    return <section className="rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">{t("common.loading")}</section>;
  }

  return (
    <section className="grid grid-cols-12 gap-[18px] max-[960px]:grid-cols-1">
      <article className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
        <h2 className="mb-2.5">Model</h2>
        <p className="text-[var(--muted)]">Text model: {settings.model.text_model}</p>
        <p className="text-[var(--muted)]">Video model: {settings.model.video_model}</p>
      </article>
      <article className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
        <h2 className="mb-2.5">Revision</h2>
        <p className="text-[var(--muted)]">Max revision rounds: {settings.revision.max_revision_round}</p>
      </article>
      <article className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
        <h2 className="mb-2.5">Evaluator</h2>
        <p className="text-[var(--muted)]">Threshold: {settings.evaluator.default_score_threshold}</p>
        <p className="text-[var(--muted)]">Routes: {settings.evaluator.routes.join(", ")}</p>
      </article>
      <article className="col-span-12 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">
        <h2 className="mb-2.5">Templates</h2>
        <div className="flex flex-wrap gap-2.5">
          {settings.templates.map((template) => (
            <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]" key={template.template_id}>
              {template.label} · {template.default_theme_preset}
            </span>
          ))}
        </div>
      </article>
      <article className="col-span-12 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">
        <h2 className="mb-2.5">Tools</h2>
        <div className="flex flex-wrap gap-2.5">
          {settings.tools.map((tool) => (
            <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]" key={tool}>
              {tool}
            </span>
          ))}
        </div>
      </article>
    </section>
  );
}

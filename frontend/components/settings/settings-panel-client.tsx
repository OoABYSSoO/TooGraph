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
    return <section className="card">{t("common.failed")}: {error}</section>;
  }

  if (!settings) {
    return <section className="card">{t("common.loading")}</section>;
  }

  return (
    <section className="grid">
      <article className="card span-4">
        <h2>Model</h2>
        <p className="muted">Text model: {settings.model.text_model}</p>
        <p className="muted">Video model: {settings.model.video_model}</p>
      </article>
      <article className="card span-4">
        <h2>Revision</h2>
        <p className="muted">Max revision rounds: {settings.revision.max_revision_round}</p>
      </article>
      <article className="card span-4">
        <h2>Evaluator</h2>
        <p className="muted">Threshold: {settings.evaluator.default_score_threshold}</p>
        <p className="muted">Routes: {settings.evaluator.routes.join(", ")}</p>
      </article>
      <article className="card span-12">
        <h2>Templates</h2>
        <div className="status-row">
          {settings.templates.map((template) => (
            <span className="pill" key={template.template_id}>
              {template.label} · {template.default_theme_preset}
            </span>
          ))}
        </div>
      </article>
      <article className="card span-12">
        <h2>Tools</h2>
        <div className="status-row">
          {settings.tools.map((tool) => (
            <span className="pill" key={tool}>
              {tool}
            </span>
          ))}
        </div>
      </article>
    </section>
  );
}

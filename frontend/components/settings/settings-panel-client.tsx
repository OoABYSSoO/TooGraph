"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";

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
};

export function SettingsPanelClient() {
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
    return <section className="card">Failed to load settings: {error}</section>;
  }

  if (!settings) {
    return <section className="card">Loading settings...</section>;
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
    </section>
  );
}


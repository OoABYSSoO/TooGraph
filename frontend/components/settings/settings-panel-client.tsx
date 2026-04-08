"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
    return <Card>{t("common.failed")}: {error}</Card>;
  }

  if (!settings) {
    return <Card>{t("common.loading")}</Card>;
  }

  return (
    <section className="grid grid-cols-12 gap-[18px] max-[960px]:grid-cols-1">
      <Card className="col-span-4 max-[960px]:col-span-1">
        <h2 className="mb-2.5">Model</h2>
        <p className="text-[var(--muted)]">Text model: {settings.model.text_model}</p>
        <p className="text-[var(--muted)]">Video model: {settings.model.video_model}</p>
      </Card>
      <Card className="col-span-4 max-[960px]:col-span-1">
        <h2 className="mb-2.5">Revision</h2>
        <p className="text-[var(--muted)]">Max revision rounds: {settings.revision.max_revision_round}</p>
      </Card>
      <Card className="col-span-4 max-[960px]:col-span-1">
        <h2 className="mb-2.5">Evaluator</h2>
        <p className="text-[var(--muted)]">Threshold: {settings.evaluator.default_score_threshold}</p>
        <p className="text-[var(--muted)]">Routes: {settings.evaluator.routes.join(", ")}</p>
      </Card>
      <Card className="col-span-12">
        <h2 className="mb-2.5">Templates</h2>
        <div className="flex flex-wrap gap-2.5">
          {settings.templates.map((template) => (
            <Badge key={template.template_id}>
              {template.label} · {template.default_theme_preset}
            </Badge>
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

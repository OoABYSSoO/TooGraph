"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { RunsListClient } from "@/components/runs/runs-list-client";

export default function RunsPage() {
  const { t } = useLanguage();
  return (
    <div className="page">
      <section>
        <div className="eyebrow">{t("runs.eyebrow")}</div>
        <h1 className="page-title">{t("runs.title")}</h1>
        <p className="page-subtitle">{t("runs.desc")}</p>
      </section>

      <section className="card">
        <div className="toolbar">
          <span className="pill">{t("runs.search")}</span>
          <span className="pill">{t("runs.filter")}</span>
        </div>
      </section>

      <section className="card">
        <RunsListClient />
      </section>
    </div>
  );
}

"use client";

import { useParams } from "next/navigation";

import { useLanguage } from "@/components/providers/language-provider";
import { RunDetailClient } from "@/components/runs/run-detail-client";

export default function RunDetailPage() {
  const params = useParams<{ runId: string }>();
  const { t } = useLanguage();
  const runId = params.runId;

  return (
    <div className="page">
      <section>
        <div className="eyebrow">{t("run_detail.eyebrow")}</div>
        <h1 className="page-title">
          {t("run_detail.title")} {runId}
        </h1>
        <p className="page-subtitle">{t("run_detail.desc")}</p>
      </section>

      <RunDetailClient runId={runId} />
    </div>
  );
}

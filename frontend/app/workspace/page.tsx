"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { WorkspaceDashboardClient } from "@/components/workspace/workspace-dashboard-client";

export default function WorkspacePage() {
  const { t } = useLanguage();
  return (
    <div className="page">
      <section>
        <div className="eyebrow">{t("workspace.eyebrow")}</div>
        <h1 className="page-title">{t("workspace.title")}</h1>
        <p className="page-subtitle">{t("workspace.desc")}</p>
      </section>

      <WorkspaceDashboardClient />
    </div>
  );
}

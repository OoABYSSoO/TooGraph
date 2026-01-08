"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { WorkspaceDashboardClient } from "@/components/workspace/workspace-dashboard-client";

export default function WorkspacePage() {
  const { t } = useLanguage();
  return (
    <div className="grid gap-6">
      <section>
        <div className="inline-flex rounded-full border border-[rgba(154,52,18,0.18)] bg-[rgba(255,255,255,0.72)] px-2.5 py-1.5 text-[0.82rem] uppercase tracking-[0.06em] text-[var(--accent-strong)]">{t("workspace.eyebrow")}</div>
        <h1 className="mb-2.5 mt-3.5 text-[clamp(2rem,4vw,3.4rem)] leading-[1.05]">{t("workspace.title")}</h1>
        <p className="max-w-[68ch] text-[1.02rem] leading-[1.7] text-[var(--muted)]">{t("workspace.desc")}</p>
      </section>

      <WorkspaceDashboardClient />
    </div>
  );
}

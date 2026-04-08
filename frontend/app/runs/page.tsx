"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { RunsListClient } from "@/components/runs/runs-list-client";

export default function RunsPage() {
  const { t } = useLanguage();
  return (
    <div className="grid gap-6">
      <section>
        <div className="inline-flex rounded-full border border-[rgba(154,52,18,0.18)] bg-[rgba(255,255,255,0.72)] px-2.5 py-1.5 text-[0.82rem] uppercase tracking-[0.06em] text-[var(--accent-strong)]">{t("runs.eyebrow")}</div>
        <h1 className="mb-2.5 mt-3.5 text-[clamp(2rem,4vw,3.4rem)] leading-[1.05]">{t("runs.title")}</h1>
        <p className="max-w-[68ch] text-[1.02rem] leading-[1.7] text-[var(--muted)]">{t("runs.desc")}</p>
      </section>

      <section className="rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">
        <div className="flex flex-wrap gap-2.5">
          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">{t("runs.search")}</span>
          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">{t("runs.filter")}</span>
        </div>
      </section>

      <section className="rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">
        <RunsListClient />
      </section>
    </div>
  );
}

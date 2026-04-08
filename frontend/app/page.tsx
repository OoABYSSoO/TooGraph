"use client";

import Link from "next/link";

import { useLanguage } from "@/components/providers/language-provider";

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-[var(--line)] bg-[linear-gradient(135deg,rgba(255,250,241,0.92),rgba(246,211,184,0.8))] p-7 shadow-[0_20px_60px_var(--shadow)]">
        <span className="inline-flex rounded-full border border-[rgba(154,52,18,0.18)] bg-[rgba(255,255,255,0.72)] px-2.5 py-1.5 text-[0.82rem] uppercase tracking-[0.06em] text-[var(--accent-strong)]">
          {t("home.eyebrow")}
        </span>
        <h1 className="mb-2.5 mt-3.5 text-[clamp(2rem,4vw,3.4rem)] leading-[1.05]">{t("home.title")}</h1>
        <p className="max-w-[68ch] text-[1.02rem] leading-[1.7] text-[var(--muted)]">{t("home.desc")}</p>
        <div className="mt-[22px] flex flex-wrap gap-3">
          <Link className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-[var(--accent)] px-[18px] py-3 text-white transition-transform duration-150 hover:-translate-y-px" href="/workspace">
            {t("home.enter")}
          </Link>
          <Link className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-transparent px-[18px] py-3 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" href="/editor/creative-factory">
            {t("home.open_editor")}
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-[18px] max-[960px]:grid-cols-1">
        <article className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
          <h2 className="mb-2.5">{t("home.workspace")}</h2>
          <p className="text-[var(--muted)]">{t("home.workspace_desc")}</p>
        </article>
        <article className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
          <h2 className="mb-2.5">{t("home.editor")}</h2>
          <p className="text-[var(--muted)]">{t("home.editor_desc")}</p>
        </article>
        <article className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
          <h2 className="mb-2.5">{t("home.runtime")}</h2>
          <p className="text-[var(--muted)]">{t("home.runtime_desc")}</p>
        </article>
      </section>
    </div>
  );
}

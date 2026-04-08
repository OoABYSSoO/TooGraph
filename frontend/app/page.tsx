"use client";

import Link from "next/link";

import { useLanguage } from "@/components/providers/language-provider";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-[var(--line)] bg-[linear-gradient(135deg,rgba(255,250,241,0.92),rgba(246,211,184,0.8))] p-7 shadow-[0_20px_60px_var(--shadow)]">
        <SectionHeader eyebrow={t("home.eyebrow")} title={t("home.title")} description={t("home.desc")} />
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
        <Card className="col-span-4 max-[960px]:col-span-1">
          <h2 className="mb-2.5">{t("home.workspace")}</h2>
          <p className="text-[var(--muted)]">{t("home.workspace_desc")}</p>
        </Card>
        <Card className="col-span-4 max-[960px]:col-span-1">
          <h2 className="mb-2.5">{t("home.editor")}</h2>
          <p className="text-[var(--muted)]">{t("home.editor_desc")}</p>
        </Card>
        <Card className="col-span-4 max-[960px]:col-span-1">
          <h2 className="mb-2.5">{t("home.runtime")}</h2>
          <p className="text-[var(--muted)]">{t("home.runtime_desc")}</p>
        </Card>
      </section>
    </div>
  );
}

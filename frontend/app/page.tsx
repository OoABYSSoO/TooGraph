"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/providers/language-provider";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 rounded-[28px] border border-[var(--line)] bg-[linear-gradient(135deg,rgba(255,250,241,0.92),rgba(246,211,184,0.8))] p-7 shadow-[0_20px_60px_var(--shadow)] lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div>
          <SectionHeader eyebrow={t("home.eyebrow")} title={t("home.title")} description={t("home.desc")} />
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Badge className="border-[rgba(13,148,136,0.24)] bg-[rgba(240,253,250,0.9)] text-[var(--text)]">state-first</Badge>
            <Badge className="border-[rgba(13,148,136,0.24)] bg-[rgba(240,253,250,0.9)] text-[var(--text)]">LangGraph</Badge>
            <Badge className="border-[rgba(13,148,136,0.24)] bg-[rgba(240,253,250,0.9)] text-[var(--text)]">JSON storage</Badge>
          </div>
          <div className="mt-[22px] flex flex-wrap gap-3">
            <Link className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-[var(--accent)] px-[18px] py-3 text-white transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-[0_12px_24px_rgba(154,52,18,0.18)]" href="/workspace">
              {t("home.enter")}
            </Link>
            <Link className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-transparent px-[18px] py-3 text-[var(--accent-strong)] transition-all duration-200 ease-out hover:-translate-y-px hover:bg-[rgba(255,255,255,0.72)]" href="/editor">
              {t("home.open_editor")}
            </Link>
          </div>
        </div>

        <div className="grid gap-3">
          <Card className="p-4">
            <div className="mb-2 text-[0.8rem] uppercase tracking-[0.08em] text-[var(--accent-strong)]">{t("home.snapshot_title")}</div>
            <p className="text-sm leading-6 text-[var(--muted)]">{t("home.snapshot_desc")}</p>
          </Card>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Card className="p-4">
              <div className="text-sm font-semibold">{t("home.snapshot_protocol")}</div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("home.snapshot_protocol_desc")}</p>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-semibold">{t("home.snapshot_runtime")}</div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("home.snapshot_runtime_desc")}</p>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-semibold">{t("home.snapshot_storage")}</div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("home.snapshot_storage_desc")}</p>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <div>
          <h2 className="text-[1.2rem] font-semibold">{t("home.flow_title")}</h2>
          <p className="mt-2 max-w-[68ch] text-[var(--muted)]">{t("home.flow_desc")}</p>
        </div>
        <div className="grid grid-cols-12 gap-[18px] max-[960px]:grid-cols-1">
          <Card className="col-span-4 max-[960px]:col-span-1">
            <div className="mb-3 inline-flex rounded-full border border-[rgba(13,148,136,0.18)] bg-[rgba(255,255,255,0.72)] px-2.5 py-1.5 text-[0.76rem] uppercase tracking-[0.08em] text-[var(--accent-strong)]">01</div>
            <h2 className="mb-2.5">{t("home.workspace")}</h2>
            <p className="text-[var(--muted)]">{t("home.flow_step1")}</p>
          </Card>
          <Card className="col-span-4 max-[960px]:col-span-1">
            <div className="mb-3 inline-flex rounded-full border border-[rgba(13,148,136,0.18)] bg-[rgba(255,255,255,0.72)] px-2.5 py-1.5 text-[0.76rem] uppercase tracking-[0.08em] text-[var(--accent-strong)]">02</div>
            <h2 className="mb-2.5">{t("home.editor")}</h2>
            <p className="text-[var(--muted)]">{t("home.flow_step2")}</p>
          </Card>
          <Card className="col-span-4 max-[960px]:col-span-1">
            <div className="mb-3 inline-flex rounded-full border border-[rgba(13,148,136,0.18)] bg-[rgba(255,255,255,0.72)] px-2.5 py-1.5 text-[0.76rem] uppercase tracking-[0.08em] text-[var(--accent-strong)]">03</div>
            <h2 className="mb-2.5">{t("home.runtime")}</h2>
            <p className="text-[var(--muted)]">{t("home.flow_step3")}</p>
          </Card>
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

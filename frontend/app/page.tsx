"use client";

import Link from "next/link";

import { useLanguage } from "@/components/providers/language-provider";

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">{t("home.eyebrow")}</span>
        <h1>{t("home.title")}</h1>
        <p>{t("home.desc")}</p>
        <div className="actions">
          <Link className="button" href="/workspace">
            {t("home.enter")}
          </Link>
          <Link className="button secondary" href="/editor/creative-factory">
            {t("home.open_editor")}
          </Link>
        </div>
      </section>

      <section className="grid">
        <article className="card span-4">
          <h2>{t("home.workspace")}</h2>
          <p className="muted">{t("home.workspace_desc")}</p>
        </article>
        <article className="card span-4">
          <h2>{t("home.editor")}</h2>
          <p className="muted">{t("home.editor_desc")}</p>
        </article>
        <article className="card span-4">
          <h2>{t("home.runtime")}</h2>
          <p className="muted">{t("home.runtime_desc")}</p>
        </article>
      </section>
    </div>
  );
}

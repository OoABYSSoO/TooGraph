"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { KnowledgeListClient } from "@/components/knowledge/knowledge-list-client";

export default function KnowledgePage() {
  const { t } = useLanguage();
  return (
    <div className="page">
      <section>
        <div className="eyebrow">{t("knowledge.eyebrow")}</div>
        <h1 className="page-title">{t("knowledge.title")}</h1>
        <p className="page-subtitle">{t("knowledge.desc")}</p>
      </section>

      <section className="card">
        <div className="toolbar">
          <span className="pill">{t("common.search_docs")}</span>
          <span className="pill">{t("common.open_detail")}</span>
        </div>
      </section>

      <section className="card">
        <KnowledgeListClient />
      </section>
    </div>
  );
}

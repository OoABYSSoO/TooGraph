"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { MemoryListClient } from "@/components/memories/memory-list-client";

export default function MemoriesPage() {
  const { t } = useLanguage();
  return (
    <div className="page">
      <section>
        <div className="eyebrow">{t("memories.eyebrow")}</div>
        <h1 className="page-title">{t("memories.title")}</h1>
        <p className="page-subtitle">{t("memories.desc")}</p>
      </section>

      <section className="card">
        <div className="toolbar">
          <span className="pill">{t("common.filter_memory")}</span>
          <span className="pill">{t("common.open_detail")}</span>
        </div>
      </section>

      <section className="card">
        <MemoryListClient />
      </section>
    </div>
  );
}

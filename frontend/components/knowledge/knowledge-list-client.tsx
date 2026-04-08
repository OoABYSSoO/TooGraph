"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import { useLanguage } from "@/components/providers/language-provider";

type KnowledgeItem = {
  title: string;
  source: string;
  summary: string;
  content: string;
};

export function KnowledgeListClient() {
  const { t } = useLanguage();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadItems() {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("query", query.trim());
        const payload = await apiGet<KnowledgeItem[]>(`/api/knowledge${params.toString() ? `?${params.toString()}` : ""}`);
        if (!cancelled) {
          setItems(payload);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load knowledge.");
        }
      }
    }
    loadItems();
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (error) {
    return <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">{t("common.failed")}: {error}</div>;
  }

  if (items.length === 0) {
    return <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">{t("common.no_data")}</div>;
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">
        <div className="grid gap-2 text-[0.94rem]">
          <span>{t("common.search_docs")}</span>
          <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>
      {items.map((item) => (
        <button
          className="grid gap-2 rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5 text-left"
          key={`${item.source}-${item.title}`}
          onClick={() =>
            setExpandedKey((current) => (current === `${item.source}-${item.title}` ? null : `${item.source}-${item.title}`))
          }
          type="button"
        >
          <strong>{item.title}</strong>
          <div className="text-[var(--muted)]">{item.source}</div>
          <p className="text-[var(--muted)]">{item.summary}</p>
          {expandedKey === `${item.source}-${item.title}` ? <pre className="overflow-x-auto whitespace-pre-wrap text-sm text-[var(--muted)]">{item.content}</pre> : null}
        </button>
      ))}
    </div>
  );
}

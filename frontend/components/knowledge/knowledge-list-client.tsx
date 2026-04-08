"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { SubtleCard } from "@/components/ui/card";
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
    return <SubtleCard>{t("common.failed")}: {error}</SubtleCard>;
  }

  if (items.length === 0) {
    return <SubtleCard>{t("common.no_data")}</SubtleCard>;
  }

  return (
    <div className="grid gap-3">
      <SubtleCard>
        <div className="grid gap-2 text-[0.94rem]">
          <span>{t("common.search_docs")}</span>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </SubtleCard>
      {items.map((item) => (
        <button
          className="text-left"
          key={`${item.source}-${item.title}`}
          onClick={() =>
            setExpandedKey((current) => (current === `${item.source}-${item.title}` ? null : `${item.source}-${item.title}`))
          }
          type="button"
        >
          <SubtleCard className="grid gap-2">
          <strong>{item.title}</strong>
          <div className="text-[var(--muted)]">{item.source}</div>
          <p className="text-[var(--muted)]">{item.summary}</p>
          {expandedKey === `${item.source}-${item.title}` ? <pre className="overflow-x-auto whitespace-pre-wrap text-sm text-[var(--muted)]">{item.content}</pre> : null}
          </SubtleCard>
        </button>
      ))}
    </div>
  );
}

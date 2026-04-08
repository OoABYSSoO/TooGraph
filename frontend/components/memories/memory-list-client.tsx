"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import { useLanguage } from "@/components/providers/language-provider";

type MemoryItem = {
  memory_id: string;
  memory_type: string;
  summary?: string;
  details?: string;
};

export function MemoryListClient() {
  const { t } = useLanguage();
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [memoryType, setMemoryType] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadItems() {
      try {
        const params = new URLSearchParams();
        if (memoryType) params.set("memory_type", memoryType);
        const payload = await apiGet<MemoryItem[]>(`/api/memories${params.toString() ? `?${params.toString()}` : ""}`);
        if (!cancelled) {
          setItems(payload);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load memories.");
        }
      }
    }
    loadItems();
    return () => {
      cancelled = true;
    };
  }, [memoryType]);

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
          <span>{t("common.filter_memory")}</span>
          <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={memoryType} onChange={(event) => setMemoryType(event.target.value)} />
        </div>
      </div>
      {items.map((item) => (
        <button
          className="grid gap-2 rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5 text-left"
          key={item.memory_id}
          onClick={() => setExpandedId((current) => (current === item.memory_id ? null : item.memory_id))}
          type="button"
        >
          <strong>{item.memory_type}</strong>
          <div className="text-[var(--muted)]">{item.summary || "No summary provided."}</div>
          {expandedId === item.memory_id && item.details ? <pre className="overflow-x-auto whitespace-pre-wrap text-sm text-[var(--muted)]">{item.details}</pre> : null}
        </button>
      ))}
    </div>
  );
}

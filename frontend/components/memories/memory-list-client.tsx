"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { SubtleCard } from "@/components/ui/card";
import { RichContent } from "@/components/ui/rich-content";
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
    return <SubtleCard>{t("common.failed")}: {error}</SubtleCard>;
  }

  if (items.length === 0) {
    return <SubtleCard>{t("common.no_data")}</SubtleCard>;
  }

  return (
    <div className="grid gap-3">
      <SubtleCard>
        <div className="grid gap-2 text-[0.94rem]">
          <span>{t("common.filter_memory")}</span>
          <Input value={memoryType} onChange={(event) => setMemoryType(event.target.value)} />
        </div>
      </SubtleCard>
      {items.map((item) => (
        <button
          className="text-left"
          key={item.memory_id}
          onClick={() => setExpandedId((current) => (current === item.memory_id ? null : item.memory_id))}
          type="button"
        >
          <SubtleCard className="grid gap-2">
          <strong>{item.memory_type}</strong>
          <div className="text-[var(--muted)]">{item.summary || "No summary provided."}</div>
          {expandedId === item.memory_id && item.details ? <RichContent className="mt-2 text-sm" text={item.details} displayMode="auto" /> : null}
          </SubtleCard>
        </button>
      ))}
    </div>
  );
}

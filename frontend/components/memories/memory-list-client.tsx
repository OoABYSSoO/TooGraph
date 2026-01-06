"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import { useLanguage } from "@/components/providers/language-provider";

type MemoryItem = {
  memory_id: string;
  memory_type: string;
  summary?: string;
};

export function MemoryListClient() {
  const { t } = useLanguage();
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadItems() {
      try {
        const payload = await apiGet<MemoryItem[]>("/api/memories");
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
  }, []);

  if (error) {
    return <div className="list-item">{t("common.failed")}: {error}</div>;
  }

  if (items.length === 0) {
    return <div className="list-item">{t("common.no_data")}</div>;
  }

  return (
    <div className="list">
      {items.map((item) => (
        <div className="list-item" key={item.memory_id}>
          <strong>{item.memory_type}</strong>
          <div className="muted">{item.summary || "No summary provided."}</div>
        </div>
      ))}
    </div>
  );
}

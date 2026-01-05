"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";

type KnowledgeItem = {
  title: string;
  source: string;
  summary: string;
  content: string;
};

export function KnowledgeListClient() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadItems() {
      try {
        const payload = await apiGet<KnowledgeItem[]>("/api/knowledge");
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
  }, []);

  if (error) {
    return <div className="list-item">Failed to load knowledge: {error}</div>;
  }

  if (items.length === 0) {
    return <div className="list-item">No knowledge items available yet.</div>;
  }

  return (
    <div className="list">
      {items.map((item) => (
        <div className="list-item" key={`${item.source}-${item.title}`}>
          <strong>{item.title}</strong>
          <div className="muted">{item.source}</div>
          <p className="muted">{item.summary}</p>
        </div>
      ))}
    </div>
  );
}


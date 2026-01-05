import { MemoryListClient } from "@/components/memories/memory-list-client";

export default function MemoriesPage() {
  return (
    <div className="page">
      <section>
        <div className="eyebrow">Memories</div>
        <h1 className="page-title">Historical patterns the runtime can look back on.</h1>
        <p className="page-subtitle">
          The real page will fetch memories by type and show individual memory detail.
        </p>
      </section>

      <section className="card">
        <div className="toolbar">
          <span className="pill">Filter by memory_type</span>
          <span className="pill">Open detail</span>
        </div>
      </section>

      <section className="card">
        <MemoryListClient />
      </section>
    </div>
  );
}

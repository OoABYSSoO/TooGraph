const memories = [
  { type: "success_pattern", summary: "Keep planner output concise and observable." },
  { type: "failure_reason", summary: "Revision required when evaluation score falls too low." },
];

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
        <div className="list">
          {memories.map((memory, index) => (
            <div className="list-item" key={`${memory.type}-${index}`}>
              <strong>{memory.type}</strong>
              <div className="muted">{memory.summary}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

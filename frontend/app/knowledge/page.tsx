import { KnowledgeListClient } from "@/components/knowledge/knowledge-list-client";

export default function KnowledgePage() {
  return (
    <div className="page">
      <section>
        <div className="eyebrow">Knowledge</div>
        <h1 className="page-title">Knowledge sources available to the runtime.</h1>
        <p className="page-subtitle">
          This page will surface searchable documents and details from the backend knowledge
          store.
        </p>
      </section>

      <section className="card">
        <div className="toolbar">
          <span className="pill">Search documents</span>
          <span className="pill">Open detail</span>
        </div>
      </section>

      <section className="card">
        <KnowledgeListClient />
      </section>
    </div>
  );
}

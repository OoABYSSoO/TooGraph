import { RunsListClient } from "@/components/runs/runs-list-client";

export default function RunsPage() {
  return (
    <div className="page">
      <section>
        <div className="eyebrow">Runs</div>
        <h1 className="page-title">Historical runs and runtime outcomes.</h1>
        <p className="page-subtitle">
          This page now reads run history from the backend runtime API.
        </p>
      </section>

      <section className="card">
        <div className="toolbar">
          <span className="pill">Search graph name</span>
          <span className="pill">Filter by status</span>
        </div>
      </section>

      <section className="card">
        <RunsListClient />
      </section>
    </div>
  );
}

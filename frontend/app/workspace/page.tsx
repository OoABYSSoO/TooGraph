const recentGraphs = [
  { name: "Marketing Workflow", status: "Ready", updatedAt: "Today" },
  { name: "Creative Review Loop", status: "Draft", updatedAt: "Today" },
  { name: "Asset Analyzer", status: "Ready", updatedAt: "Yesterday" },
];

const recentRuns = [
  { id: "run_a12", status: "completed", graph: "Marketing Workflow" },
  { id: "run_a13", status: "running", graph: "Creative Review Loop" },
  { id: "run_a14", status: "failed", graph: "Asset Analyzer" },
];

export default function WorkspacePage() {
  return (
    <div className="page">
      <section>
        <div className="eyebrow">Workspace</div>
        <h1 className="page-title">Recent graphs, active runs, and next actions.</h1>
        <p className="page-subtitle">
          This page is the operational home for GraphiteUI. It points people into the editor
          without mixing the canvas into the dashboard itself.
        </p>
      </section>

      <section className="grid">
        <article className="card span-4">
          <div className="muted">Recent Graphs</div>
          <div className="kpi">{recentGraphs.length}</div>
          <p className="muted">Editable workflow definitions available right now.</p>
        </article>
        <article className="card span-4">
          <div className="muted">Running Jobs</div>
          <div className="kpi">1</div>
          <p className="muted">One workflow is currently moving through runtime.</p>
        </article>
        <article className="card span-4">
          <div className="muted">Failed Runs</div>
          <div className="kpi">1</div>
          <p className="muted">Failed runs are surfaced here for quick recovery.</p>
        </article>

        <article className="card span-6">
          <h2>Recent Graphs</h2>
          <div className="list">
            {recentGraphs.map((graph) => (
              <div className="list-item" key={graph.name}>
                <strong>{graph.name}</strong>
                <div className="status-row">
                  <span className="pill">{graph.status}</span>
                  <span className="pill">Updated {graph.updatedAt}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card span-6">
          <h2>Recent Runs</h2>
          <div className="list">
            {recentRuns.map((run) => (
              <div className="list-item" key={run.id}>
                <strong>{run.id}</strong>
                <div className="muted">{run.graph}</div>
                <div className="status-row">
                  <span className="pill">{run.status}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card span-12">
          <h2>Quick Actions</h2>
          <div className="actions">
            <a className="button" href="/editor/demo-graph">
              Create Graph
            </a>
            <a className="button secondary" href="/runs">
              View Run History
            </a>
          </div>
        </article>
      </section>
    </div>
  );
}

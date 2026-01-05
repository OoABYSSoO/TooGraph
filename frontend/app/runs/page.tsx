const runs = [
  {
    runId: "run_a12",
    graphName: "Marketing Workflow",
    status: "completed",
    revisionCount: 0,
    duration: "1.2s",
    finalScore: 8.5,
  },
  {
    runId: "run_a13",
    graphName: "Creative Review Loop",
    status: "running",
    revisionCount: 1,
    duration: "0.8s",
    finalScore: null,
  },
];

export default function RunsPage() {
  return (
    <div className="page">
      <section>
        <div className="eyebrow">Runs</div>
        <h1 className="page-title">Historical runs and runtime outcomes.</h1>
        <p className="page-subtitle">
          Search and filtering controls will be connected to backend run data in the next pass.
        </p>
      </section>

      <section className="card">
        <div className="toolbar">
          <span className="pill">Search graph name</span>
          <span className="pill">Filter by status</span>
        </div>
      </section>

      <section className="card">
        <div className="list">
          {runs.map((run) => (
            <div className="list-item" key={run.runId}>
              <strong>{run.runId}</strong>
              <div className="muted">{run.graphName}</div>
              <div className="status-row">
                <span className="pill">{run.status}</span>
                <span className="pill">revisions {run.revisionCount}</span>
                <span className="pill">duration {run.duration}</span>
                {run.finalScore ? <span className="pill">score {run.finalScore}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

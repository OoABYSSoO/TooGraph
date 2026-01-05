export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  return (
    <div className="page">
      <section>
        <div className="eyebrow">Run Detail</div>
        <h1 className="page-title">Run detail for {runId}</h1>
        <p className="page-subtitle">
          This page will show current node, timeline, node execution summaries, warnings, and
          artifacts from the backend runtime.
        </p>
      </section>

      <section className="grid">
        <article className="card span-4">
          <h2>Status</h2>
          <div className="status-row">
            <span className="pill">completed</span>
            <span className="pill">current node finalizer_1</span>
          </div>
        </article>
        <article className="card span-8">
          <h2>Artifacts Summary</h2>
          <p className="muted">Knowledge summary, memory summary, evaluation, and final result.</p>
        </article>
        <article className="card span-12">
          <h2>Node Timeline</h2>
          <div className="list">
            <div className="list-item">input_1 {"->"} success</div>
            <div className="list-item">planner_1 {"->"} success</div>
            <div className="list-item">evaluator_1 {"->"} success</div>
            <div className="list-item">finalizer_1 {"->"} success</div>
          </div>
        </article>
      </section>
    </div>
  );
}

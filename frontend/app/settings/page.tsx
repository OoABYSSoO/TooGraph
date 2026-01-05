export default function SettingsPage() {
  return (
    <div className="page">
      <section>
        <div className="eyebrow">Settings</div>
        <h1 className="page-title">Readonly runtime and model settings.</h1>
        <p className="page-subtitle">
          Current delivery only requires visibility into model, revision, and evaluator
          configuration.
        </p>
      </section>

      <section className="grid">
        <article className="card span-4">
          <h2>Model</h2>
          <p className="muted">Default text and workflow execution model settings.</p>
        </article>
        <article className="card span-4">
          <h2>Revision</h2>
          <p className="muted">Maximum revision rounds and runtime retry policy.</p>
        </article>
        <article className="card span-4">
          <h2>Evaluator</h2>
          <p className="muted">Thresholds, routing decisions, and scoring behavior.</p>
        </article>
      </section>
    </div>
  );
}

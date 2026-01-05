import Link from "next/link";

export default function HomePage() {
  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">Graph Editing + Runtime Visibility</span>
        <h1>Build workflows that people can actually inspect.</h1>
        <p>
          GraphiteUI turns LangGraph agent logic into a visual workspace with an editor,
          runtime observation, run history, and asset views for knowledge and memory.
        </p>
        <div className="actions">
          <Link className="button" href="/workspace">
            Enter Workspace
          </Link>
          <Link className="button secondary" href="/editor/demo-graph">
            Open Editor
          </Link>
        </div>
      </section>

      <section className="grid">
        <article className="card span-4">
          <h2>Workspace</h2>
          <p className="muted">
            Review recent graphs, recent runs, quick actions, and overall system status.
          </p>
        </article>
        <article className="card span-4">
          <h2>Editor</h2>
          <p className="muted">
            Compose node-based workflows with palette, canvas, config panel, and toolbar.
          </p>
        </article>
        <article className="card span-4">
          <h2>Runtime</h2>
          <p className="muted">
            Track current node, node execution summaries, revisions, and final outputs.
          </p>
        </article>
      </section>
    </div>
  );
}

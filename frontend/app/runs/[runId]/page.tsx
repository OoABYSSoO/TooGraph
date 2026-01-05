import { RunDetailClient } from "@/components/runs/run-detail-client";

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
          This page reads live run detail, node summaries, and artifact context from the backend.
        </p>
      </section>

      <RunDetailClient runId={runId} />
    </div>
  );
}

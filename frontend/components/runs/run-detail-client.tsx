"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";

type RunDetail = {
  run_id: string;
  graph_name: string;
  status: string;
  current_node_id?: string | null;
  revision_round: number;
  final_result?: string | null;
  final_score?: number | null;
  knowledge_summary?: string;
  memory_summary?: string;
  artifacts: Record<string, unknown>;
  node_executions: Array<{
    node_id: string;
    status: string;
    output_summary: string;
    duration_ms: number;
  }>;
};

export function RunDetailClient({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRun() {
      try {
        const payload = await apiGet<RunDetail>(`/api/runs/${runId}`);
        if (!cancelled) {
          setRun(payload);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load run detail.");
        }
      }
    }
    loadRun();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (error) {
    return <div className="card">Failed to load run detail: {error}</div>;
  }

  if (!run) {
    return <div className="card">Loading run detail...</div>;
  }

  return (
    <section className="grid">
      <article className="card span-4">
        <h2>Status</h2>
        <div className="status-row">
          <span className="pill">{run.status}</span>
          <span className="pill">current node {run.current_node_id ?? "completed"}</span>
          <span className="pill">revisions {run.revision_round}</span>
          {run.final_score ? <span className="pill">score {run.final_score}</span> : null}
        </div>
      </article>

      <article className="card span-8">
        <h2>Artifacts Summary</h2>
        <div className="list">
          <div className="list-item">
            <strong>Knowledge</strong>
            <div className="muted">{run.knowledge_summary || "No knowledge summary available."}</div>
          </div>
          <div className="list-item">
            <strong>Memory</strong>
            <div className="muted">{run.memory_summary || "No memory summary available."}</div>
          </div>
          <div className="list-item">
            <strong>Final Result</strong>
            <div className="muted">{run.final_result || "No final result yet."}</div>
          </div>
        </div>
      </article>

      <article className="card span-12">
        <h2>Node Timeline</h2>
        <div className="list">
          {run.node_executions.map((execution) => (
            <div className="list-item" key={execution.node_id}>
              <strong>
                {execution.node_id} {"->"} {execution.status}
              </strong>
              <div className="muted">{execution.output_summary}</div>
              <div className="status-row">
                <span className="pill">{execution.duration_ms}ms</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}


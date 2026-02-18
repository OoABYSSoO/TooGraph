import { cloneGraphDocument, clonePlainValue } from "./graph-document.ts";

import type { GraphPayload } from "@/types/node-system";
import type { RunDetail, RunSnapshot, RunSummary } from "@/types/run";

const RESTORABLE_RUN_STATUSES = new Set(["completed", "failed", "paused", "awaiting_human"]);

export function canRestoreRunStatus(status: string | null | undefined) {
  return RESTORABLE_RUN_STATUSES.has(String(status ?? "").trim());
}

export function canRestoreRunSummary(run: Pick<RunSummary, "status" | "restorable_snapshot_available">) {
  return canRestoreRunStatus(run.status) && Boolean(run.restorable_snapshot_available);
}

export function hasRunGraphSnapshot(run: Pick<RunDetail, "graph_snapshot">) {
  return isRestorableGraphSnapshotValue(run.graph_snapshot);
}

function isRestorableGraphSnapshotValue(snapshot: unknown): snapshot is GraphPayload {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return false;
  }

  const graph = snapshot as Partial<GraphPayload>;
  return (
    typeof graph.name === "string" &&
    graph.state_schema != null &&
    typeof graph.state_schema === "object" &&
    !Array.isArray(graph.state_schema) &&
    graph.nodes != null &&
    typeof graph.nodes === "object" &&
    !Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges) &&
    Array.isArray(graph.conditional_edges) &&
    graph.metadata != null &&
    typeof graph.metadata === "object" &&
    !Array.isArray(graph.metadata)
  );
}

export function canRestoreRunDetail(run: RunDetail) {
  return canRestoreRunStatus(run.status) && hasRunGraphSnapshot(run);
}

export function resolveRunRestoreUrl(runId: string, snapshotId?: string | null) {
  const searchParams = new URLSearchParams();
  searchParams.set("restoreRun", runId);
  if (snapshotId?.trim()) {
    searchParams.set("snapshot", snapshotId.trim());
  }
  return `/editor/new?${searchParams.toString()}`;
}

export function resolveRestoredRunTabTitle(run: Pick<RunDetail, "graph_name" | "run_id">) {
  const graphName = run.graph_name?.trim() || "Recovered Graph";
  return `${graphName} · run ${shortRunId(run.run_id)}`;
}

export function resolveRunSnapshot(run: RunDetail, snapshotId?: string | null): RunSnapshot | null {
  const snapshots = Array.isArray(run.run_snapshots) ? run.run_snapshots : [];
  if (snapshotId?.trim()) {
    return snapshots.find((snapshot) => snapshot.snapshot_id === snapshotId.trim()) ?? null;
  }
  if (run.status === "awaiting_human") {
    return [...snapshots].reverse().find((snapshot) => snapshot.kind === "pause") ?? null;
  }
  return (
    [...snapshots].reverse().find((snapshot) => snapshot.kind === "completed" || snapshot.kind === "failed") ??
    snapshots.at(-1) ??
    null
  );
}

export function buildSnapshotScopedRun(run: RunDetail, snapshotId?: string | null): RunDetail {
  const snapshot = resolveRunSnapshot(run, snapshotId);
  if (!snapshot) {
    return run;
  }

  return {
    ...run,
    status: snapshot.status,
    current_node_id: snapshot.current_node_id ?? null,
    checkpoint_metadata: clonePlainValue(snapshot.checkpoint_metadata ?? run.checkpoint_metadata),
    state_snapshot: clonePlainValue(snapshot.state_snapshot),
    graph_snapshot: clonePlainValue(snapshot.graph_snapshot),
    artifacts: clonePlainValue(snapshot.artifacts),
    node_status_map: clonePlainValue(snapshot.node_status_map),
    output_previews: clonePlainValue(snapshot.output_previews),
    final_result: snapshot.final_result ?? run.final_result,
  };
}

export function buildRestoredGraphFromRun(run: RunDetail, snapshotId?: string | null): GraphPayload {
  const selectedRun = buildSnapshotScopedRun(run, snapshotId);
  if (!hasRunGraphSnapshot(selectedRun)) {
    throw new Error(`Run ${run.run_id} does not contain a restorable graph snapshot.`);
  }

  const restored = cloneGraphDocument(selectedRun.graph_snapshot as GraphPayload);
  restored.graph_id = null;
  restored.name = run.graph_name?.trim() || restored.name?.trim() || "Recovered Graph";

  for (const [stateKey, value] of Object.entries(selectedRun.state_snapshot.values ?? {})) {
    const stateDefinition = restored.state_schema[stateKey];
    if (!stateDefinition) {
      continue;
    }
    stateDefinition.value = clonePlainValue(value);
  }

  return restored;
}

function shortRunId(runId: string) {
  const normalized = String(runId ?? "").replace(/^run_/, "");
  return normalized.slice(0, 8) || "snapshot";
}

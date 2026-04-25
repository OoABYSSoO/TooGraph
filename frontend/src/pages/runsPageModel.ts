import type { RunSummary } from "../types/run.ts";
import { translate } from "../i18n/index.ts";

export type RunsPageEmptyAction = {
  href: string;
  label: string;
};

export type RunsStatusFilterOption = {
  label: string;
  value: string;
};

export type RunsStatusOverviewItem = {
  key: string;
  label: string;
  value: number;
};

export type RunsRestoreTarget = {
  key: string;
  label: string;
  detail: string;
  snapshotId: string | null;
};

export function buildRunStatusFilterOptions(): RunsStatusFilterOption[] {
  return [
    { label: translate("status.all"), value: "" },
    { label: translate("status.queued"), value: "queued" },
    { label: translate("status.running"), value: "running" },
    { label: translate("status.resuming"), value: "resuming" },
    { label: translate("status.awaitingHuman"), value: "awaiting_human" },
    { label: translate("status.completed"), value: "completed" },
    { label: translate("status.failed"), value: "failed" },
  ];
}

export const RUN_STATUS_FILTER_OPTIONS: RunsStatusFilterOption[] = buildRunStatusFilterOptions();

export function resolveRunsEmptyAction(): RunsPageEmptyAction {
  return {
    href: "/editor",
    label: translate("workspace.openEditor"),
  };
}

export function resolveRunsCardDetail() {
  return translate("workspace.viewDetail");
}

export function buildRunStatusOverview(runs: RunSummary[]): RunsStatusOverviewItem[] {
  const activeStatuses = new Set(["queued", "pending", "running", "resuming"]);
  const attentionStatuses = new Set(["awaiting_human", "paused", "failed"]);
  return [
    { key: "total", label: translate("runs.allRuns"), value: runs.length },
    { key: "attention", label: translate("runs.needsAttention"), value: runs.filter((run) => attentionStatuses.has(run.status)).length },
    { key: "active", label: translate("runs.activeRuns"), value: runs.filter((run) => activeStatuses.has(run.status)).length },
    { key: "completed", label: translate("runs.completedRuns"), value: runs.filter((run) => run.status === "completed").length },
  ];
}

export function buildRunRestoreTargets(run: RunSummary): RunsRestoreTarget[] {
  if (!run.restorable_snapshot_available) {
    return [];
  }

  const snapshots = run.run_snapshot_options ?? [];
  const pauseSnapshots = [...snapshots].filter((snapshot) => snapshot.kind === "pause" && snapshot.snapshot_id).reverse();
  const latestTerminal =
    [...snapshots].reverse().find((snapshot) => snapshot.kind === "completed" || snapshot.kind === "failed") ?? null;
  const targets: RunsRestoreTarget[] = [];

  for (const pauseSnapshot of pauseSnapshots) {
    const nodeLabel = pauseSnapshot.current_node_id?.trim() || "";
    targets.push({
      key: pauseSnapshot.snapshot_id ?? "",
      label: nodeLabel ? translate("runs.breakpointWithNode", { node: nodeLabel }) : translate("runs.breakpoint"),
      detail: nodeLabel || pauseSnapshot.status || "paused",
      snapshotId: pauseSnapshot.snapshot_id,
    });
  }

  if (latestTerminal?.snapshot_id) {
    targets.push({
      key: latestTerminal.snapshot_id,
      label: translate("runs.finalResult"),
      detail: latestTerminal.status || run.status,
      snapshotId: latestTerminal.snapshot_id,
    });
  } else if (run.status === "completed" || run.status === "failed") {
    targets.push({
      key: "current",
      label: translate("runs.finalResult"),
      detail: run.status,
      snapshotId: null,
    });
  }

  return targets;
}

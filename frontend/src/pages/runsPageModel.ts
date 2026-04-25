import type { RunSummary } from "../types/run.ts";

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

export const RUN_STATUS_FILTER_OPTIONS: RunsStatusFilterOption[] = [
  { label: "全部", value: "" },
  { label: "排队", value: "queued" },
  { label: "运行中", value: "running" },
  { label: "恢复中", value: "resuming" },
  { label: "断点暂停", value: "awaiting_human" },
  { label: "已完成", value: "completed" },
  { label: "失败", value: "failed" },
];

export function resolveRunsEmptyAction(): RunsPageEmptyAction {
  return {
    href: "/editor",
    label: "打开编排器",
  };
}

export function resolveRunsCardDetail() {
  return "查看详情";
}

export function buildRunStatusOverview(runs: RunSummary[]): RunsStatusOverviewItem[] {
  const activeStatuses = new Set(["queued", "pending", "running", "resuming"]);
  const attentionStatuses = new Set(["awaiting_human", "paused", "failed"]);
  return [
    { key: "total", label: "全部运行", value: runs.length },
    { key: "attention", label: "需要关注", value: runs.filter((run) => attentionStatuses.has(run.status)).length },
    { key: "active", label: "进行中", value: runs.filter((run) => activeStatuses.has(run.status)).length },
    { key: "completed", label: "已完成", value: runs.filter((run) => run.status === "completed").length },
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
      label: nodeLabel ? `断点 · ${nodeLabel}` : "断点",
      detail: nodeLabel || pauseSnapshot.status || "paused",
      snapshotId: pauseSnapshot.snapshot_id,
    });
  }

  if (latestTerminal?.snapshot_id) {
    targets.push({
      key: latestTerminal.snapshot_id,
      label: "最终结果",
      detail: latestTerminal.status || run.status,
      snapshotId: latestTerminal.snapshot_id,
    });
  } else if (run.status === "completed" || run.status === "failed") {
    targets.push({
      key: "current",
      label: "最终结果",
      detail: run.status,
      snapshotId: null,
    });
  }

  return targets;
}

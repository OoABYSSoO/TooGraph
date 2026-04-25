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

export const RUN_STATUS_FILTER_OPTIONS: RunsStatusFilterOption[] = [
  { label: "全部", value: "" },
  { label: "排队", value: "queued" },
  { label: "运行中", value: "running" },
  { label: "恢复中", value: "resuming" },
  { label: "人工暂停", value: "awaiting_human" },
  { label: "已暂停", value: "paused" },
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

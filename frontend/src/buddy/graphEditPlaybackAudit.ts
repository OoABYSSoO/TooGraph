export type GraphEditPlaybackAuditApplyResult = {
  commandId: string;
  ok: boolean;
  applied: boolean;
  issues: string[];
  diff?: GraphEditPlaybackAuditDiffEntry[];
};

export type GraphEditPlaybackAuditDiffEntry = {
  op: "add" | "remove" | "replace";
  path: string;
  previous?: unknown;
  next?: unknown;
};

export type GraphEditPlaybackAuditRevision = {
  status: "not_requested" | "saved" | "failed";
  graphId?: string | null;
  revisionId?: string | null;
  issues?: string[];
};

export type GraphEditPlaybackAuditSummary = {
  request_id: string;
  status: "succeeded" | "failed" | "interrupted";
  command_count: number;
  applied_command_count: number;
  failed_command_count: number;
  playback_step_count: number;
  issues: string[];
  failed_commands: Array<{
    command_id: string;
    issues: string[];
  }>;
  diff_count: number;
  command_diffs: Array<{
    command_id: string;
    diff: GraphEditPlaybackAuditDiffEntry[];
  }>;
  graph_id?: string | null;
  revision_id?: string | null;
  revision_status?: GraphEditPlaybackAuditRevision["status"];
  revision_issues?: string[];
};

export function buildGraphEditPlaybackAuditSummary(input: {
  requestId: string;
  planOk: boolean;
  planIssues: string[];
  commandCount: number;
  playbackStepCount: number;
  interrupted: boolean;
  applyResults: GraphEditPlaybackAuditApplyResult[];
  revision?: GraphEditPlaybackAuditRevision | null;
}): GraphEditPlaybackAuditSummary {
  const failedCommands = input.applyResults
    .filter((result) => !result.ok || !result.applied || result.issues.length > 0)
    .map((result) => ({
      command_id: result.commandId,
      issues: result.issues.length > 0 ? [...result.issues] : [result.ok ? "Command was not applied." : "Command failed."],
    }));
  const revisionIssues = input.revision?.status === "failed" ? input.revision.issues ?? ["Graph edit revision save failed."] : [];
  const issues = [...input.planIssues, ...failedCommands.flatMap((result) => result.issues), ...revisionIssues];
  const status = input.interrupted
    ? "interrupted"
    : input.planOk && failedCommands.length === 0 && input.revision?.status !== "failed"
      ? "succeeded"
      : "failed";
  const commandDiffs = input.applyResults
    .map((result) => ({
      command_id: result.commandId,
      diff: Array.isArray(result.diff) ? result.diff.filter((entry) => entry.path.trim()) : [],
    }))
    .filter((result) => result.command_id.trim() && result.diff.length > 0);

  const summary: GraphEditPlaybackAuditSummary = {
    request_id: input.requestId,
    status,
    command_count: Math.max(0, input.commandCount),
    applied_command_count: input.applyResults.filter((result) => result.ok && result.applied && result.issues.length === 0).length,
    failed_command_count: failedCommands.length,
    playback_step_count: Math.max(0, input.playbackStepCount),
    issues,
    failed_commands: failedCommands,
    diff_count: commandDiffs.reduce((count, result) => count + result.diff.length, 0),
    command_diffs: commandDiffs,
  };
  if (input.revision) {
    summary.graph_id = input.revision.graphId ?? null;
    summary.revision_id = input.revision.revisionId ?? null;
    summary.revision_status = input.revision.status;
    summary.revision_issues = input.revision.issues ? [...input.revision.issues] : [];
  }
  return summary;
}

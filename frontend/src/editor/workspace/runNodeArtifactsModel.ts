import type { RunDetail } from "../../types/run.ts";

export type RunOutputPreviewEntry = {
  text: string;
  displayMode: string | null;
};

export type RunNodeArtifactsModel = {
  outputPreviewByNodeId: Record<string, RunOutputPreviewEntry>;
  failedMessageByNodeId: Record<string, string>;
  activeEdgeIds: string[];
};

export function buildRunNodeArtifactsModel(run: RunDetail): RunNodeArtifactsModel {
  const outputPreviewByNodeId: Record<string, RunOutputPreviewEntry> = {};
  for (const output of run.artifacts.exported_outputs ?? []) {
    const nodeId = output.node_id?.trim();
    if (!nodeId) {
      continue;
    }
    outputPreviewByNodeId[nodeId] = {
      text: formatRunNodeValue(output.value),
      displayMode: output.display_mode?.trim() || null,
    };
  }

  const failedMessageByNodeId: Record<string, string> = {};
  for (const execution of run.node_executions ?? []) {
    if (execution.status !== "failed") {
      continue;
    }
    const nodeId = execution.node_id?.trim();
    if (!nodeId) {
      continue;
    }
    failedMessageByNodeId[nodeId] = execution.errors?.filter(Boolean).join("\n").trim() || "Run failed on this node.";
  }

  return {
    outputPreviewByNodeId,
    failedMessageByNodeId,
    activeEdgeIds: [...(run.artifacts.active_edge_ids ?? [])],
  };
}

function formatRunNodeValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

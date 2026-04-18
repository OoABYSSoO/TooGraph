import type { RunDetail } from "../types/run.ts";

export type RunOutputArtifactCard = {
  key: string;
  title: string;
  text: string;
  displayMode: string;
  persistLabel: string;
  fileName: string | null;
};

export function shouldPollRunStatus(status: string | null | undefined) {
  return status === "queued" || status === "running" || status === "resuming";
}

export function formatRunArtifactValue(value: unknown) {
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

export function listRunOutputArtifacts(run: RunDetail): RunOutputArtifactCard[] {
  return (run.artifacts.exported_outputs ?? []).map((output, index) => ({
    key: `${output.node_id ?? "output"}-${output.source_key}-${index}`,
    title: output.label?.trim() || output.source_key || "Output",
    text: formatRunArtifactValue(output.value),
    displayMode: output.display_mode?.trim() || "auto",
    persistLabel: output.persist_enabled ? `persist ${output.persist_format ?? "txt"}` : "preview only",
    fileName: output.saved_file?.file_name ?? null,
  }));
}

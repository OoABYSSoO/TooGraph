import type { RunDetail } from "../types/run.ts";

import { formatRunDuration } from "../lib/run-display-name.ts";
import { translate } from "../i18n/index.ts";

export type RunOutputArtifactCard = {
  key: string;
  title: string;
  text: string;
  displayMode: string;
  persistLabel: string;
  fileName: string | null;
  documentRefs: ArtifactDocumentReference[];
};

export type ArtifactDocumentReference = {
  title: string;
  url: string;
  localPath: string;
  contentType: string;
  charCount: number | null;
};

export type RunStatusFact = {
  key: string;
  label: string;
  value: string;
  tone: "default" | "status";
};

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
    documentRefs: normalizeArtifactDocumentReferences(output.value),
  }));
}

export function normalizeArtifactDocumentReferences(value: unknown): ArtifactDocumentReference[] {
  const references: ArtifactDocumentReference[] = [];
  collectArtifactDocumentReferences(value, references, false);
  return references;
}

function collectArtifactDocumentReferences(value: unknown, references: ArtifactDocumentReference[], allowStringPath: boolean) {
  if (typeof value === "string") {
    if (allowStringPath) {
      appendArtifactDocumentReference(
        {
          title: "",
          url: "",
          local_path: value,
        },
        references,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectArtifactDocumentReferences(item, references, true);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  if (record.local_path !== undefined) {
    appendArtifactDocumentReference(record, references);
    return;
  }

  for (const nestedValue of Object.values(record)) {
    collectArtifactDocumentReferences(nestedValue, references, false);
  }
}

function appendArtifactDocumentReference(record: Record<string, unknown>, references: ArtifactDocumentReference[]) {
  const localPath = normalizeLocalArtifactPath(record.local_path);
  if (!localPath) {
    return;
  }
  references.push({
    title: normalizeText(record.title) || `Document ${references.length + 1}`,
    url: normalizeText(record.url),
    localPath,
    contentType: normalizeText(record.content_type ?? record.contentType) || "text/markdown",
    charCount: normalizeNumber(record.char_count ?? record.charCount),
  });
}

function normalizeLocalArtifactPath(value: unknown) {
  const path = normalizeText(value).replaceAll("\\", "/");
  if (!path || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    return "";
  }
  return path;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildRunStatusFacts(run: RunDetail): RunStatusFact[] {
  return [
    { key: "status", label: translate("runDetail.status"), value: run.status, tone: "status" },
    { key: "current", label: translate("runDetail.currentNode"), value: run.current_node_id?.trim() || translate("runDetail.ended"), tone: "default" },
    { key: "duration", label: translate("runDetail.duration"), value: formatRunDuration(run.duration_ms), tone: "default" },
    { key: "revision", label: translate("runDetail.revision"), value: String(run.revision_round), tone: "default" },
  ];
}

export type OutputPreviewContentKind = "plain" | "markdown" | "json" | "documents";

export type OutputPreviewContent = {
  kind: OutputPreviewContentKind;
  text: string;
  html: string;
  isEmpty: boolean;
};

export const OUTPUT_WAITING_TEXT = "Waiting for output...";

const CONNECTED_EMPTY_PREFIX = "Connected to ";
const UNBOUND_EMPTY_TEXT = "Connect an upstream output to preview/export it.";

export function resolveOutputPreviewContent(text: string, displayMode: string): OutputPreviewContent {
  const normalizedText = text || "";
  const normalizedDisplayMode = displayMode.trim().toLowerCase();
  const kind = resolveOutputPreviewDisplayMode(normalizedText, normalizedDisplayMode);

  if (kind === "markdown") {
    return {
      kind,
      text: normalizedText,
      html: renderSafeMarkdown(normalizedText),
      isEmpty: isOutputPreviewEmpty(normalizedText),
    };
  }

  if (kind === "json") {
    return {
      kind,
      text: formatJsonPreview(normalizedText),
      html: "",
      isEmpty: isOutputPreviewEmpty(normalizedText),
    };
  }

  if (kind === "documents") {
    return {
      kind,
      text: formatDocumentPreview(normalizedText),
      html: "",
      isEmpty: isOutputPreviewEmpty(normalizedText),
    };
  }

  return {
    kind: "plain",
    text: normalizedText,
    html: "",
    isEmpty: isOutputPreviewEmpty(normalizedText),
  };
}

export function resolveOutputPreviewDisplayMode(text: string, displayMode: string): OutputPreviewContentKind {
  if (displayMode === "markdown") {
    return "markdown";
  }
  if (displayMode === "json") {
    return "json";
  }
  if (displayMode === "documents") {
    return "documents";
  }
  if (displayMode === "plain") {
    return "plain";
  }
  if (canParseJson(text)) {
    return "json";
  }
  if (looksLikeMarkdown(text)) {
    return "markdown";
  }
  return "plain";
}

function canParseJson(text: string) {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function formatJsonPreview(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

function formatDocumentPreview(text: string) {
  const documents = parseDocumentPreviewRecords(text);
  if (documents === null) {
    return text;
  }
  if (documents.length === 0) {
    return "No local source documents.";
  }

  const availableCount = documents.filter((document) => document.localPath).length;
  const header = `${availableCount} local source document${availableCount === 1 ? "" : "s"}`;
  const lines = [header];
  documents.forEach((document, index) => {
    lines.push(`${index + 1}. ${document.title || `Document ${index + 1}`}`);
    if (document.url) {
      lines.push(`   URL: ${document.url}`);
    }
    if (document.localPath) {
      lines.push(`   Local: ${document.localPath}`);
    }
    if (document.charCount !== null) {
      lines.push(`   Size: ${document.charCount} chars`);
    }
    if (!document.localPath && document.error) {
      lines.push(`   Unavailable: ${document.error}`);
    }
  });
  return lines.join("\n");
}

type DocumentPreviewRecord = {
  title: string;
  url: string;
  localPath: string;
  charCount: number | null;
  error: string;
};

function parseDocumentPreviewRecords(text: string): DocumentPreviewRecord[] | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    const documents: DocumentPreviewRecord[] = [];
    collectDocumentPreviewRecords(parsed, documents, false);
    return documents;
  } catch {
    return null;
  }
}

function collectDocumentPreviewRecords(value: unknown, documents: DocumentPreviewRecord[], allowStringPath: boolean) {
  if (typeof value === "string") {
    if (allowStringPath) {
      appendDocumentPreviewRecord({ local_path: value }, documents);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectDocumentPreviewRecords(item, documents, true);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  if (record.local_path !== undefined) {
    appendDocumentPreviewRecord(record, documents);
    return;
  }

  for (const nestedValue of Object.values(record)) {
    collectDocumentPreviewRecords(nestedValue, documents, false);
  }
}

function appendDocumentPreviewRecord(record: Record<string, unknown>, documents: DocumentPreviewRecord[]) {
  const localPath = normalizePreviewLocalPath(record.local_path);
  if (!localPath) {
    return;
  }
  documents.push({
    title: normalizePreviewText(record.title) || `Document ${documents.length + 1}`,
    url: normalizePreviewText(record.url),
    localPath,
    charCount: normalizePreviewNumber(record.char_count ?? record.charCount),
    error: normalizePreviewText(record.error),
  });
}

function normalizePreviewText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePreviewLocalPath(value: unknown) {
  const path = normalizePreviewText(value).replaceAll("\\", "/");
  if (!path || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    return "";
  }
  return path;
}

function normalizePreviewNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function looksLikeMarkdown(text: string) {
  return /^\s{0,3}#{1,6}\s+\S/m.test(text) || /^\s*[-*]\s+\S/m.test(text) || /\*\*[^*]+\*\*/.test(text) || /`[^`]+`/.test(text);
}

function renderSafeMarkdown(text: string) {
  const html: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (!listOpen) {
      return;
    }
    html.push("</ul>");
    listOpen = false;
  };

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const listMatch = /^\s*[-*]\s+(.+)$/.exec(line);
    if (listMatch) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  closeList();
  return html.join("");
}

function renderInlineMarkdown(text: string) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isOutputPreviewEmpty(text: string) {
  const trimmed = text.trim();
  return (
    trimmed.length === 0 ||
    trimmed === UNBOUND_EMPTY_TEXT ||
    trimmed === OUTPUT_WAITING_TEXT ||
    trimmed.startsWith(CONNECTED_EMPTY_PREFIX)
  );
}

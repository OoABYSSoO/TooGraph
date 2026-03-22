export type OutputPreviewContentKind = "plain" | "markdown" | "json" | "documents";

export type OutputPreviewDocumentReference = {
  title: string;
  url: string;
  localPath: string;
  contentType: string;
  charCount: number | null;
  artifactKind: "document" | "image" | "video" | "audio" | "file";
  size: number | null;
  filename: string;
  error?: string;
};

export type OutputPreviewContent = {
  kind: OutputPreviewContentKind;
  text: string;
  html: string;
  isEmpty: boolean;
  documentRefs: OutputPreviewDocumentReference[];
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
      documentRefs: [],
    };
  }

  if (kind === "json") {
    return {
      kind,
      text: formatJsonPreview(normalizedText),
      html: "",
      isEmpty: isOutputPreviewEmpty(normalizedText),
      documentRefs: [],
    };
  }

  if (kind === "documents") {
    const documents = parseDocumentPreviewRecords(normalizedText);
    return {
      kind,
      text: formatDocumentPreview(normalizedText, documents),
      html: "",
      isEmpty: isOutputPreviewEmpty(normalizedText),
      documentRefs: documents ?? [],
    };
  }

  return {
    kind: "plain",
    text: normalizedText,
    html: "",
    isEmpty: isOutputPreviewEmpty(normalizedText),
    documentRefs: [],
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

function formatDocumentPreview(text: string, documents: OutputPreviewDocumentReference[] | null) {
  if (documents === null) {
    return text;
  }
  if (documents.length === 0) {
    return "No local source documents.";
  }

  const availableCount = documents.filter((document) => document.localPath).length;
  const hasMedia = documents.some((document) => document.artifactKind !== "document");
  const header = hasMedia
    ? `${availableCount} local artifact${availableCount === 1 ? "" : "s"}`
    : `${availableCount} local source document${availableCount === 1 ? "" : "s"}`;
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
    } else if (document.size !== null) {
      lines.push(`   Size: ${document.size} bytes`);
    }
    if (!document.localPath && document.error) {
      lines.push(`   Unavailable: ${document.error}`);
    }
  });
  return lines.join("\n");
}

function parseDocumentPreviewRecords(text: string): OutputPreviewDocumentReference[] | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    const documents: OutputPreviewDocumentReference[] = [];
    collectDocumentPreviewRecords(parsed, documents, false);
    return documents;
  } catch {
    return null;
  }
}

function collectDocumentPreviewRecords(value: unknown, documents: OutputPreviewDocumentReference[], allowStringPath: boolean) {
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

function appendDocumentPreviewRecord(record: Record<string, unknown>, documents: OutputPreviewDocumentReference[]) {
  const localPath = normalizePreviewLocalPath(record.local_path);
  if (!localPath) {
    return;
  }
  const error = normalizePreviewText(record.error);
  documents.push({
    title: normalizePreviewText(record.title) || normalizePreviewText(record.filename) || `Document ${documents.length + 1}`,
    url: normalizePreviewText(record.url),
    localPath,
    contentType: normalizePreviewText(record.content_type ?? record.contentType) || "text/markdown",
    charCount: normalizePreviewNumber(record.char_count ?? record.charCount),
    artifactKind: resolveArtifactKind(normalizePreviewText(record.content_type ?? record.contentType), localPath),
    size: normalizePreviewNumber(record.size),
    filename: normalizePreviewText(record.filename) || localPath.split("/").at(-1) || "",
    ...(error ? { error } : {}),
  });
}

function resolveArtifactKind(contentType: string, localPath: string): OutputPreviewDocumentReference["artifactKind"] {
  const normalizedType = contentType.toLowerCase();
  if (normalizedType.startsWith("image/")) {
    return "image";
  }
  if (normalizedType.startsWith("video/")) {
    return "video";
  }
  if (normalizedType.startsWith("audio/")) {
    return "audio";
  }
  if (normalizedType.startsWith("text/") || normalizedType === "application/json" || normalizedType === "text/markdown") {
    return "document";
  }
  if (/\.(md|markdown|txt|json|jsonl|csv|log)$/i.test(localPath)) {
    return "document";
  }
  if (/\.(avif|bmp|gif|heic|ico|jpe?g|png|svg|tiff?|webp)$/i.test(localPath)) {
    return "image";
  }
  if (/\.(3gp|avi|flv|m4v|mkv|mov|mp4|mpeg|mpg|ogv|webm)$/i.test(localPath)) {
    return "video";
  }
  if (/\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i.test(localPath)) {
    return "audio";
  }
  return "file";
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
  return (
    /^\s{0,3}#{1,6}\s+\S/m.test(text) ||
    /^\s*[-*]\s+\S/m.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /`[^`]+`/.test(text) ||
    hasMarkdownTable(text)
  );
}

function renderSafeMarkdown(text: string) {
  const html: string[] = [];
  let listOpen = false;
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  const closeList = () => {
    if (!listOpen) {
      return;
    }
    html.push("</ul>");
    listOpen = false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }

    const tableBlock = parseMarkdownTableBlock(lines, index);
    if (tableBlock) {
      closeList();
      html.push(tableBlock.html);
      index = tableBlock.endIndex;
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

function hasMarkdownTable(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (parseMarkdownTableBlock(lines, index)) {
      return true;
    }
  }
  return false;
}

function parseMarkdownTableBlock(lines: string[], startIndex: number): { html: string; endIndex: number } | null {
  const header = splitMarkdownTableRow(lines[startIndex] ?? "");
  const separator = splitMarkdownTableRow(lines[startIndex + 1] ?? "");
  if (header.length === 0 || separator.length !== header.length || !separator.every(isMarkdownTableSeparatorCell)) {
    return null;
  }

  const bodyRows: string[][] = [];
  let endIndex = startIndex + 1;
  for (let index = startIndex + 2; index < lines.length; index += 1) {
    const cells = splitMarkdownTableRow(lines[index] ?? "");
    if (cells.length === 0) {
      break;
    }
    bodyRows.push(normalizeMarkdownTableCells(cells, header.length));
    endIndex = index;
  }

  const headHtml = `<thead><tr>${header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>`;
  const bodyHtml =
    bodyRows.length > 0
      ? `<tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`
      : "";
  return {
    html: `<table>${headHtml}${bodyHtml}</table>`,
    endIndex,
  };
}

function splitMarkdownTableRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return [];
  }
  const normalized = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = normalized.split("|").map((cell) => cell.trim());
  return cells.length >= 2 ? cells : [];
}

function isMarkdownTableSeparatorCell(cell: string) {
  return /^:?-{3,}:?$/.test(cell.trim());
}

function normalizeMarkdownTableCells(cells: string[], columnCount: number) {
  return Array.from({ length: columnCount }, (_value, index) => cells[index] ?? "");
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

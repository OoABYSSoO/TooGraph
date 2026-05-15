export type OutputPreviewContentKind = "plain" | "markdown" | "html" | "json" | "documents" | "package";
export type OutputPreviewRenderedContentKind = Exclude<OutputPreviewContentKind, "package">;

export type OutputLinkedTextSegment =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "link";
      text: string;
      href: string;
    };

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

export type OutputPreviewPackagePage = {
  key: string;
  title: string;
  description: string;
  valueType: string;
  kind: OutputPreviewRenderedContentKind;
  text: string;
  html: string;
  isEmpty: boolean;
  documentRefs: OutputPreviewDocumentReference[];
};

export type OutputPreviewContent = {
  kind: OutputPreviewContentKind;
  text: string;
  html: string;
  isEmpty: boolean;
  documentRefs: OutputPreviewDocumentReference[];
  packagePages?: OutputPreviewPackagePage[];
};

export const OUTPUT_WAITING_TEXT = "Waiting for output...";

const CONNECTED_EMPTY_PREFIX = "Connected to ";
const UNBOUND_EMPTY_TEXT = "Connect an upstream output to preview/export it.";
const OUTPUT_URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`*]+/gi;

export function linkifyOutputText(text: string): OutputLinkedTextSegment[] {
  const segments: OutputLinkedTextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(OUTPUT_URL_PATTERN)) {
    const startIndex = match.index ?? 0;
    const rawMatch = match[0] ?? "";
    if (!rawMatch) {
      continue;
    }

    if (startIndex > lastIndex) {
      appendOutputTextSegment(segments, text.slice(lastIndex, startIndex));
    }

    const { linkText, suffix } = trimTrailingUrlPunctuation(rawMatch);
    if (linkText) {
      segments.push({
        kind: "link",
        text: linkText,
        href: normalizeOutputUrlHref(linkText),
      });
    } else {
      appendOutputTextSegment(segments, rawMatch);
    }
    if (suffix) {
      appendOutputTextSegment(segments, suffix);
    }

    lastIndex = startIndex + rawMatch.length;
  }

  if (lastIndex < text.length) {
    appendOutputTextSegment(segments, text.slice(lastIndex));
  }

  return segments;
}

export function resolveOutputPreviewContent(text: string, displayMode: string): OutputPreviewContent {
  const normalizedText = text || "";
  const normalizedDisplayMode = displayMode.trim().toLowerCase();
  const packageContent = resolveResultPackagePreviewContent(normalizedText);
  if (packageContent) {
    return packageContent;
  }
  const kind = resolveOutputPreviewDisplayMode(normalizedText, normalizedDisplayMode);

  return resolveBasicOutputPreviewContent(normalizedText, kind === "package" ? "json" : kind);
}

function resolveBasicOutputPreviewContent(text: string, kind: OutputPreviewRenderedContentKind): OutputPreviewContent {
  const normalizedText = text || "";

  if (kind === "markdown") {
    return {
      kind,
      text: normalizedText,
      html: renderSafeMarkdown(normalizedText),
      isEmpty: isOutputPreviewEmpty(normalizedText),
      documentRefs: [],
    };
  }

  if (kind === "html") {
    return {
      kind,
      text: normalizedText,
      html: normalizedText,
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
  const packageMode = resolveResultPackageDisplayMode(text);
  if (packageMode) {
    return packageMode;
  }
  return resolveBasicOutputPreviewDisplayMode(text, displayMode);
}

function resolveBasicOutputPreviewDisplayMode(text: string, displayMode: string): OutputPreviewRenderedContentKind {
  if (displayMode === "markdown") {
    return "markdown";
  }
  if (displayMode === "html") {
    return "html";
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

function resolveResultPackageDisplayMode(text: string): OutputPreviewContentKind | null {
  const packageValue = parseResultPackageText(text);
  if (!packageValue) {
    return null;
  }
  const pages = buildResultPackagePages(packageValue);
  if (pages.length === 0) {
    return null;
  }
  return pages.length === 1 ? pages[0].kind : "package";
}

function resolveResultPackagePreviewContent(text: string): OutputPreviewContent | null {
  const packageValue = parseResultPackageText(text);
  if (!packageValue) {
    return null;
  }
  const pages = buildResultPackagePages(packageValue);
  if (pages.length === 0) {
    return null;
  }
  if (pages.length === 1) {
    const page = pages[0];
    return {
      kind: page.kind,
      text: page.text,
      html: page.html,
      isEmpty: page.isEmpty,
      documentRefs: page.documentRefs,
    };
  }
  return {
    kind: "package",
    text,
    html: "",
    isEmpty: false,
    documentRefs: [],
    packagePages: pages,
  };
}

function parseResultPackageText(text: string): Record<string, unknown> | null {
  const parsed = parseJsonPreviewValue(text);
  if (!parsed || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return null;
  }
  const record = parsed.value as Record<string, unknown>;
  if (record.kind !== "result_package" || !record.outputs || typeof record.outputs !== "object" || Array.isArray(record.outputs)) {
    return null;
  }
  return record;
}

function buildResultPackagePages(packageValue: Record<string, unknown>): OutputPreviewPackagePage[] {
  const outputs = packageValue.outputs as Record<string, unknown>;
  return Object.entries(outputs)
    .map(([key, rawOutput]) => buildResultPackagePage(key, rawOutput))
    .filter((page): page is OutputPreviewPackagePage => page !== null);
}

function buildResultPackagePage(key: string, rawOutput: unknown): OutputPreviewPackagePage | null {
  const outputKey = key.trim();
  if (!outputKey) {
    return null;
  }
  const outputRecord =
    rawOutput && typeof rawOutput === "object" && !Array.isArray(rawOutput) ? (rawOutput as Record<string, unknown>) : null;
  const value = outputRecord && Object.prototype.hasOwnProperty.call(outputRecord, "value") ? outputRecord.value : rawOutput;
  const valueType = outputRecord ? normalizePreviewText(outputRecord.type) : "";
  const title = (outputRecord ? normalizePreviewText(outputRecord.name) : "") || outputKey;
  const description = outputRecord ? normalizePreviewText(outputRecord.description) : "";
  const text = stringifyPreviewValue(value);
  const kind = resolveResultPackageOutputDisplayMode(valueType, value, text);
  const content = resolveBasicOutputPreviewContent(text, kind);
  return {
    key: outputKey,
    title,
    description,
    valueType: valueType || kind,
    kind,
    text: content.text,
    html: content.html,
    isEmpty: content.isEmpty,
    documentRefs: content.documentRefs,
  };
}

function resolveResultPackageOutputDisplayMode(
  valueType: string,
  value: unknown,
  text: string,
): OutputPreviewRenderedContentKind {
  const normalizedType = valueType.trim().toLowerCase();
  if (normalizedType === "markdown") {
    return "markdown";
  }
  if (normalizedType === "html") {
    return "html";
  }
  if (normalizedType === "json" || normalizedType === "capability" || normalizedType === "result_package") {
    return "json";
  }
  if (normalizedType === "file" || normalizedType === "image" || normalizedType === "audio" || normalizedType === "video") {
    return "documents";
  }
  if (normalizedType === "text" || normalizedType === "number" || normalizedType === "boolean") {
    return "plain";
  }
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return "json";
  }
  return resolveBasicOutputPreviewDisplayMode(text, "auto");
}

function stringifyPreviewValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseJsonPreviewValue(text: string): { value: unknown } | null {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }
  try {
    return { value: JSON.parse(trimmed) };
  } catch {
    return null;
  }
}

function canParseJson(text: string) {
  return parseJsonPreviewValue(text) !== null;
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
    const documents: OutputPreviewDocumentReference[] = [];
    collectDocumentPreviewRecords(trimmed, documents, true);
    return documents.length > 0 ? documents : null;
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
    /^\s{0,3}```\S*/m.test(text) ||
    /^\s{0,3}#{1,6}\s+\S/m.test(text) ||
    /^\s*[-*]\s+\S/m.test(text) ||
    /^\s*\d+[.)]\s+\S/m.test(text) ||
    /^\s*>\s*\S/m.test(text) ||
    /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/m.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /`[^`]+`/.test(text) ||
    /\[[^\]]+\]\([^\s)]+(?:\)[^\s)]*)?\)/.test(text) ||
    hasMarkdownTable(text)
  );
}

function renderSafeMarkdown(text: string) {
  const html: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  const closeList = (nextKind?: "ul" | "ol") => {
    if (!listKind || listKind === nextKind) {
      return;
    }
    html.push(`</${listKind}>`);
    listKind = null;
  };

  const openList = (kind: "ul" | "ol") => {
    if (listKind === kind) {
      return;
    }
    closeList();
    html.push(`<${kind}>`);
    listKind = kind;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }

    const codeBlock = parseMarkdownCodeBlock(lines, index);
    if (codeBlock) {
      closeList();
      html.push(codeBlock.html);
      index = codeBlock.endIndex;
      continue;
    }

    const tableBlock = parseMarkdownTableBlock(lines, index);
    if (tableBlock) {
      closeList();
      html.push(tableBlock.html);
      index = tableBlock.endIndex;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const blockquoteBlock = parseMarkdownBlockquoteBlock(lines, index);
    if (blockquoteBlock) {
      closeList();
      html.push(blockquoteBlock.html);
      index = blockquoteBlock.endIndex;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      closeList();
      html.push("<hr>");
      continue;
    }

    const listMatch = /^\s*[-*]\s+(.+)$/.exec(line);
    if (listMatch) {
      openList("ul");
      html.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    const orderedListMatch = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (orderedListMatch) {
      openList("ol");
      html.push(`<li>${renderInlineMarkdown(orderedListMatch[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  closeList();
  return html.join("");
}

function parseMarkdownCodeBlock(lines: string[], startIndex: number): { html: string; endIndex: number } | null {
  const openingMatch = /^\s{0,3}```\s*([^\s`]*)?.*$/.exec(lines[startIndex] ?? "");
  if (!openingMatch) {
    return null;
  }

  const codeLines: string[] = [];
  let endIndex = startIndex;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^\s{0,3}```\s*$/.test(lines[index] ?? "")) {
      endIndex = index;
      break;
    }
    codeLines.push(lines[index] ?? "");
    endIndex = index;
  }

  const language = normalizeMarkdownCodeLanguage(openingMatch[1] ?? "");
  const languageAttributes = language ? ` data-language="${escapeHtml(language)}"` : "";
  const codeClass = language ? ` class="language-${escapeHtml(language)}"` : "";
  return {
    html: `<pre${languageAttributes}><code${codeClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
    endIndex,
  };
}

function normalizeMarkdownCodeLanguage(value: string) {
  const language = value.trim().replace(/^language-/i, "");
  return /^[a-zA-Z0-9_+.#-]{1,32}$/.test(language) ? language : "";
}

function parseMarkdownBlockquoteBlock(lines: string[], startIndex: number): { html: string; endIndex: number } | null {
  const firstMatch = /^\s*>\s?(.*)$/.exec(lines[startIndex] ?? "");
  if (!firstMatch) {
    return null;
  }

  const quoteLines: string[] = [];
  let endIndex = startIndex;
  for (let index = startIndex; index < lines.length; index += 1) {
    const match = /^\s*>\s?(.*)$/.exec(lines[index] ?? "");
    if (!match) {
      break;
    }
    quoteLines.push(match[1].trimEnd());
    endIndex = index;
  }

  const content = quoteLines.map((line) => renderInlineMarkdown(line)).join("<br>");
  return {
    html: `<blockquote><p>${content}</p></blockquote>`,
    endIndex,
  };
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
  const codeSpans: string[] = [];
  const markdownLinks: string[] = [];
  const codePlaceholderPrefix = "%%TOOGRAPH_CODE_SPAN_";
  const markdownLinkPlaceholderPrefix = "%%TOOGRAPH_MARKDOWN_LINK_";
  const escaped = escapeHtml(text).replace(/`([^`]+)`/g, (_match, code: string) => {
    const placeholder = `${codePlaceholderPrefix}${codeSpans.length}%%`;
    codeSpans.push(`<code>${code}</code>`);
    return placeholder;
  });

  const linked = escaped.replace(/\[([^\]]+)\]\(([^ \t\r\n]+)\)/g, (_match, label: string, href: string) => {
    if (!isSafeMarkdownHref(href)) {
      return `${label} (${href})`;
    }
    const placeholder = `${markdownLinkPlaceholderPrefix}${markdownLinks.length}%%`;
    markdownLinks.push(`<a href="${href}" target="_blank" rel="noreferrer noopener">${label}</a>`);
    return placeholder;
  });

  const autoLinked = renderOutputLinksInEscapedText(linked);
  const formatted = autoLinked.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const restoredLinks = markdownLinks.reduce(
    (value, link, index) => value.replace(`${markdownLinkPlaceholderPrefix}${index}%%`, link),
    formatted,
  );
  return codeSpans.reduce((value, code, index) => value.replace(`${codePlaceholderPrefix}${index}%%`, code), restoredLinks);
}

function renderOutputLinksInEscapedText(text: string) {
  return text
    .split(/(%%TOOGRAPH_(?:CODE_SPAN|MARKDOWN_LINK)_\d+%%)/g)
    .map((part) => {
      if (/^%%TOOGRAPH_(?:CODE_SPAN|MARKDOWN_LINK)_\d+%%$/.test(part)) {
        return part;
      }
      return linkifyOutputText(part)
        .map((segment) => {
          if (segment.kind === "text") {
            return segment.text;
          }
          return `<a href="${segment.href}" target="_blank" rel="noreferrer noopener">${segment.text}</a>`;
        })
        .join("");
    })
    .join("");
}

function isSafeMarkdownHref(href: string) {
  const normalized = href.trim().toLowerCase();
  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("#") ||
    normalized.startsWith("/")
  );
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appendOutputTextSegment(segments: OutputLinkedTextSegment[], text: string) {
  if (!text) {
    return;
  }
  const previous = segments.at(-1);
  if (previous?.kind === "text") {
    previous.text += text;
    return;
  }
  segments.push({ kind: "text", text });
}

function trimTrailingUrlPunctuation(rawUrl: string) {
  let linkText = rawUrl;
  let suffix = "";
  while (linkText) {
    const lastCharacter = linkText.at(-1) ?? "";
    if (/[.,;:!?]/.test(lastCharacter) || shouldTrimClosingUrlPunctuation(linkText, lastCharacter)) {
      suffix = lastCharacter + suffix;
      linkText = linkText.slice(0, -1);
      continue;
    }
    break;
  }
  return { linkText, suffix };
}

function shouldTrimClosingUrlPunctuation(text: string, character: string) {
  const openingCharacterByClosingCharacter: Record<string, string> = {
    ")": "(",
    "]": "[",
    "}": "{",
  };
  const openingCharacter = openingCharacterByClosingCharacter[character];
  if (!openingCharacter) {
    return false;
  }
  return countCharacters(text, character) > countCharacters(text, openingCharacter);
}

function countCharacters(text: string, character: string) {
  return Array.from(text).filter((item) => item === character).length;
}

function normalizeOutputUrlHref(text: string) {
  return /^www\./i.test(text) ? `https://${text}` : text;
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

export type OutputPreviewContentKind = "plain" | "markdown" | "json";

export type OutputPreviewContent = {
  kind: OutputPreviewContentKind;
  text: string;
  html: string;
  isEmpty: boolean;
};

const CONNECTED_EMPTY_PREFIX = "Connected to ";
const UNBOUND_EMPTY_TEXT = "Connect an upstream output to preview/export it.";

export function resolveOutputPreviewContent(text: string, displayMode: string): OutputPreviewContent {
  const normalizedText = text || "";
  const normalizedDisplayMode = displayMode.trim().toLowerCase();
  const kind = resolvePreviewKind(normalizedText, normalizedDisplayMode);

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

  return {
    kind: "plain",
    text: normalizedText,
    html: "",
    isEmpty: isOutputPreviewEmpty(normalizedText),
  };
}

function resolvePreviewKind(text: string, displayMode: string): OutputPreviewContentKind {
  if (displayMode === "markdown") {
    return "markdown";
  }
  if (displayMode === "json") {
    return "json";
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
  return trimmed.length === 0 || trimmed === UNBOUND_EMPTY_TEXT || trimmed.startsWith(CONNECTED_EMPTY_PREFIX);
}

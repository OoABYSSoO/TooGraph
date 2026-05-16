export type LocalArtifactKind = "document" | "image" | "video" | "audio" | "file";

export type LocalArtifactReference = {
  title: string;
  url: string;
  localPath: string;
  contentType: string;
  charCount: number | null;
  artifactKind: LocalArtifactKind;
  size: number | null;
  filename: string;
  error?: string;
};

export function collectLocalArtifactReferences(value: unknown, options: { allowStringRoot?: boolean } = {}) {
  const references: LocalArtifactReference[] = [];
  collectArtifactRecordReferences(value, references, Boolean(options.allowStringRoot));
  return references;
}

function collectArtifactRecordReferences(value: unknown, references: LocalArtifactReference[], allowStringPath: boolean) {
  if (typeof value === "string") {
    if (allowStringPath && looksLikeStandaloneArtifactPath(value)) {
      appendArtifactReference({ local_path: value }, references);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectArtifactRecordReferences(item, references, true);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  if (record.local_path !== undefined) {
    appendArtifactReference(record, references);
    return;
  }

  for (const nestedValue of Object.values(record)) {
    collectArtifactRecordReferences(nestedValue, references, false);
  }
}

function appendArtifactReference(record: Record<string, unknown>, references: LocalArtifactReference[]) {
  const localPath = normalizeLocalArtifactPath(record.local_path);
  if (!localPath) {
    return;
  }
  const contentType = resolveArtifactContentType(record, localPath);
  const error = normalizeText(record.error);
  references.push({
    title: resolveArtifactReferenceTitle(record, references.length),
    url: normalizeText(record.url),
    localPath,
    contentType,
    charCount: normalizeNumber(record.char_count ?? record.charCount),
    artifactKind: resolveArtifactKind(contentType, localPath),
    size: normalizeNumber(record.size),
    filename: normalizeText(record.filename) || localPath.split("/").at(-1) || "",
    ...(error ? { error } : {}),
  });
}

function resolveArtifactReferenceTitle(record: Record<string, unknown>, index: number) {
  const explicitTitle = normalizeText(record.title) || normalizeText(record.filename);
  if (explicitTitle) {
    return explicitTitle;
  }
  const segmentTitle = resolveSegmentArtifactTitle(record, index);
  if (segmentTitle) {
    return segmentTitle;
  }
  return `Document ${index + 1}`;
}

function resolveSegmentArtifactTitle(record: Record<string, unknown>, index: number) {
  const startSec = normalizeNumber(record.start_sec ?? record.startSec);
  const endSec = normalizeNumber(record.end_sec ?? record.endSec);
  if (startSec === null || endSec === null) {
    return "";
  }
  const rawIndex = normalizeNumber(record.index);
  const segmentIndex = rawIndex === null ? index + 1 : rawIndex + 1;
  return `Segment ${segmentIndex} (${formatSegmentSeconds(startSec)}-${formatSegmentSeconds(endSec)})`;
}

function resolveArtifactContentType(record: Record<string, unknown>, localPath: string) {
  const declaredType = normalizeText(record.content_type ?? record.contentType ?? record.mime_type ?? record.mimeType);
  if (declaredType) {
    return declaredType;
  }
  return inferContentTypeFromLocalPath(localPath);
}

function inferContentTypeFromLocalPath(localPath: string) {
  if (/\.mp4$/i.test(localPath)) {
    return "video/mp4";
  }
  if (/\.webm$/i.test(localPath)) {
    return "video/webm";
  }
  if (/\.mov$/i.test(localPath)) {
    return "video/quicktime";
  }
  if (/\.(m4v|mkv|avi|3gp|3gpp|ogv|mpg|mpeg)$/i.test(localPath)) {
    return "video/mp4";
  }
  if (/\.(jpe?g)$/i.test(localPath)) {
    return "image/jpeg";
  }
  if (/\.png$/i.test(localPath)) {
    return "image/png";
  }
  if (/\.webp$/i.test(localPath)) {
    return "image/webp";
  }
  if (/\.gif$/i.test(localPath)) {
    return "image/gif";
  }
  if (/\.mp3$/i.test(localPath)) {
    return "audio/mpeg";
  }
  if (/\.wav$/i.test(localPath)) {
    return "audio/wav";
  }
  if (/\.m4a$/i.test(localPath)) {
    return "audio/mp4";
  }
  if (/\.json$/i.test(localPath)) {
    return "application/json";
  }
  if (/\.(txt|log|csv)$/i.test(localPath)) {
    return "text/plain";
  }
  return "text/markdown";
}

function resolveArtifactKind(contentType: string, localPath: string): LocalArtifactKind {
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

function normalizeLocalArtifactPath(value: unknown) {
  const path = normalizeText(value).replaceAll("\\", "/");
  if (!path || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    return "";
  }
  return path;
}

function looksLikeStandaloneArtifactPath(value: string) {
  const path = normalizeText(value).replaceAll("\\", "/");
  return Boolean(path && path.length <= 1024 && !/[\r\n]/.test(path) && path.includes("/"));
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatSegmentSeconds(value: number) {
  return `${Number(value.toFixed(3)).toString()}s`;
}

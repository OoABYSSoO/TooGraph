export type UploadedAssetType = "image" | "audio" | "video" | "file";

export type UploadedAssetEnvelope = {
  kind: "uploaded_file";
  name: string;
  mimeType: string;
  size: number;
  detectedType: UploadedAssetType;
  localPath: string;
  contentType: string;
  textPreview?: string;
  encoding: "local_path";
};

export type UploadedAssetUploadResult = {
  local_path: string;
  filename: string;
  content_type: string;
  size: number;
};

const IMAGE_ACCEPT = "image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.heic,.heif";
const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.amr";
const VIDEO_ACCEPT = "video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi,.3gp,.3gpp,.ogv,.mpg,.mpeg";
const DOCUMENT_ACCEPT = [
  "application/pdf",
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".htm",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".rtf",
  ".odt",
  ".ods",
  ".odp",
  ".pages",
  ".numbers",
  ".key",
].join(",");
const GENERIC_FILE_ACCEPT = [IMAGE_ACCEPT, AUDIO_ACCEPT, VIDEO_ACCEPT, DOCUMENT_ACCEPT].join(",");

export function isUploadedAssetStateType(stateType: string): stateType is UploadedAssetType {
  return stateType === "image" || stateType === "audio" || stateType === "video" || stateType === "file";
}

export function detectUploadedAssetTypeFromFileName(fileName: string, mimeType = ""): UploadedAssetType {
  const normalizedMimeType = mimeType.toLowerCase().trim();
  if (normalizedMimeType.startsWith("image/")) {
    return "image";
  }
  if (normalizedMimeType.startsWith("audio/")) {
    return "audio";
  }
  if (normalizedMimeType.startsWith("video/")) {
    return "video";
  }

  const normalized = fileName.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg|heic|heif)$/.test(normalized)) {
    return "image";
  }
  if (/\.(mp3|wav|ogg|m4a|aac|flac|opus|amr)$/.test(normalized)) {
    return "audio";
  }
  if (/\.(mp4|mov|webm|mkv|avi|m4v|3gp|3gpp|ogv|mpg|mpeg)$/.test(normalized)) {
    return "video";
  }
  return "file";
}

export function tryParseUploadedAssetEnvelope(value: unknown): UploadedAssetEnvelope | null {
  const parsed = typeof value === "string" ? tryParseJson(value) : value;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidate = parsed as Partial<UploadedAssetEnvelope>;
  const detectedType = String(candidate.detectedType ?? "");
  const encoding = candidate.encoding;
  const localPath = String(candidate.localPath ?? "");
  if (
    candidate.kind !== "uploaded_file" ||
    typeof candidate.name !== "string" ||
    typeof candidate.mimeType !== "string" ||
    typeof candidate.size !== "number" ||
    !Number.isFinite(candidate.size) ||
    !isUploadedAssetStateType(detectedType) ||
    typeof localPath !== "string" ||
    !localPath.trim() ||
    encoding !== "local_path"
  ) {
    return null;
  }

  return {
    kind: "uploaded_file",
    name: candidate.name,
    mimeType: candidate.mimeType,
    size: candidate.size,
    detectedType,
    localPath: localPath.trim(),
    contentType: String(candidate.contentType ?? candidate.mimeType ?? "application/octet-stream"),
    textPreview: typeof candidate.textPreview === "string" ? candidate.textPreview : undefined,
    encoding,
  };
}

export async function createUploadedAssetEnvelope(
  file: File,
  uploadFile: (file: File) => Promise<UploadedAssetUploadResult>,
): Promise<UploadedAssetEnvelope> {
  const detectedType = detectUploadedAssetTypeFromFileName(file.name, file.type);
  const upload = await uploadFile(file);
  const textPreview = detectedType === "file" && isTextLikeUploadedFile(file) ? (await file.text()).slice(0, 3000) : undefined;

  return {
    kind: "uploaded_file",
    name: upload.filename || file.name,
    mimeType: file.type || upload.content_type || "application/octet-stream",
    size: upload.size || file.size,
    detectedType,
    localPath: upload.local_path,
    contentType: upload.content_type || file.type || "application/octet-stream",
    textPreview,
    encoding: "local_path",
  };
}

export function resolveUploadedAssetInputAccept(assetType: UploadedAssetType | null) {
  switch (assetType) {
    case "image":
      return IMAGE_ACCEPT;
    case "audio":
      return AUDIO_ACCEPT;
    case "video":
      return VIDEO_ACCEPT;
    default:
      return GENERIC_FILE_ACCEPT;
  }
}

export function resolveUploadedAssetLabel(assetType: UploadedAssetType | null) {
  switch (assetType) {
    case "image":
      return "image";
    case "audio":
      return "audio clip";
    case "video":
      return "video";
    default:
      return "file";
  }
}

export function resolveUploadedAssetSummary(asset: UploadedAssetEnvelope | null) {
  if (!asset) {
    return "";
  }
  return `${asset.mimeType} · ${Math.max(1, Math.round(asset.size / 1024))} KB`;
}

export function resolveUploadedAssetTextPreview(asset: UploadedAssetEnvelope | null) {
  if (!asset?.textPreview) {
    return "";
  }
  return asset.textPreview.slice(0, 3000);
}

export function resolveUploadedAssetDescription(asset: UploadedAssetEnvelope | null, assetType: UploadedAssetType | null) {
  if (asset) {
    return `Stored as ${asset.detectedType} upload. ${resolveUploadedAssetSummary(asset)}`;
  }

  switch (assetType) {
    case "image":
      return "Upload a reference image for this workflow.";
    case "audio":
      return "Upload an audio clip that this workflow should read.";
    case "video":
      return "Upload a video asset that this workflow should inspect.";
    default:
      return "Upload a file to seed this workflow.";
  }
}

function isTextLikeUploadedFile(file: File) {
  const normalizedMimeType = file.type.toLowerCase().trim();
  if (normalizedMimeType.startsWith("text/")) {
    return true;
  }
  if (
    normalizedMimeType === "application/json" ||
    normalizedMimeType === "application/xml" ||
    normalizedMimeType === "application/javascript" ||
    normalizedMimeType === "application/x-javascript" ||
    normalizedMimeType === "application/x-ndjson" ||
    normalizedMimeType.endsWith("+json") ||
    normalizedMimeType.endsWith("+xml")
  ) {
    return true;
  }

  return /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|xml|html|htm|css|js|jsx|ts|tsx|py|java|c|cc|cpp|h|hpp|cs|go|rs|rb|php|sh|bash|zsh|fish|bat|cmd|ps1|sql|log|ini|toml|env|gitignore)$/i.test(
    file.name,
  );
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

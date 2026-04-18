export type UploadedAssetType = "image" | "audio" | "video" | "file";

export type UploadedAssetEnvelope = {
  kind: "uploaded_file";
  name: string;
  mimeType: string;
  size: number;
  detectedType: UploadedAssetType;
  content: string;
  encoding: "text" | "data_url";
};

export function isUploadedAssetStateType(stateType: string): stateType is UploadedAssetType {
  return stateType === "image" || stateType === "audio" || stateType === "video" || stateType === "file";
}

export function detectUploadedAssetTypeFromFileName(fileName: string): UploadedAssetType {
  const normalized = fileName.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(normalized)) {
    return "image";
  }
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(normalized)) {
    return "audio";
  }
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(normalized)) {
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
  if (
    candidate.kind !== "uploaded_file" ||
    typeof candidate.name !== "string" ||
    typeof candidate.mimeType !== "string" ||
    typeof candidate.size !== "number" ||
    !Number.isFinite(candidate.size) ||
    !isUploadedAssetStateType(detectedType) ||
    typeof candidate.content !== "string" ||
    (encoding !== "text" && encoding !== "data_url")
  ) {
    return null;
  }

  return {
    kind: "uploaded_file",
    name: candidate.name,
    mimeType: candidate.mimeType,
    size: candidate.size,
    detectedType,
    content: candidate.content,
    encoding,
  };
}

export async function createUploadedAssetEnvelope(file: File): Promise<UploadedAssetEnvelope> {
  const detectedType = detectUploadedAssetTypeFromFileName(file.name);
  const encoding = detectedType === "file" ? "text" : "data_url";

  return {
    kind: "uploaded_file",
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    detectedType,
    content: encoding === "text" ? await file.text() : await fileToDataUrl(file),
    encoding,
  };
}

export function resolveUploadedAssetInputAccept(assetType: UploadedAssetType | null) {
  switch (assetType) {
    case "image":
      return "image/*";
    case "audio":
      return "audio/*";
    case "video":
      return "video/*";
    default:
      return "";
  }
}

async function fileToDataUrl(file: File) {
  const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  return `data:${file.type || "application/octet-stream"};base64,${base64}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

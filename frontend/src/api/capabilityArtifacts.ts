import { apiGet, apiPostForm } from "./http.ts";

export type CapabilityArtifactContent = {
  path: string;
  name: string;
  size: number;
  content_type: string;
  content: string;
};

export type CapabilityArtifactUpload = {
  local_path: string;
  filename: string;
  content_type: string;
  size: number;
};

export async function fetchCapabilityArtifactContent(path: string): Promise<CapabilityArtifactContent> {
  const searchParams = new URLSearchParams({ path });
  return apiGet<CapabilityArtifactContent>(`/api/capability-artifacts/content?${searchParams.toString()}`);
}

export function buildCapabilityArtifactFileUrl(path: string): string {
  const searchParams = new URLSearchParams({ path });
  return `/api/capability-artifacts/file?${searchParams.toString()}`;
}

export async function uploadCapabilityArtifactFile(file: File): Promise<CapabilityArtifactUpload> {
  const payload = new FormData();
  payload.append("file", file);
  return apiPostForm<CapabilityArtifactUpload>("/api/capability-artifacts/uploads", payload);
}

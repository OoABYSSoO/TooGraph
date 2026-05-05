import { apiGet, apiPostForm } from "./http.ts";

export type SkillArtifactContent = {
  path: string;
  name: string;
  size: number;
  content_type: string;
  content: string;
};

export type SkillArtifactUpload = {
  local_path: string;
  filename: string;
  content_type: string;
  size: number;
};

export async function fetchSkillArtifactContent(path: string): Promise<SkillArtifactContent> {
  const searchParams = new URLSearchParams({ path });
  return apiGet<SkillArtifactContent>(`/api/skill-artifacts/content?${searchParams.toString()}`);
}

export function buildSkillArtifactFileUrl(path: string): string {
  const searchParams = new URLSearchParams({ path });
  return `/api/skill-artifacts/file?${searchParams.toString()}`;
}

export async function uploadSkillArtifactFile(file: File): Promise<SkillArtifactUpload> {
  const payload = new FormData();
  payload.append("file", file);
  return apiPostForm<SkillArtifactUpload>("/api/skill-artifacts/uploads", payload);
}

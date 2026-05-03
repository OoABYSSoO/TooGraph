import { apiGet } from "./http.ts";

export type SkillArtifactContent = {
  path: string;
  name: string;
  size: number;
  content_type: string;
  content: string;
};

export async function fetchSkillArtifactContent(path: string): Promise<SkillArtifactContent> {
  const searchParams = new URLSearchParams({ path });
  return apiGet<SkillArtifactContent>(`/api/skill-artifacts/content?${searchParams.toString()}`);
}

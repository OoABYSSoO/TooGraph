import type { KnowledgeBaseRecord } from "@/types/knowledge";

import { apiGet } from "./http.ts";

export async function fetchKnowledgeBases(): Promise<KnowledgeBaseRecord[]> {
  return apiGet<KnowledgeBaseRecord[]>("/api/knowledge/bases");
}

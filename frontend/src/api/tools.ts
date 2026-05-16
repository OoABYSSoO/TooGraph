import type { ToolDefinition } from "@/types/tools";

import { apiGet } from "./http.ts";

export async function fetchToolCatalog(options: { includeDisabled?: boolean } = {}): Promise<ToolDefinition[]> {
  const includeDisabled = options.includeDisabled ?? true;
  return apiGet<ToolDefinition[]>(`/api/tools/catalog?include_disabled=${includeDisabled ? "true" : "false"}`);
}

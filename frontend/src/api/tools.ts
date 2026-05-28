import type { ToolDefinition, ToolFileContentResponse, ToolFileTreeResponse } from "@/types/tools";

import { apiDelete, apiGet, apiPost, apiPostForm } from "./http.ts";

export async function fetchToolCatalog(options: { includeDisabled?: boolean } = {}): Promise<ToolDefinition[]> {
  const includeDisabled = options.includeDisabled ?? true;
  return apiGet<ToolDefinition[]>(`/api/tools/catalog?include_disabled=${includeDisabled ? "true" : "false"}`);
}

export async function fetchToolFiles(toolKey: string): Promise<ToolFileTreeResponse> {
  return apiGet<ToolFileTreeResponse>(`/api/tools/${toolKey}/files`);
}

export async function fetchToolFileContent(toolKey: string, path: string): Promise<ToolFileContentResponse> {
  return apiGet<ToolFileContentResponse>(`/api/tools/${toolKey}/files/content?path=${encodeURIComponent(path)}`);
}

export async function importToolUpload(files: File[], relativePaths: string[] = []): Promise<ToolDefinition> {
  const payload = new FormData();
  files.forEach((file) => {
    payload.append("files", file);
  });
  relativePaths.forEach((relativePath) => {
    payload.append("relativePaths", relativePath);
  });
  return apiPostForm<ToolDefinition>("/api/tools/imports/upload", payload);
}

export async function updateToolStatus(toolKey: string, status: ToolDefinition["status"]): Promise<ToolDefinition> {
  const action = status === "active" ? "enable" : "disable";
  return apiPost<ToolDefinition>(`/api/tools/${toolKey}/${action}`, null);
}

export async function deleteTool(toolKey: string): Promise<{ toolKey: string; status: "deleted" }> {
  return apiDelete<{ toolKey: string; status: "deleted" }>(`/api/tools/${toolKey}`);
}

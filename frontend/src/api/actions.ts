import type { ActionDefinition, ActionFileContentResponse, ActionFileTreeResponse } from "@/types/actions";

import { apiDelete, apiGet, apiPost, apiPostForm } from "./http.ts";

export async function fetchActionDefinitions(): Promise<ActionDefinition[]> {
  return apiGet<ActionDefinition[]>("/api/actions/definitions");
}

export async function fetchActionCatalog(options: { includeDisabled?: boolean } = {}): Promise<ActionDefinition[]> {
  const includeDisabled = options.includeDisabled ?? true;
  return apiGet<ActionDefinition[]>(`/api/actions/catalog?include_disabled=${includeDisabled ? "true" : "false"}`);
}

export async function fetchActionFiles(actionKey: string): Promise<ActionFileTreeResponse> {
  return apiGet<ActionFileTreeResponse>(`/api/actions/${actionKey}/files`);
}

export async function fetchActionFileContent(actionKey: string, path: string): Promise<ActionFileContentResponse> {
  return apiGet<ActionFileContentResponse>(`/api/actions/${actionKey}/files/content?path=${encodeURIComponent(path)}`);
}

export async function importActionUpload(files: File[], relativePaths: string[] = []): Promise<ActionDefinition> {
  const payload = new FormData();
  files.forEach((file) => {
    payload.append("files", file);
  });
  relativePaths.forEach((relativePath) => {
    payload.append("relativePaths", relativePath);
  });
  return apiPostForm<ActionDefinition>("/api/actions/imports/upload", payload);
}

export async function updateActionStatus(actionKey: string, status: ActionDefinition["status"]): Promise<ActionDefinition> {
  const action = status === "active" ? "enable" : "disable";
  return apiPost<ActionDefinition>(`/api/actions/${actionKey}/${action}`, null);
}

export async function deleteAction(actionKey: string): Promise<{ actionKey: string; status: "deleted" }> {
  return apiDelete<{ actionKey: string; status: "deleted" }>(`/api/actions/${actionKey}`);
}

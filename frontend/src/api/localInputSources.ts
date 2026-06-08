import { apiGet, apiPost } from "./http.ts";

export type LocalFolderTreeEntry = {
  path: string;
  name: string;
  type: "file" | "directory";
  size: number;
  modified_at: string;
  content_type: string;
  text_like: boolean;
};

export type LocalFolderTree = {
  kind: "local_folder_tree";
  root: string;
  entries: LocalFolderTreeEntry[];
};

export type LocalDirectoryEntry = {
  name: string;
  path: string;
  relative_path: string;
  kind: "file" | "directory";
  type?: "file" | "directory";
  size: number | null;
  modified_at: string;
  content_type: string;
  text_like: boolean;
  selectable: boolean;
};

export type LocalDirectoryBreadcrumb = {
  label: string;
  path: string;
};

export type LocalDirectoryEntries = {
  kind: "local_directory_entries";
  path: string;
  parent: string;
  breadcrumbs: LocalDirectoryBreadcrumb[];
  entries: LocalDirectoryEntry[];
  denied: boolean;
  truncated: boolean;
};

export type LocalWorkspace = {
  workspace_id: string;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string;
};

export type LocalWorkspaceList = {
  workspaces: LocalWorkspace[];
  current_workspace_id: string;
};

export async function fetchLocalFolderTree(path: string): Promise<LocalFolderTree> {
  const searchParams = new URLSearchParams({ path });
  return apiGet<LocalFolderTree>(`/api/local-input-sources/folder?${searchParams.toString()}`);
}

export async function fetchLocalDirectoryEntries(path: string, workspaceId = ""): Promise<LocalDirectoryEntries> {
  const searchParams = new URLSearchParams({ path });
  if (workspaceId) {
    searchParams.set("workspace_id", workspaceId);
  }
  return apiGet<LocalDirectoryEntries>(`/api/local-input-sources/entries?${searchParams.toString()}`);
}

export async function fetchLocalPickerDirectoryEntries(path = ""): Promise<LocalDirectoryEntries> {
  const searchParams = new URLSearchParams();
  if (path) {
    searchParams.set("path", path);
  }
  const suffix = searchParams.toString();
  return apiGet<LocalDirectoryEntries>(`/api/local-input-sources/picker/entries${suffix ? `?${suffix}` : ""}`);
}

export async function fetchLocalWorkspaces(): Promise<LocalWorkspaceList> {
  return apiGet<LocalWorkspaceList>("/api/local-input-sources/workspaces");
}

export async function createLocalWorkspace(input: { root_path: string; name?: string }): Promise<LocalWorkspace> {
  return apiPost<LocalWorkspace>("/api/local-input-sources/workspaces", input);
}

export async function setCurrentLocalWorkspace(workspaceId: string): Promise<LocalWorkspace> {
  return apiPost<LocalWorkspace>("/api/local-input-sources/workspaces/current", { workspace_id: workspaceId });
}

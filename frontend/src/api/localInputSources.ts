import { apiGet } from "./http.ts";

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

export async function fetchLocalFolderTree(path: string): Promise<LocalFolderTree> {
  const searchParams = new URLSearchParams({ path });
  return apiGet<LocalFolderTree>(`/api/local-input-sources/folder?${searchParams.toString()}`);
}

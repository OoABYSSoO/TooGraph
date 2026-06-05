import type { LocalFolderTreeEntry } from "@/api/localInputSources";

export type LocalFolderInputValue = {
  kind: "local_folder";
  root: string;
  selection_mode: "all" | "selected";
  selected: string[];
};

export function createDefaultLocalFolderInputValue(): LocalFolderInputValue {
  return {
    kind: "local_folder",
    root: "",
    selection_mode: "all",
    selected: [],
  };
}

export function parseLocalFolderInputValue(value: unknown): LocalFolderInputValue {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!isRecord(parsed) || parsed.kind !== "local_folder") {
    return createDefaultLocalFolderInputValue();
  }
  const selected = normalizeSelectedPaths(parsed.selected);
  const selectionMode = parsed.selection_mode === "selected" || parsed.selectionMode === "selected"
    ? "selected"
    : parsed.selection_mode === "all" || parsed.selectionMode === "all"
      ? "all"
      : selected.length > 0
        ? "selected"
        : "all";
  return {
    kind: "local_folder",
    root: typeof parsed.root === "string" ? parsed.root : "",
    selection_mode: selectionMode,
    selected: selectionMode === "all" ? [] : selected,
  };
}

export function isLocalFolderInputValue(value: unknown): boolean {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  return isRecord(parsed) && parsed.kind === "local_folder";
}

export function updateLocalFolderRoot(value: LocalFolderInputValue, root: string): LocalFolderInputValue {
  return {
    kind: "local_folder",
    root,
    selection_mode: value.root === root ? value.selection_mode : "all",
    selected: value.root === root && value.selection_mode === "selected" ? value.selected : [],
  };
}

export function selectEntireLocalFolder(value: LocalFolderInputValue): LocalFolderInputValue {
  return {
    kind: "local_folder",
    root: value.root,
    selection_mode: "all",
    selected: [],
  };
}

export function toggleLocalFolderSelection(
  value: LocalFolderInputValue,
  path: string,
  selected: boolean,
): LocalFolderInputValue {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return value;
  }
  const selectedPaths = value.selected.filter((item) => item !== normalizedPath);
  return {
    kind: "local_folder",
    root: value.root,
    selection_mode: "selected",
    selected: selected ? [...selectedPaths, normalizedPath] : selectedPaths,
  };
}

export function replaceLocalFolderSelection(value: LocalFolderInputValue, selected: string[]): LocalFolderInputValue {
  const normalizedSelected = normalizeSelectedPaths(selected);
  return {
    kind: "local_folder",
    root: value.root,
    selection_mode: "selected",
    selected: normalizedSelected,
  };
}

export function listSelectableLocalFolderFilePaths(entries: LocalFolderTreeEntry[]): string[] {
  return entries.filter((entry) => entry.type === "file").map((entry) => entry.path);
}

export function formatLocalFolderSelectionSummary(input: {
  selectionMode: "all" | "selected";
  selected: string[];
  entries: LocalFolderTreeEntry[];
}) {
  if (input.selectionMode === "all") {
    const visibleFiles = input.entries.filter((entry) => entry.type === "file");
    const totalVisibleBytes = visibleFiles.reduce((sum, entry) => sum + entry.size, 0);
    return `Entire folder selected, ${visibleFiles.length} visible ${visibleFiles.length === 1 ? "file" : "files"}, ${formatBytes(totalVisibleBytes)} visible`;
  }
  const selected = new Set(input.selected);
  const totalBytes = input.entries
    .filter((entry) => entry.type === "file" && selected.has(entry.path))
    .reduce((sum, entry) => sum + entry.size, 0);
  return `${selected.size} ${selected.size === 1 ? "file" : "files"} selected, ${formatBytes(totalBytes)}`;
}

export function listLocalFolderPreviewEntries(entries: LocalFolderTreeEntry[], limit = 5): LocalFolderTreeEntry[] {
  return entries.slice(0, Math.max(0, limit));
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return unitIndex === 0 ? `${value} ${units[unitIndex]}` : `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function normalizeSelectedPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const path = item.trim().replace(/\\/g, "/");
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    selected.push(path);
  }
  return selected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

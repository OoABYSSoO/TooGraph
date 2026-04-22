const DEFAULT_EXPORT_FILE_NAME = "graphiteui_graph";

export function buildPythonExportFileName(graphName: string | null | undefined) {
  const normalizedName = (graphName ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  const baseName = normalizedName || DEFAULT_EXPORT_FILE_NAME;
  return baseName.endsWith(".py") ? baseName : `${baseName}.py`;
}

export function downloadPythonSource(source: string, fileName: string) {
  const blob = new Blob([source], {
    type: "text/x-python;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function isTooGraphPythonExportFile(file: File) {
  return file.name.toLowerCase().endsWith(".py");
}

export function isTooGraphPythonExportSource(source: string) {
  return source.includes("TOOGRAPH_EXPORT_VERSION = 1") && source.includes("TOOGRAPH_EDITOR_GRAPH");
}

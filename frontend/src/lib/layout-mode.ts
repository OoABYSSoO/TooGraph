export type ShellLayoutMode = "standard" | "editor-canvas";
export type PrimaryNavigationSection =
  | "home"
  | "editor"
  | "graphLibrary"
  | "companion"
  | "presets"
  | "skills"
  | "models"
  | "modelLogs"
  | "runs"
  | "settings";

export function resolveShellLayoutMode(pathname: string): ShellLayoutMode {
  if (pathname === "/editor") {
    return "editor-canvas";
  }
  if (pathname === "/editor/new") {
    return "editor-canvas";
  }
  if (/^\/editor\/[^/]+$/.test(pathname)) {
    return "editor-canvas";
  }
  return "standard";
}

export function resolvePrimaryNavigationSection(pathname: string): PrimaryNavigationSection | null {
  if (pathname === "/") {
    return "home";
  }
  if (pathname === "/editor" || pathname.startsWith("/editor/")) {
    return "editor";
  }
  if (pathname === "/library" || pathname.startsWith("/library/")) {
    return "graphLibrary";
  }
  if (pathname === "/companion" || pathname.startsWith("/companion/")) {
    return "companion";
  }
  if (pathname === "/presets" || pathname.startsWith("/presets/")) {
    return "presets";
  }
  if (pathname === "/skills" || pathname.startsWith("/skills/")) {
    return "skills";
  }
  if (pathname === "/models" || pathname.startsWith("/models/")) {
    return "models";
  }
  if (pathname === "/model-logs" || pathname.startsWith("/model-logs/")) {
    return "modelLogs";
  }
  if (pathname === "/runs" || pathname.startsWith("/runs/")) {
    return "runs";
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }
  return null;
}

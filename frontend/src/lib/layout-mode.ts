export type ShellLayoutMode = "standard" | "editor-canvas";
export type PrimaryNavigationSection =
  | "home"
  | "editor"
  | "graphLibrary"
  | "knowledge"
  | "scheduler"
  | "curatorReports"
  | "buddy"
  | "messagePlatforms"
  | "presets"
  | "actions"
  | "improvements"
  | "models"
  | "modelLogs"
  | "evidenceSearch"
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
  if (pathname === "/knowledge" || pathname.startsWith("/knowledge/")) {
    return "knowledge";
  }
  if (pathname === "/scheduler" || pathname.startsWith("/scheduler/")) {
    return "scheduler";
  }
  if (pathname === "/curator-reports" || pathname.startsWith("/curator-reports/")) {
    return "curatorReports";
  }
  if (pathname === "/buddy" || pathname.startsWith("/buddy/")) {
    return "buddy";
  }
  if (pathname === "/message-platforms" || pathname.startsWith("/message-platforms/")) {
    return "messagePlatforms";
  }
  if (pathname === "/presets" || pathname.startsWith("/presets/")) {
    return "presets";
  }
  if (pathname === "/actions" || pathname.startsWith("/actions/")) {
    return "actions";
  }
  if (pathname === "/improvements" || pathname.startsWith("/improvements/")) {
    return "improvements";
  }
  if (pathname === "/models" || pathname.startsWith("/models/")) {
    return "models";
  }
  if (pathname === "/model-logs" || pathname.startsWith("/model-logs/")) {
    return "modelLogs";
  }
  if (pathname === "/evidence" || pathname.startsWith("/evidence/")) {
    return "evidenceSearch";
  }
  if (pathname === "/runs" || pathname.startsWith("/runs/")) {
    return "runs";
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }
  return null;
}

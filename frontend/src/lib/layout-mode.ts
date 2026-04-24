export type ShellLayoutMode = "standard" | "editor-canvas";
export type PrimaryNavigationSection = "home" | "editor" | "runs" | "settings";

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
  if (pathname === "/runs" || pathname.startsWith("/runs/")) {
    return "runs";
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }
  return null;
}

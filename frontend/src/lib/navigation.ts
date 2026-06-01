import type { PrimaryNavigationSection } from "./layout-mode.ts";

export type NavigationVisibility = "stable" | "developer";

export type NavigationIconKey =
  | "Calendar"
  | "ChatDotRound"
  | "Clock"
  | "Collection"
  | "CollectionTag"
  | "Cpu"
  | "DocumentChecked"
  | "EditPen"
  | "House"
  | "Memo"
  | "MessageBox"
  | "Operation"
  | "Reading"
  | "Setting"
  | "ToolWrench"
  | "TrendCharts";

export type PrimaryNavigationItem = {
  path: string;
  section: PrimaryNavigationSection;
  labelKey: string;
  icon: NavigationIconKey;
  affordanceId: string;
  affordanceZone?: string;
  pathAfterClick?: string;
  selfSurface?: boolean;
  visibility: NavigationVisibility;
};

export const PRIMARY_NAVIGATION_ITEMS: PrimaryNavigationItem[] = [
  navigationItem("/", "home", "nav.home", "House"),
  navigationItem("/editor", "editor", "nav.editor", "EditPen"),
  navigationItem("/library", "graphLibrary", "nav.graphLibrary", "Collection", "library"),
  {
    ...navigationItem("/buddy", "buddy", "nav.buddy", "ChatDotRound"),
    affordanceZone: "buddy-page",
    pathAfterClick: "",
    selfSurface: true,
  },
  navigationItem("/runs", "runs", "nav.runs", "Clock"),
  navigationItem("/knowledge", "knowledge", "nav.knowledge", "Reading"),
  navigationItem("/scheduler", "scheduler", "nav.scheduler", "Calendar"),
  navigationItem("/message-platforms", "messagePlatforms", "nav.messagePlatforms", "MessageBox", "messagePlatforms"),
  navigationItem("/models", "models", "nav.models", "Cpu"),
  navigationItem("/model-logs", "modelLogs", "nav.modelLogs", "Memo", "modelLogs"),
  navigationItem("/actions", "actions", "nav.actions", "Operation"),
  navigationItem("/tools", "tools", "nav.tools", "ToolWrench"),
  navigationItem("/presets", "presets", "nav.presets", "CollectionTag"),
  navigationItem("/evidence", "evidenceSearch", "nav.evidenceSearch", "DocumentChecked", "evidenceSearch", "developer"),
  navigationItem("/settings", "settings", "nav.settings", "Setting"),
];

export function buildVisibleNavigationItems(developerModeEnabled: boolean): PrimaryNavigationItem[] {
  return PRIMARY_NAVIGATION_ITEMS.filter((item) => item.visibility !== "developer" || developerModeEnabled);
}

export function isDeveloperNavigationPath(pathname: string): boolean {
  return PRIMARY_NAVIGATION_ITEMS.some(
    (item) => item.visibility === "developer" && (pathname === item.path || pathname.startsWith(`${item.path}/`)),
  );
}

function navigationItem(
  path: string,
  section: PrimaryNavigationSection,
  labelKey: string,
  icon: NavigationIconKey,
  affordanceName: string = section,
  visibility: NavigationVisibility = "stable",
): PrimaryNavigationItem {
  return {
    path,
    section,
    labelKey,
    icon,
    affordanceId: `app.nav.${affordanceName}`,
    affordanceZone: "app-shell",
    pathAfterClick: path,
    visibility,
  };
}

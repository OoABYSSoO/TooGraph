export type PageAffordanceAction = "click" | "focus" | "clear" | "type" | "press" | "wait";
export type PageAffordanceRole = "navigation-link" | "tab" | "button" | "menuitem" | "textbox" | "combobox" | "unknown";

export type PageAffordanceInput = {
  kind: "text";
  maxLength: number | null;
  valuePreview: string;
};

export type PageAffordanceSafety = {
  selfSurface: boolean;
  requiresConfirmation: boolean;
  destructive: boolean;
};

export type PageAffordance = {
  id: string;
  label: string;
  role: PageAffordanceRole;
  zone: string;
  actions: PageAffordanceAction[];
  enabled: boolean;
  visible: boolean;
  current: boolean;
  pathAfterClick: string;
  input: PageAffordanceInput | null;
  safety: PageAffordanceSafety;
};

export type PageAffordanceInit = {
  id?: unknown;
  label?: unknown;
  role?: unknown;
  zone?: unknown;
  actions?: unknown;
  enabled?: unknown;
  visible?: unknown;
  current?: unknown;
  pathAfterClick?: unknown;
  safety?: Partial<PageAffordanceSafety> | null;
  input?: Partial<PageAffordanceInput> | null;
};

export type PageOperationSnapshot = {
  snapshotId: string;
  path: string;
  title: string;
  affordances: PageAffordance[];
};

export type PageOperationSnapshotInit = {
  snapshotId: string;
  path: string;
  title: string;
  affordances: PageAffordanceInit[];
};

export type PageOperationBook = {
  page: { path: string; title: string; snapshotId: string };
  allowedOperations: Array<{
    targetId: string;
    label: string;
    role: PageAffordanceRole;
    commands: string[];
    resultHint: { path: string } | null;
  }>;
  inputs: Array<{
    targetId: string;
    label: string;
    commands: string[];
    valuePreview: string;
    maxLength: number | null;
  }>;
  unavailable: Array<{ targetId: string; label: string; reason: string }>;
  forbidden: string[];
};

export function normalizePageAffordance(input: PageAffordanceInit): PageAffordance | null {
  const id = compactText(input.id);
  const label = compactText(input.label);
  if (!id || !label) {
    return null;
  }

  const actions = normalizeActions(input.actions);
  const safety = {
    selfSurface: input.safety?.selfSurface === true,
    requiresConfirmation: input.safety?.requiresConfirmation === true,
    destructive: input.safety?.destructive === true,
  };
  return {
    id,
    label,
    role: normalizeRole(input.role),
    zone: compactText(input.zone) || "page",
    actions: actions.length > 0 ? actions : ["click"],
    enabled: input.enabled !== false,
    visible: input.visible !== false,
    current: input.current === true,
    pathAfterClick: compactText(input.pathAfterClick),
    input: normalizeInput(input.input),
    safety,
  };
}

export function collectPageOperationSnapshot(input: {
  routePath: string;
  root: ParentNode | null;
  title?: string | null;
}): PageOperationSnapshot {
  const affordances: PageAffordance[] = [];
  const elements = input.root?.querySelectorAll?.<HTMLElement>("[data-virtual-affordance-id]") ?? [];
  for (const element of Array.from(elements)) {
    const affordance = normalizePageAffordance(readElementAffordance(element));
    if (affordance) {
      affordances.push(affordance);
    }
  }
  return {
    snapshotId: `page-snapshot-${Date.now().toString(36)}`,
    path: normalizeRoutePath(input.routePath),
    title: compactText(input.title) || readDocumentTitle(input.root),
    affordances,
  };
}

export function buildPageOperationBook(snapshot: PageOperationSnapshotInit | PageOperationSnapshot): PageOperationBook {
  const affordances = snapshot.affordances
    .map((affordance) => normalizePageAffordance(affordance))
    .filter((affordance): affordance is PageAffordance => affordance !== null);
  const allowedOperations: PageOperationBook["allowedOperations"] = [];
  const inputs: PageOperationBook["inputs"] = [];
  const unavailable: PageOperationBook["unavailable"] = [];

  for (const affordance of affordances) {
    const deniedReason = operationDeniedReason(affordance);
    if (deniedReason) {
      if (deniedReason === "disabled" || deniedReason === "hidden") {
        unavailable.push({ targetId: affordance.id, label: affordance.label, reason: deniedReason });
      }
      continue;
    }

    if (affordance.input && affordance.actions.includes("type")) {
      inputs.push({
        targetId: affordance.id,
        label: affordance.label,
        commands: buildInputCommands(affordance),
        valuePreview: affordance.input.valuePreview,
        maxLength: affordance.input.maxLength,
      });
      continue;
    }

    allowedOperations.push({
      targetId: affordance.id,
      label: affordance.label,
      role: affordance.role,
      commands: buildOperationCommands(affordance),
      resultHint: affordance.pathAfterClick ? { path: affordance.pathAfterClick } : null,
    });
  }

  return {
    page: {
      path: normalizeRoutePath(snapshot.path),
      title: compactText(snapshot.title),
      snapshotId: compactText(snapshot.snapshotId),
    },
    allowedOperations,
    inputs,
    unavailable,
    forbidden: ["伙伴页面、伙伴浮窗、伙伴形象、伙伴调试入口不可由伙伴自己操作。"],
  };
}

export function formatPageOperationBookLines(book: PageOperationBook | null | undefined): string[] {
  if (!book) {
    return [
      "页面操作书:",
      "- 当前页面没有可操作目标。",
      "- forbidden: 伙伴页面、伙伴浮窗、伙伴形象、伙伴调试面板和 Buddy 导航目标不可由伙伴自己操作。",
    ];
  }
  const lines = [
    "页面操作书:",
    `- page: ${book.page.title || "当前页面"} (${book.page.path || "/"}, snapshot: ${book.page.snapshotId || "unknown"})`,
  ];
  for (const operation of book.allowedOperations) {
    lines.push(
      `- ${operation.targetId}: ${operation.label}; role: ${operation.role}; commands: ${operation.commands.join(", ")}${
        operation.resultHint?.path ? `; result path: ${operation.resultHint.path}` : ""
      }.`,
    );
  }
  for (const input of book.inputs) {
    lines.push(
      `- ${input.targetId}: ${input.label}; input; commands: ${input.commands.join(", ")}; current value: ${input.valuePreview || "empty"}.`,
    );
  }
  for (const item of book.unavailable) {
    lines.push(`- unavailable ${item.targetId}: ${item.label}; reason: ${item.reason}.`);
  }
  for (const item of book.forbidden) {
    lines.push(`- forbidden: ${item}`);
  }
  return lines;
}

function readElementAffordance(element: HTMLElement): PageAffordanceInit {
  const actions = readDataValue(element, "virtualAffordanceActions");
  const inputKind = readDataValue(element, "virtualAffordanceInputKind");
  const inputValue = isTextInputElement(element) ? element.value : "";
  const maxLength = isTextInputElement(element) && element.maxLength > 0 ? element.maxLength : null;
  return {
    id: readDataValue(element, "virtualAffordanceId"),
    label:
      readDataValue(element, "virtualAffordanceLabel")
      || element.getAttribute("aria-label")
      || element.getAttribute("title")
      || element.textContent
      || "",
    role: readDataValue(element, "virtualAffordanceRole") || element.getAttribute("role") || inferRole(element),
    zone: readDataValue(element, "virtualAffordanceZone"),
    actions: actions ? actions.split(",") : [],
    enabled: !isElementDisabled(element),
    visible: isElementVisible(element),
    current: element.getAttribute("aria-current") === "page" || element.dataset.virtualAffordanceCurrent === "true",
    pathAfterClick: readDataValue(element, "virtualAffordancePathAfterClick"),
    input:
      inputKind || isTextInputElement(element)
        ? {
            kind: "text",
            maxLength,
            valuePreview: readDataValue(element, "virtualAffordanceValuePreview") || inputValue,
          }
        : null,
    safety: {
      selfSurface: readBooleanData(element, "virtualAffordanceSelfSurface"),
      requiresConfirmation: readBooleanData(element, "virtualAffordanceRequiresConfirmation"),
      destructive: readBooleanData(element, "virtualAffordanceDestructive"),
    },
  };
}

function normalizeActions(value: unknown): PageAffordanceAction[] {
  const values = Array.isArray(value) ? value : compactText(value).split(",");
  const allowed = new Set<PageAffordanceAction>(["click", "focus", "clear", "type", "press", "wait"]);
  const actions: PageAffordanceAction[] = [];
  for (const item of values) {
    const action = compactText(item).toLowerCase() as PageAffordanceAction;
    if (allowed.has(action) && !actions.includes(action)) {
      actions.push(action);
    }
  }
  return actions;
}

function normalizeRole(value: unknown): PageAffordanceRole {
  const role = compactText(value).toLowerCase();
  if (
    role === "navigation-link"
    || role === "tab"
    || role === "button"
    || role === "menuitem"
    || role === "textbox"
    || role === "combobox"
  ) {
    return role;
  }
  return "unknown";
}

function normalizeInput(value: PageAffordanceInit["input"]): PageAffordanceInput | null {
  if (!value) {
    return null;
  }
  return {
    kind: "text",
    maxLength: typeof value.maxLength === "number" && Number.isFinite(value.maxLength) ? value.maxLength : null,
    valuePreview: compactText(value.valuePreview),
  };
}

function operationDeniedReason(affordance: PageAffordance): string {
  if (affordance.safety.selfSurface || affordance.id.startsWith("buddy.") || affordance.id === "app.nav.buddy") {
    return "self_surface";
  }
  if (!affordance.visible) {
    return "hidden";
  }
  if (!affordance.enabled) {
    return "disabled";
  }
  if (affordance.safety.destructive) {
    return "destructive";
  }
  if (affordance.safety.requiresConfirmation) {
    return "requires_confirmation";
  }
  return "";
}

function buildOperationCommands(affordance: PageAffordance): string[] {
  return affordance.actions.map((action) => `${action} ${affordance.id}`);
}

function buildInputCommands(affordance: PageAffordance): string[] {
  return affordance.actions.map((action) => {
    if (action === "type") {
      return `type ${affordance.id} <text>`;
    }
    if (action === "press") {
      return `press ${affordance.id} <key>`;
    }
    return `${action} ${affordance.id}`;
  });
}

function inferRole(element: HTMLElement): PageAffordanceRole {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea") {
    return "textbox";
  }
  if (tagName === "button") {
    return "button";
  }
  if (tagName === "a") {
    return "navigation-link";
  }
  return "unknown";
}

function isElementDisabled(element: HTMLElement): boolean {
  return element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
}

function isElementVisible(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
    return true;
  }
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function isTextInputElement(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

function readDataValue(element: HTMLElement, key: string): string {
  return compactText(element.dataset[key]);
}

function readBooleanData(element: HTMLElement, key: string): boolean {
  const value = readDataValue(element, key).toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function readDocumentTitle(root: ParentNode | null): string {
  const ownerDocument = root && "ownerDocument" in root ? root.ownerDocument : null;
  return compactText(ownerDocument?.title) || "当前页面";
}

function normalizeRoutePath(routePath: string): string {
  return (routePath || "/").split(/[?#]/, 1)[0] || "/";
}

function compactText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

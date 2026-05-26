export type CanvasKeyboardShortcut = "copy" | "paste" | "undo" | "redo" | "delete-selection";

export type CanvasKeyboardShortcutEvent = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target: EventTarget | null;
  isComposing?: boolean;
};

export function isEditableKeyboardEventTarget(target: EventTarget | null) {
  if (!target || typeof target !== "object") {
    return false;
  }

  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  };
  const tagName = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  if (element.isContentEditable) {
    return true;
  }

  return Boolean(
    element.closest?.(
      [
        "[contenteditable='true']",
        "[contenteditable='']",
        "[role='textbox']",
        ".el-input",
        ".el-textarea",
        ".el-select",
      ].join(", "),
    ),
  );
}

export function resolveCanvasKeyboardShortcut(event: CanvasKeyboardShortcutEvent): CanvasKeyboardShortcut | null {
  if (event.isComposing || isEditableKeyboardEventTarget(event.target)) {
    return null;
  }

  const key = event.key.toLowerCase();
  const hasCommandModifier = Boolean(event.ctrlKey || event.metaKey);
  if (!hasCommandModifier) {
    return event.key === "Delete" || event.key === "Backspace" ? "delete-selection" : null;
  }

  if (key === "c") {
    return "copy";
  }
  if (key === "v") {
    return "paste";
  }
  if (key === "z") {
    return event.shiftKey ? "redo" : "undo";
  }
  if (key === "y") {
    return "redo";
  }

  return null;
}

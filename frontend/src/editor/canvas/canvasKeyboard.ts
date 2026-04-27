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

import { ref } from "vue";

export type NodeTopAction = "advanced" | "delete" | "preset";

export type NodeFloatingPanelCloseOptions = {
  commitTextEditor?: boolean;
};

export type NodeFloatingPanelTimeoutScheduler = {
  setTimeout: (callback: () => void, delay?: number) => unknown;
  clearTimeout: (timeoutId: unknown) => void;
};

export type NodeFloatingPanelDocumentTarget = {
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

export type UseNodeFloatingPanelsOptions = {
  isFloatingPanelOpen: () => boolean;
  closeFloatingPanels: (options?: NodeFloatingPanelCloseOptions) => void;
  documentTarget?: NodeFloatingPanelDocumentTarget;
  timeoutScheduler?: NodeFloatingPanelTimeoutScheduler;
};

const floatingPanelSurfaceSelector = [
  "[data-top-action-surface='true']",
  "[data-state-editor-trigger='true']",
  "[data-text-editor-trigger='true']",
  "[data-node-popup-surface='true']",
  ".node-card__top-popover",
  ".node-card__text-editor",
  ".node-card__state-editor",
  ".node-card__confirm-hint",
  ".node-card__action-popover",
  ".node-card__confirm-popover",
  ".node-card__text-editor-popper",
  ".node-card__state-editor-popper",
  ".node-card__agent-add-popover-popper",
  ".node-card__port-picker-select-popper",
  ".node-card__agent-model-popper",
].join(", ");

const defaultTimeoutScheduler: NodeFloatingPanelTimeoutScheduler = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (timeoutId) => globalThis.clearTimeout(timeoutId as ReturnType<typeof globalThis.setTimeout>),
};

export function useNodeFloatingPanels(options: UseNodeFloatingPanelsOptions) {
  const timeoutScheduler = options.timeoutScheduler ?? defaultTimeoutScheduler;
  const documentTarget = options.documentTarget ?? (typeof document !== "undefined" ? document : null);
  const activeTopAction = ref<NodeTopAction | null>(null);
  const activeStateEditorConfirmAnchorId = ref<string | null>(null);
  const activeRemovePortStateConfirmAnchorId = ref<string | null>(null);
  const topActionTimeoutRef = ref<unknown | null>(null);
  const stateEditorConfirmTimeoutRef = ref<unknown | null>(null);
  const removePortStateConfirmTimeoutRef = ref<unknown | null>(null);

  function isFloatingPanelSurfaceTarget(target: EventTarget | null) {
    if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(target.closest(floatingPanelSurfaceSelector));
  }

  function handleGlobalFloatingPanelPointerDown(event: PointerEvent) {
    if (!options.isFloatingPanelOpen() || isFloatingPanelSurfaceTarget(event.target)) {
      return;
    }
    options.closeFloatingPanels({ commitTextEditor: true });
  }

  function handleGlobalFloatingPanelFocusIn(event: FocusEvent) {
    if (!options.isFloatingPanelOpen() || isFloatingPanelSurfaceTarget(event.target)) {
      return;
    }
    options.closeFloatingPanels({ commitTextEditor: true });
  }

  function handleGlobalFloatingPanelKeyDown(event: KeyboardEvent) {
    if (!options.isFloatingPanelOpen() || event.key !== "Escape") {
      return;
    }
    options.closeFloatingPanels({ commitTextEditor: false });
  }

  function addGlobalFloatingPanelListeners() {
    documentTarget?.addEventListener("pointerdown", handleGlobalFloatingPanelPointerDown as EventListener);
    documentTarget?.addEventListener("focusin", handleGlobalFloatingPanelFocusIn as EventListener);
    documentTarget?.addEventListener("keydown", handleGlobalFloatingPanelKeyDown as EventListener);
  }

  function removeGlobalFloatingPanelListeners() {
    documentTarget?.removeEventListener("pointerdown", handleGlobalFloatingPanelPointerDown as EventListener);
    documentTarget?.removeEventListener("focusin", handleGlobalFloatingPanelFocusIn as EventListener);
    documentTarget?.removeEventListener("keydown", handleGlobalFloatingPanelKeyDown as EventListener);
  }

  function clearTopActionTimeout() {
    if (topActionTimeoutRef.value !== null) {
      timeoutScheduler.clearTimeout(topActionTimeoutRef.value);
      topActionTimeoutRef.value = null;
    }
  }

  function clearTopActionConfirmState() {
    clearTopActionTimeout();
    if (activeTopAction.value === "delete" || activeTopAction.value === "preset") {
      activeTopAction.value = null;
    }
  }

  function clearStateEditorConfirmTimeout() {
    if (stateEditorConfirmTimeoutRef.value !== null) {
      timeoutScheduler.clearTimeout(stateEditorConfirmTimeoutRef.value);
      stateEditorConfirmTimeoutRef.value = null;
    }
  }

  function clearStateEditorConfirmState() {
    clearStateEditorConfirmTimeout();
    activeStateEditorConfirmAnchorId.value = null;
  }

  function clearRemovePortStateConfirmTimeout() {
    if (removePortStateConfirmTimeoutRef.value !== null) {
      timeoutScheduler.clearTimeout(removePortStateConfirmTimeoutRef.value);
      removePortStateConfirmTimeoutRef.value = null;
    }
  }

  function clearRemovePortStateConfirmState() {
    clearRemovePortStateConfirmTimeout();
    activeRemovePortStateConfirmAnchorId.value = null;
  }

  function startTopActionConfirmWindow(action: "delete" | "preset") {
    clearTopActionTimeout();
    activeTopAction.value = action;
    topActionTimeoutRef.value = timeoutScheduler.setTimeout(() => {
      topActionTimeoutRef.value = null;
      if (activeTopAction.value === action) {
        activeTopAction.value = null;
      }
    }, 2000);
  }

  function startStateEditorConfirmWindow(anchorId: string) {
    clearStateEditorConfirmTimeout();
    activeStateEditorConfirmAnchorId.value = anchorId;
    stateEditorConfirmTimeoutRef.value = timeoutScheduler.setTimeout(() => {
      stateEditorConfirmTimeoutRef.value = null;
      if (activeStateEditorConfirmAnchorId.value === anchorId) {
        activeStateEditorConfirmAnchorId.value = null;
      }
    }, 2000);
  }

  function startRemovePortStateConfirmWindow(anchorId: string) {
    clearRemovePortStateConfirmTimeout();
    activeRemovePortStateConfirmAnchorId.value = anchorId;
    removePortStateConfirmTimeoutRef.value = timeoutScheduler.setTimeout(() => {
      removePortStateConfirmTimeoutRef.value = null;
      if (activeRemovePortStateConfirmAnchorId.value === anchorId) {
        activeRemovePortStateConfirmAnchorId.value = null;
      }
    }, 2000);
  }

  function isStateEditorConfirmOpen(anchorId: string) {
    return activeStateEditorConfirmAnchorId.value === anchorId;
  }

  function isRemovePortStateConfirmOpen(anchorId: string) {
    return activeRemovePortStateConfirmAnchorId.value === anchorId;
  }

  return {
    activeRemovePortStateConfirmAnchorId,
    activeStateEditorConfirmAnchorId,
    activeTopAction,
    addGlobalFloatingPanelListeners,
    clearRemovePortStateConfirmState,
    clearRemovePortStateConfirmTimeout,
    clearStateEditorConfirmState,
    clearStateEditorConfirmTimeout,
    clearTopActionConfirmState,
    clearTopActionTimeout,
    handleGlobalFloatingPanelFocusIn,
    handleGlobalFloatingPanelKeyDown,
    handleGlobalFloatingPanelPointerDown,
    isRemovePortStateConfirmOpen,
    isStateEditorConfirmOpen,
    isFloatingPanelSurfaceTarget,
    removeGlobalFloatingPanelListeners,
    startRemovePortStateConfirmWindow,
    startStateEditorConfirmWindow,
    startTopActionConfirmWindow,
  };
}

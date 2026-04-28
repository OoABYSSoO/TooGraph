import { computed, ref } from "vue";

import {
  PORT_REORDER_DRAG_THRESHOLD,
  buildPortReorderFloatingStyle,
  buildPortReorderPreviewPorts,
  buildPortReorderSelector,
  isPortReorderPlaceholderState,
  isPortReorderingState,
  resolvePortReorderInitialTargetIndex,
  resolvePortReorderSourceRectFromElement,
  resolvePortReorderTargetIndexFromElements,
  type PortReorderPointerState,
  type PortReorderRect,
  type PortReorderSide,
  type PortReorderPortLike,
} from "./portReorderModel.ts";

export type PortReorderVisualPort = PortReorderPortLike & {
  stateColor: string;
};

export type PortReorderPayload = {
  nodeId: string;
  side: PortReorderSide;
  stateKey: string;
  targetIndex: number;
};

export type PortReorderDocumentTarget = {
  querySelectorAll: (selector: string) => unknown;
};

export type PortReorderWindowTarget = {
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  setTimeout: (callback: () => void, delay?: number) => unknown;
};

export type UsePortReorderOptions<TPort extends PortReorderVisualPort> = {
  getNodeId: () => string;
  getPorts: (side: PortReorderSide) => TPort[];
  guardLockedInteraction: () => boolean;
  onActivateReorder: () => void;
  onPortPillClick: (anchorId: string, stateKey: string | null | undefined) => void;
  onReorder: (payload: PortReorderPayload) => void;
  documentTarget?: PortReorderDocumentTarget;
  windowTarget?: PortReorderWindowTarget;
};

type PortReorderTargetElement = {
  dataset: {
    portReorderStateKey?: string;
  };
  getBoundingClientRect: () => {
    top: number;
    height: number;
  };
};

type PortReorderSourceElement = EventTarget & {
  getBoundingClientRect: () => PortReorderRect;
};

export function usePortReorder<TPort extends PortReorderVisualPort>(options: UsePortReorderOptions<TPort>) {
  const documentTarget = options.documentTarget ?? (typeof document !== "undefined" ? document : null);
  const windowTarget = options.windowTarget ?? (typeof window !== "undefined" ? window : null);
  const portReorderPointerState = ref<PortReorderPointerState | null>(null);
  const suppressNextPortPillClick = ref(false);

  const orderedInputPorts = computed(() =>
    buildPortReorderPreviewPorts("input", options.getPorts("input"), portReorderPointerState.value),
  );
  const orderedOutputPorts = computed(() =>
    buildPortReorderPreviewPorts("output", options.getPorts("output"), portReorderPointerState.value),
  );
  const portReorderFloatingPort = computed<{ side: PortReorderSide; port: TPort } | null>(() => {
    const pointerState = portReorderPointerState.value;
    if (!pointerState?.active) {
      return null;
    }

    const port = options.getPorts(pointerState.side).find((candidate) => candidate.key === pointerState.stateKey);
    return port ? { side: pointerState.side, port } : null;
  });
  const portReorderFloatingStyle = computed(() => {
    const pointerState = portReorderPointerState.value;
    const floatingPort = portReorderFloatingPort.value;
    if (!pointerState || !floatingPort) {
      return {};
    }

    return buildPortReorderFloatingStyle(pointerState, floatingPort.port.stateColor);
  });

  function clearPortReorderPointerState() {
    windowTarget?.removeEventListener("pointermove", handlePortReorderPointerMove as EventListener);
    windowTarget?.removeEventListener("pointerup", handlePortReorderPointerUp as EventListener);
    windowTarget?.removeEventListener("pointercancel", handlePortReorderPointerAbort as EventListener);
    portReorderPointerState.value = null;
  }

  function suppressNextPortPillClickOnce() {
    suppressNextPortPillClick.value = true;
    if (windowTarget) {
      windowTarget.setTimeout(() => {
        suppressNextPortPillClick.value = false;
      }, 250);
    } else {
      globalThis.setTimeout(() => {
        suppressNextPortPillClick.value = false;
      }, 250);
    }
  }

  function isPortReordering(side: PortReorderSide, stateKey: string) {
    return isPortReorderingState(portReorderPointerState.value, side, stateKey);
  }

  function isPortReorderPlaceholder(side: PortReorderSide, stateKey: string) {
    return isPortReorderPlaceholderState(portReorderPointerState.value, side, stateKey);
  }

  function resolvePortReorderTargetIndex(side: PortReorderSide, clientY: number) {
    const pointerState = portReorderPointerState.value;
    if (!pointerState || pointerState.side !== side || !documentTarget) {
      return null;
    }

    const queryResult = documentTarget.querySelectorAll(buildPortReorderSelector(options.getNodeId(), side));
    const targetElements = Array.from(
      queryResult as ArrayLike<PortReorderTargetElement> | Iterable<PortReorderTargetElement>,
    );
    return resolvePortReorderTargetIndexFromElements(targetElements, pointerState.stateKey, clientY);
  }

  function resolveInitialTargetIndex(side: PortReorderSide, stateKey: string) {
    return resolvePortReorderInitialTargetIndex(options.getPorts(side), stateKey);
  }

  function resolveSourceRect(event: PointerEvent): PortReorderRect | null {
    if (!isPortReorderSourceElement(event.currentTarget)) {
      return null;
    }

    return resolvePortReorderSourceRectFromElement(event.currentTarget);
  }

  function handlePortReorderPointerDown(side: PortReorderSide, stateKey: string, event: PointerEvent) {
    if (event.button !== 0 || options.guardLockedInteraction()) {
      return;
    }
    const sourceRect = resolveSourceRect(event);
    const targetIndex = resolveInitialTargetIndex(side, stateKey);
    if (!sourceRect || targetIndex === null) {
      return;
    }

    clearPortReorderPointerState();
    portReorderPointerState.value = {
      side,
      stateKey,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      pointerOffsetY: event.clientY - sourceRect.top,
      sourceRect,
      active: false,
      targetIndex,
    };
    windowTarget?.addEventListener("pointermove", handlePortReorderPointerMove as EventListener);
    windowTarget?.addEventListener("pointerup", handlePortReorderPointerUp as EventListener);
    windowTarget?.addEventListener("pointercancel", handlePortReorderPointerAbort as EventListener);
  }

  function handlePortReorderPointerMove(event: PointerEvent) {
    const pointerState = portReorderPointerState.value;
    if (!pointerState || pointerState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - pointerState.startClientX;
    const deltaY = event.clientY - pointerState.startClientY;
    const shouldActivate =
      pointerState.active || Math.hypot(deltaX, deltaY) >= PORT_REORDER_DRAG_THRESHOLD;
    if (!shouldActivate) {
      return;
    }

    event.preventDefault();
    if (!pointerState.active) {
      options.onActivateReorder();
    }

    portReorderPointerState.value = {
      ...pointerState,
      active: true,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      targetIndex: resolvePortReorderTargetIndex(pointerState.side, event.clientY) ?? pointerState.targetIndex,
    };
  }

  function handlePortReorderPointerUp(event: PointerEvent) {
    const pointerState = portReorderPointerState.value;
    if (!pointerState || pointerState.pointerId !== event.pointerId) {
      return;
    }

    const targetIndex = pointerState.active
      ? resolvePortReorderTargetIndex(pointerState.side, event.clientY) ?? pointerState.targetIndex
      : null;
    if (pointerState.active) {
      event.preventDefault();
      suppressNextPortPillClickOnce();
    }

    clearPortReorderPointerState();
    if (targetIndex === null) {
      return;
    }

    options.onReorder({
      nodeId: options.getNodeId(),
      side: pointerState.side,
      stateKey: pointerState.stateKey,
      targetIndex,
    });
  }

  function handlePortReorderPointerAbort(event: PointerEvent) {
    const pointerState = portReorderPointerState.value;
    if (pointerState?.pointerId === event.pointerId) {
      clearPortReorderPointerState();
    }
  }

  function handlePortStatePillClick(anchorId: string, stateKey: string | null | undefined) {
    if (suppressNextPortPillClick.value) {
      suppressNextPortPillClick.value = false;
      return;
    }
    options.onPortPillClick(anchorId, stateKey);
  }

  return {
    clearPortReorderPointerState,
    handlePortReorderPointerAbort,
    handlePortReorderPointerDown,
    handlePortReorderPointerMove,
    handlePortReorderPointerUp,
    handlePortStatePillClick,
    isPortReorderPlaceholder,
    isPortReordering,
    orderedInputPorts,
    orderedOutputPorts,
    portReorderFloatingPort,
    portReorderFloatingStyle,
    portReorderPointerState,
  };
}

function isPortReorderSourceElement(target: EventTarget | null): target is PortReorderSourceElement {
  return Boolean(target && typeof (target as unknown as PortReorderSourceElement).getBoundingClientRect === "function");
}

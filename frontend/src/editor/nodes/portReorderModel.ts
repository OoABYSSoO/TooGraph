export type PortReorderSide = "input" | "output";

export type PortReorderRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PortReorderPointerState = {
  side: PortReorderSide;
  stateKey: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
  pointerOffsetY: number;
  sourceRect: PortReorderRect;
  active: boolean;
  targetIndex: number | null;
};

export type PortReorderPortLike = {
  key: string;
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

type PortReorderSourceElement = {
  getBoundingClientRect: () => PortReorderRect;
};

export const PORT_REORDER_DRAG_THRESHOLD = 6;

export function isPortReorderingState(
  pointerState: PortReorderPointerState | null,
  side: PortReorderSide,
  stateKey: string,
) {
  return Boolean(pointerState?.active && pointerState.side === side && pointerState.stateKey === stateKey);
}

export function isPortReorderPlaceholderState(
  pointerState: PortReorderPointerState | null,
  side: PortReorderSide,
  stateKey: string,
) {
  return isPortReorderingState(pointerState, side, stateKey);
}

export function buildPortReorderPreviewPorts<TPort extends PortReorderPortLike>(
  side: PortReorderSide,
  ports: TPort[],
  pointerState: PortReorderPointerState | null,
) {
  if (!pointerState?.active || pointerState.side !== side || pointerState.targetIndex === null) {
    return ports;
  }

  const sourceIndex = ports.findIndex((port) => port.key === pointerState.stateKey);
  if (sourceIndex === -1) {
    return ports;
  }

  const sourcePort = ports[sourceIndex];
  const remainingPorts = ports.filter((port) => port.key !== pointerState.stateKey);
  const targetIndex = Math.max(0, Math.min(pointerState.targetIndex, remainingPorts.length));
  return [
    ...remainingPorts.slice(0, targetIndex),
    sourcePort,
    ...remainingPorts.slice(targetIndex),
  ];
}

export function escapePortReorderSelectorValue(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
}

export function buildPortReorderSelector(
  nodeId: string,
  side: PortReorderSide,
  escapeValue: (value: string) => string = escapePortReorderSelectorValue,
) {
  return [
    `[data-port-reorder-node-id="${escapeValue(nodeId)}"]`,
    `[data-port-reorder-side="${side}"]`,
    "[data-port-reorder-state-key]",
  ].join("");
}

export function resolvePortReorderTargetIndexFromElements(
  elements: PortReorderTargetElement[],
  sourceStateKey: string,
  clientY: number,
) {
  const targetElements = elements
    .filter((element) => element.dataset.portReorderStateKey !== sourceStateKey)
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);
  if (targetElements.length === 0) {
    return 0;
  }

  const firstTargetAfterPointer = targetElements.findIndex((element) => {
    const rect = element.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  return firstTargetAfterPointer === -1 ? targetElements.length : firstTargetAfterPointer;
}

export function resolvePortReorderInitialTargetIndex<TPort extends PortReorderPortLike>(
  ports: TPort[],
  stateKey: string,
) {
  const sourceIndex = ports.findIndex((port) => port.key === stateKey);
  return sourceIndex === -1 ? null : sourceIndex;
}

export function resolvePortReorderSourceRectFromElement(element: PortReorderSourceElement): PortReorderRect {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function buildPortReorderFloatingStyle(pointerState: PortReorderPointerState, stateColor: string) {
  const top = pointerState.currentClientY - pointerState.pointerOffsetY;
  return {
    "--node-card-port-accent": stateColor,
    left: `${pointerState.sourceRect.left}px`,
    top: `${top}px`,
    width: `${pointerState.sourceRect.width}px`,
    height: `${pointerState.sourceRect.height}px`,
  };
}

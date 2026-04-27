import { computed, reactive } from "vue";

import {
  clampCanvasViewportScale,
  DEFAULT_CANVAS_VIEWPORT,
  normalizeCanvasViewport,
  type CanvasViewport,
} from "./canvasViewport.ts";

type PanState = {
  pointerId: number | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export function useViewport(initialViewport?: CanvasViewport | null) {
  const normalizedInitialViewport = normalizeCanvasViewport(initialViewport) ?? DEFAULT_CANVAS_VIEWPORT;
  const viewport = reactive<CanvasViewport>({ ...normalizedInitialViewport });

  const panState = reactive<PanState>({
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  const isPanning = computed(() => panState.pointerId !== null);

  function beginPan(event: PointerEvent) {
    panState.pointerId = event.pointerId;
    panState.startX = event.clientX;
    panState.startY = event.clientY;
    panState.originX = viewport.x;
    panState.originY = viewport.y;
  }

  function movePan(event: PointerEvent) {
    if (panState.pointerId !== event.pointerId) {
      return;
    }
    viewport.x = panState.originX + (event.clientX - panState.startX);
    viewport.y = panState.originY + (event.clientY - panState.startY);
  }

  function endPan(event?: PointerEvent) {
    if (event && panState.pointerId !== event.pointerId) {
      return;
    }
    panState.pointerId = null;
  }

  function zoomBy(deltaY: number) {
    const direction = deltaY > 0 ? -0.08 : 0.08;
    viewport.scale = clampCanvasViewportScale(viewport.scale + direction);
  }

  function zoomAt(input: { clientX: number; clientY: number; canvasLeft: number; canvasTop: number; nextScale: number }) {
    const currentScale = viewport.scale || 1;
    const nextScale = clampCanvasViewportScale(input.nextScale);
    const anchorX = input.clientX - input.canvasLeft;
    const anchorY = input.clientY - input.canvasTop;
    const worldX = (anchorX - viewport.x) / currentScale;
    const worldY = (anchorY - viewport.y) / currentScale;

    viewport.scale = nextScale;
    viewport.x = anchorX - worldX * nextScale;
    viewport.y = anchorY - worldY * nextScale;
  }

  function setViewport(nextViewport: { x: number; y: number; scale: number }) {
    viewport.x = nextViewport.x;
    viewport.y = nextViewport.y;
    viewport.scale = clampCanvasViewportScale(nextViewport.scale);
  }

  return {
    viewport,
    isPanning,
    beginPan,
    movePan,
    endPan,
    zoomBy,
    zoomAt,
    setViewport,
  };
}

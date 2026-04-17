import { computed, reactive } from "vue";

type PanState = {
  pointerId: number | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export function useViewport() {
  const viewport = reactive({
    x: 0,
    y: 0,
    scale: 1,
  });

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
    viewport.scale = clamp(viewport.scale + direction, 0.4, 2.2);
  }

  return {
    viewport,
    isPanning,
    beginPan,
    movePan,
    endPan,
    zoomBy,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

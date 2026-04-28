import type { CanvasViewport } from "./canvasViewport.ts";

export function buildCanvasViewportStyle(viewport: Pick<CanvasViewport, "x" | "y" | "scale">) {
  return {
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
  };
}

export function buildZoomPercentLabel(scale: number) {
  return `${Math.round(scale * 100)}%`;
}

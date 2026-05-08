import { FLOW_OUT_HOTSPOT_GEOMETRY } from "../flowHandleGeometry.ts";
import type { ProjectedCanvasAnchor } from "./edgeProjection.ts";

export type RouteHandleTone = "success" | "danger" | "warning" | "neutral";

export type RouteHandlePalette = {
  fill: string;
  border: string;
  accent: string;
  glow: string;
  text: string;
};

const ROUTE_HANDLE_GEOMETRY = Object.freeze({
  offsetX: 48,
  width: 44,
  height: 56,
});

export function resolveRouteHandleTone(branch: string | undefined): RouteHandleTone {
  const normalizedBranch = branch?.trim().toLowerCase() ?? "";
  if (normalizedBranch === "true") {
    return "success";
  }
  if (normalizedBranch === "false") {
    return "danger";
  }
  if (normalizedBranch === "exhausted" || normalizedBranch === "exausted") {
    return "neutral";
  }
  return "warning";
}

export function resolveRouteHandlePalette(branch: string | undefined): RouteHandlePalette {
  const tone = resolveRouteHandleTone(branch);
  if (tone === "success") {
    return {
      fill: "rgba(240, 253, 244, 0.98)",
      border: "rgba(34, 197, 94, 0.28)",
      accent: "#16a34a",
      glow: "rgba(34, 197, 94, 0.18)",
      text: "rgba(21, 128, 61, 0.92)",
    };
  }
  if (tone === "danger") {
    return {
      fill: "rgba(254, 242, 242, 0.98)",
      border: "rgba(239, 68, 68, 0.24)",
      accent: "#dc2626",
      glow: "rgba(239, 68, 68, 0.18)",
      text: "rgba(185, 28, 28, 0.92)",
    };
  }
  if (tone === "neutral") {
    return {
      fill: "rgba(245, 241, 234, 0.98)",
      border: "rgba(120, 113, 108, 0.24)",
      accent: "#78716c",
      glow: "rgba(120, 113, 108, 0.18)",
      text: "rgba(87, 83, 78, 0.92)",
    };
  }
  return {
    fill: "rgba(255, 251, 235, 0.98)",
    border: "rgba(245, 158, 11, 0.26)",
    accent: "#d97706",
    glow: "rgba(245, 158, 11, 0.18)",
    text: "rgba(161, 98, 7, 0.92)",
  };
}

export function buildFlowOutHotspotStyle(anchor: Pick<ProjectedCanvasAnchor, "x" | "y">) {
  return {
    left: `${anchor.x + FLOW_OUT_HOTSPOT_GEOMETRY.offsetX}px`,
    top: `${anchor.y}px`,
    width: `${FLOW_OUT_HOTSPOT_GEOMETRY.width}px`,
    height: `${FLOW_OUT_HOTSPOT_GEOMETRY.height}px`,
  };
}

export function buildRouteHandleStyle(anchor: Pick<ProjectedCanvasAnchor, "x" | "y" | "branch">) {
  const palette = resolveRouteHandlePalette(anchor.branch);
  return {
    left: `${anchor.x + ROUTE_HANDLE_GEOMETRY.offsetX}px`,
    top: `${anchor.y}px`,
    width: `${ROUTE_HANDLE_GEOMETRY.width}px`,
    height: `${ROUTE_HANDLE_GEOMETRY.height}px`,
    "--editor-flow-handle-fill": palette.fill,
    "--editor-flow-handle-border": palette.border,
    "--editor-flow-handle-accent": palette.accent,
    "--editor-flow-handle-glow": palette.glow,
  };
}

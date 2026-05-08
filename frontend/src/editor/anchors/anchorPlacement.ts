import type { AnchorDescriptor, NodeAnchorModel } from "./anchorModel.ts";
import { FLOW_OUT_HOTSPOT_GEOMETRY } from "../flowHandleGeometry.ts";

export type NodeFrame = {
  x: number;
  y: number;
  width: number;
  height?: number;
  headerHeight: number;
  bodyTop: number;
  rowGap: number;
  footerTop?: number;
};

export type PlacedAnchor = {
  id: string;
  x: number;
  y: number;
  side: AnchorDescriptor["side"];
  stateKey?: string;
  branch?: string;
};

export type PlacedAnchorSet = {
  flowIn: PlacedAnchor | null;
  flowOut: PlacedAnchor | null;
  stateInputs: PlacedAnchor[];
  stateOutputs: PlacedAnchor[];
  routeOutputs: PlacedAnchor[];
};

const EDGE_PORT_INSET = 6;
const BODY_OUTPUT_PORT_INSET = 40;
const BODY_PORT_ROW_CENTER_OFFSET = 29;
const ROUTE_OUTPUT_EDGE_INSET = 28;

export function placeAnchors(model: NodeAnchorModel, frame: NodeFrame): PlacedAnchorSet {
  return {
    flowIn: placeAnchor(model.flowIn, frame),
    flowOut: placeAnchor(model.flowOut, frame),
    stateInputs: model.stateInputs.map((anchor) => placeAnchor(anchor, frame)).filter(Boolean) as PlacedAnchor[],
    stateOutputs: model.stateOutputs.map((anchor) => placeAnchor(anchor, frame)).filter(Boolean) as PlacedAnchor[],
    routeOutputs: placeRouteOutputs(model.routeOutputs, frame),
  };
}

export function resolveRouteOutputRowGap(routeOutputCount: number, bodyRowGap: number): number {
  if (routeOutputCount <= 1) {
    return bodyRowGap;
  }
  return Math.max((bodyRowGap * routeOutputCount) / (routeOutputCount - 1), FLOW_OUT_HOTSPOT_GEOMETRY.height);
}

function placeRouteOutputs(anchors: AnchorDescriptor[], frame: NodeFrame): PlacedAnchor[] {
  if (anchors.length <= 0) {
    return [];
  }
  if (hasFrameHeight(frame)) {
    return anchors.map((anchor, index) => placeRouteAnchor(anchor, frame, index, anchors.length));
  }
  const routeFrame = {
    ...frame,
    rowGap: resolveRouteOutputRowGap(anchors.length, frame.rowGap),
  };
  return anchors.map((anchor) => placeAnchor(anchor, routeFrame)).filter(Boolean) as PlacedAnchor[];
}

function placeRouteAnchor(anchor: AnchorDescriptor, frame: NodeFrame & { height: number }, index: number, count: number): PlacedAnchor {
  const topOffset = resolveRouteOutputTopOffset(frame);
  const bottomOffset = resolveRouteOutputBottomOffset(frame, topOffset);
  const yOffset = count <= 1
    ? Math.round((topOffset + bottomOffset) / 2)
    : Math.round(topOffset + ((bottomOffset - topOffset) * index) / (count - 1));
  return {
    id: anchor.id,
    x: resolveX(anchor, frame),
    y: frame.y + yOffset,
    side: anchor.side,
    ...(anchor.stateKey ? { stateKey: anchor.stateKey } : {}),
    ...(anchor.branch ? { branch: anchor.branch } : {}),
  };
}

function resolveRouteOutputTopOffset(frame: NodeFrame & { height: number }) {
  const preferredTop = frame.bodyTop + BODY_PORT_ROW_CENTER_OFFSET;
  const maxTop = Math.max(ROUTE_OUTPUT_EDGE_INSET, frame.height - ROUTE_OUTPUT_EDGE_INSET);
  return clamp(preferredTop, ROUTE_OUTPUT_EDGE_INSET, maxTop);
}

function resolveRouteOutputBottomOffset(frame: NodeFrame & { height: number }, topOffset: number) {
  return Math.max(topOffset, frame.height - ROUTE_OUTPUT_EDGE_INSET);
}

function hasFrameHeight(frame: NodeFrame): frame is NodeFrame & { height: number } {
  return typeof frame.height === "number" && Number.isFinite(frame.height) && frame.height > 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function placeAnchor(anchor: AnchorDescriptor | null, frame: NodeFrame): PlacedAnchor | null {
  if (!anchor) {
    return null;
  }

  const x = resolveX(anchor, frame);
  const y = resolveY(anchor, frame);

  return {
    id: anchor.id,
    x,
    y,
    side: anchor.side,
    ...(anchor.stateKey ? { stateKey: anchor.stateKey } : {}),
    ...(anchor.branch ? { branch: anchor.branch } : {}),
  };
}

function resolveX(anchor: AnchorDescriptor, frame: NodeFrame): number {
  if (anchor.side === "left") {
    return frame.x + EDGE_PORT_INSET;
  }
  if (anchor.side === "top") {
    return frame.x + frame.width / 2;
  }
  if (anchor.side === "right") {
    if (anchor.branch) {
      return frame.x + frame.width - EDGE_PORT_INSET;
    }
    return frame.x + frame.width - (anchor.lane === "body" ? BODY_OUTPUT_PORT_INSET : EDGE_PORT_INSET);
  }
  const count = Math.max(anchor.row + 2, 2);
  return frame.x + (frame.width / count) * (anchor.row + 1);
}

function resolveY(anchor: AnchorDescriptor, frame: NodeFrame): number {
  if (anchor.lane === "header") {
    return frame.y + frame.headerHeight / 2;
  }
  if (anchor.lane === "body") {
    return frame.y + frame.bodyTop + BODY_PORT_ROW_CENTER_OFFSET + anchor.row * frame.rowGap;
  }
  return frame.y + (frame.footerTop ?? frame.bodyTop + 160) + anchor.row * 24;
}

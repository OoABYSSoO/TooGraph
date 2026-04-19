import type { AnchorDescriptor, NodeAnchorModel } from "./anchorModel.ts";

export type NodeFrame = {
  x: number;
  y: number;
  width: number;
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

export function placeAnchors(model: NodeAnchorModel, frame: NodeFrame): PlacedAnchorSet {
  return {
    flowIn: placeAnchor(model.flowIn, frame),
    flowOut: placeAnchor(model.flowOut, frame),
    stateInputs: model.stateInputs.map((anchor) => placeAnchor(anchor, frame)).filter(Boolean) as PlacedAnchor[],
    stateOutputs: model.stateOutputs.map((anchor) => placeAnchor(anchor, frame)).filter(Boolean) as PlacedAnchor[],
    routeOutputs: model.routeOutputs.map((anchor) => placeAnchor(anchor, frame)).filter(Boolean) as PlacedAnchor[],
  };
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

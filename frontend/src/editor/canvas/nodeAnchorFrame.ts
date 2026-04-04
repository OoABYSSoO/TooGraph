import type { NodeFrame } from "../anchors/anchorPlacement.ts";
import type { GraphNode, GraphPosition } from "../../types/node-system.ts";
import { normalizeNodeSize } from "./nodeResize.ts";
import { resolveFallbackNodeSize, type MeasuredNodeSize } from "./canvasNodePresentationModel.ts";

const NODE_ANCHOR_HEADER_HEIGHT = 68;
const NODE_ANCHOR_BODY_TOP = 116;
const NODE_ANCHOR_ROW_GAP = 44;
const CONDITION_FOOTER_OFFSET_FROM_BOTTOM = 88;

export function buildNodeAnchorFrame(
  node: GraphNode,
  options: {
    size?: MeasuredNodeSize;
    position?: GraphPosition;
  } = {},
): NodeFrame {
  const size = options.size ?? normalizeNodeSize(node.ui.size) ?? resolveFallbackNodeSize(node);
  const position = options.position ?? node.ui.position;
  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    headerHeight: NODE_ANCHOR_HEADER_HEIGHT,
    bodyTop: NODE_ANCHOR_BODY_TOP,
    rowGap: NODE_ANCHOR_ROW_GAP,
    footerTop: node.kind === "condition" ? Math.max(NODE_ANCHOR_BODY_TOP, size.height - CONDITION_FOOTER_OFFSET_FROM_BOTTOM) : 0,
  };
}

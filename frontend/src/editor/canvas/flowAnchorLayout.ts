type FlowAnchorSide = "left" | "right" | "top" | "bottom";

export function resolveFlowAnchorOffset(input: {
  side: FlowAnchorSide;
  width: number;
  height: number;
}) {
  if (input.side === "left") {
    return {
      offsetX: 0,
      offsetY: Math.round(input.height / 2),
    };
  }

  if (input.side === "right") {
    return {
      offsetX: input.width,
      offsetY: Math.round(input.height / 2),
    };
  }

  if (input.side === "top") {
    return {
      offsetX: Math.round(input.width / 2),
      offsetY: 0,
    };
  }

  return {
    offsetX: Math.round(input.width / 2),
    offsetY: input.height,
  };
}

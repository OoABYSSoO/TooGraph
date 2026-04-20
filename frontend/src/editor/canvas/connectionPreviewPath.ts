import { buildConnectorCurvePath } from "./connectionCurvePath.ts";
import { buildSequenceFlowPath } from "./flowEdgePath.ts";

export function buildPendingConnectionPreviewPath(input: {
  kind: "flow-out" | "route-out" | "state-out";
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}) {
  if (input.kind === "flow-out" || input.kind === "route-out") {
    return buildSequenceFlowPath(input);
  }

  return buildConnectorCurvePath({
    sourceX: input.sourceX,
    sourceY: input.sourceY,
    targetX: input.targetX,
    targetY: input.targetY,
    sourceSide: "right",
    targetSide: "left",
  });
}

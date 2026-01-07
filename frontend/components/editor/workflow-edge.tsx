"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

import type { GraphEdgeData } from "@/types/editor";

function summarizeFlowKeys(keys: string[]) {
  if (keys.length === 0) return "flow";
  if (keys.length <= 2) return keys.join(" · ");
  return `${keys.slice(0, 2).join(" · ")} +${keys.length - 2}`;
}

export function WorkflowEdge(props: EdgeProps) {
  const data = (props.data ?? {}) as GraphEdgeData;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  const isBranch = data.edgeKind === "branch";
  const label = isBranch ? data.branchLabel ?? "branch" : summarizeFlowKeys(data.flowKeys ?? []);

  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        style={{
          stroke: isBranch ? "#9a3412" : "#8a6d3b",
          strokeWidth: isBranch ? 2.4 : 2.2,
          strokeDasharray: isBranch ? "6 4" : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={`workflow-edge-label${isBranch ? " is-branch" : ""}`}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

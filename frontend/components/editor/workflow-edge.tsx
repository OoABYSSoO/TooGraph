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
          className={`rounded-full border px-2.5 py-1.5 text-[0.76rem] leading-none shadow-[0_6px_20px_rgba(60,41,20,0.08)] whitespace-nowrap ${
            isBranch
              ? "border-[rgba(154,52,18,0.35)] bg-[rgba(255,242,234,0.96)] uppercase tracking-[0.04em] text-[var(--accent-strong)]"
              : "border-[rgba(138,109,59,0.35)] bg-[rgba(255,250,241,0.96)] text-[var(--text)]"
          }`}
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

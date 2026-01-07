"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { GraphNodeData } from "@/types/editor";

function summarizeKeys(keys: string[]) {
  if (keys.length === 0) return "none";
  if (keys.length <= 2) return keys.join(", ");
  return `${keys.slice(0, 2).join(", ")} +${keys.length - 2}`;
}

export function WorkflowNode(props: NodeProps) {
  const data = props.data as GraphNodeData;
  const selected = props.selected;
  return (
    <div className={`workflow-node kind-${data.kind} status-${data.status ?? "idle"}${selected ? " is-selected" : ""}`}>
      <Handle className="workflow-handle workflow-handle-in" position={Position.Left} type="target" />
      <Handle className="workflow-handle workflow-handle-out" position={Position.Right} type="source" />

      <div className="workflow-node-head">
        <div className="workflow-node-kind">{data.kind.replaceAll("_", " ")}</div>
        <div className="workflow-node-status">{data.status ?? "idle"}</div>
      </div>

      <div className="workflow-node-title">{data.label}</div>
      {data.description ? <div className="workflow-node-desc">{data.description}</div> : null}

      <div className="workflow-node-io">
        <div className="workflow-io-col">
          <span className="workflow-io-label">In</span>
          <span className="workflow-io-value">{summarizeKeys(data.reads)}</span>
        </div>
        <div className="workflow-io-col workflow-io-col-right">
          <span className="workflow-io-label">Out</span>
          <span className="workflow-io-value">{summarizeKeys(data.writes)}</span>
        </div>
      </div>
    </div>
  );
}

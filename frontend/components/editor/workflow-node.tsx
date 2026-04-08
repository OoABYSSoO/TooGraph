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
    <div className={`workflow-node kind-${data.kind} status-${data.status ?? "idle"}${selected ? " is-selected" : ""} min-w-[260px] max-w-[300px] rounded-[20px] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,250,241,0.96),rgba(249,242,230,0.92))] px-4 py-3.5 shadow-[0_12px_30px_var(--shadow)]`}>
      <Handle className="workflow-handle workflow-handle-in" position={Position.Left} type="target" />
      <Handle className="workflow-handle workflow-handle-out" position={Position.Right} type="source" />

      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[0.74rem] uppercase tracking-[0.05em] text-[var(--muted)]">{data.kind.replaceAll("_", " ")}</div>
        <div className="text-[0.74rem] uppercase tracking-[0.05em] text-[var(--muted)]">{data.status ?? "idle"}</div>
      </div>

      <div className="mb-1.5 text-[1.05rem] font-bold">{data.label}</div>
      {data.description ? <div className="min-h-[2.5em] text-[0.88rem] leading-[1.45] text-[var(--muted)]">{data.description}</div> : null}

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-[14px] border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.7)] p-2.5">
          <span className="mb-1 block text-[0.72rem] uppercase tracking-[0.05em] text-[var(--muted)]">In</span>
          <span className="block text-[0.88rem] font-semibold text-[var(--text)]">{summarizeKeys(data.reads)}</span>
        </div>
        <div className="rounded-[14px] border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.7)] p-2.5 text-right">
          <span className="mb-1 block text-[0.72rem] uppercase tracking-[0.05em] text-[var(--muted)]">Out</span>
          <span className="block text-[0.88rem] font-semibold text-[var(--text)]">{summarizeKeys(data.writes)}</span>
        </div>
      </div>
    </div>
  );
}

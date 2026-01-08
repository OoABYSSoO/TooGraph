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
  const status = data.status ?? "idle";
  const toneClass =
    data.kind === "start"
      ? "border-[rgba(31,111,80,0.35)] bg-[linear-gradient(180deg,rgba(237,253,245,0.98),rgba(231,247,238,0.9))]"
      : data.kind === "end"
        ? "border-[rgba(159,18,57,0.28)] bg-[linear-gradient(180deg,rgba(255,244,247,0.98),rgba(250,234,239,0.9))]"
        : data.kind === "condition"
          ? "border-[rgba(154,52,18,0.36)] bg-[linear-gradient(180deg,rgba(255,246,238,0.98),rgba(249,232,215,0.92))]"
          : "border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,250,241,0.96),rgba(249,242,230,0.92))]";
  const statusClass =
    status === "running"
      ? "border-amber-700 shadow-[0_0_0_3px_rgba(245,158,11,0.18),0_12px_30px_var(--shadow)]"
      : status === "success"
        ? "border-[var(--success)] shadow-[0_0_0_3px_rgba(31,111,80,0.16),0_12px_30px_var(--shadow)]"
        : status === "failed"
          ? "border-[var(--danger)] shadow-[0_0_0_3px_rgba(159,18,57,0.16),0_12px_30px_var(--shadow)]"
          : "shadow-[0_12px_30px_var(--shadow)]";
  const selectedClass = selected ? "shadow-[0_0_0_2px_rgba(154,52,18,0.28),0_16px_34px_var(--shadow)]" : "";

  return (
    <div className={`min-w-[260px] max-w-[300px] rounded-[20px] border px-4 py-3.5 ${toneClass} ${selected ? selectedClass : statusClass}`}>
      <Handle
        className="!left-[-7px] !h-3 !w-3 !border-2 !border-[rgba(255,250,241,0.95)] !bg-[var(--accent)]"
        position={Position.Left}
        type="target"
      />
      <Handle
        className="!right-[-7px] !h-3 !w-3 !border-2 !border-[rgba(255,250,241,0.95)] !bg-[var(--accent)]"
        position={Position.Right}
        type="source"
      />

      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[0.74rem] uppercase tracking-[0.05em] text-[var(--muted)]">{data.kind.replaceAll("_", " ")}</div>
        <div className="text-[0.74rem] uppercase tracking-[0.05em] text-[var(--muted)]">{status}</div>
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

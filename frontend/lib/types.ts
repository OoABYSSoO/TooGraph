import type { NodeSystemGraphEdge, NodeSystemGraphNode, RunStatus } from "@/lib/node-system-schema";

// ─── Shared API Types ─────────────────────────────────────────────────────────────

/**
 * Summary of a saved graph.
 * Returned by GET /api/graphs as the full NodeSystemGraphDocument.
 * template_id may be absent in older persisted graphs.
 */
export type GraphSummary = {
  graph_id: string;
  name: string;
  template_id?: string;
  nodes: NodeSystemGraphNode[];
  edges: NodeSystemGraphEdge[];
};

/**
 * Summary of a graph run.
 * Returned by GET /api/runs.
 * Optional fields reflect the full persisted run_state shape.
 */
export type RunSummary = {
  run_id: string;
  graph_id?: string;
  graph_name: string;
  status: RunStatus;
  current_node_id?: string | null;
  revision_round: number;
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  final_score?: number | null;
};

/** Summary of an available template. Returned by GET /api/templates. */
export type TemplateSummary = {
  template_id: string;
  label: string;
  description: string;
};

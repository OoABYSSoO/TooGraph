import type { Edge, Node } from "@xyflow/react";

export type GraphNodeType =
  | "input"
  | "knowledge"
  | "memory"
  | "planner"
  | "skill_executor"
  | "evaluator"
  | "finalizer";

export type EvaluatorDecision = "pass" | "revise" | "fail";

export type GraphNodeConfig = {
  taskInput?: string;
  query?: string;
  memoryType?: string;
  plannerMode?: string;
  selectedSkills?: string[];
  evaluatorDecision?: EvaluatorDecision;
  score?: number;
  finalMessage?: string;
};

export type GraphNodeData = {
  label: string;
  kind: GraphNodeType;
  description: string;
  status?: "idle" | "running" | "success" | "failed";
  config: GraphNodeConfig;
};

export type GraphCanvasNode = Node<GraphNodeData>;
export type GraphCanvasEdge = Edge;

export type NodeExecutionSummary = {
  node_id: string;
  node_type: string;
  status: string;
  duration_ms: number;
  input_summary: string;
  output_summary: string;
  artifacts?: Record<string, unknown>;
  warnings?: string[];
  errors?: string[];
};

export type RunDetailPayload = {
  run_id: string;
  status: string;
  current_node_id?: string | null;
  revision_round: number;
  final_result?: string | null;
  final_score?: number | null;
  node_status_map: Record<string, string>;
  node_executions: NodeExecutionSummary[];
};

export type GraphDocument = {
  graphId: string;
  name: string;
  nodes: GraphCanvasNode[];
  edges: GraphCanvasEdge[];
  updatedAt: string;
};

import type { GraphCanvasNode, GraphNodeType } from "@/types/editor";

type NodePreset = {
  kind: GraphNodeType;
  label: string;
  description: string;
};

export const NODE_PRESETS: NodePreset[] = [
  { kind: "input", label: "Input", description: "Collect task input and initialize run state." },
  {
    kind: "knowledge",
    label: "Knowledge",
    description: "Load or retrieve knowledge relevant to the task.",
  },
  { kind: "memory", label: "Memory", description: "Load past memory patterns into context." },
  { kind: "planner", label: "Planner", description: "Create an execution plan." },
  {
    kind: "skill_executor",
    label: "Skill Executor",
    description: "Run registered tools or helper skills.",
  },
  { kind: "evaluator", label: "Evaluator", description: "Score output and choose a route." },
  { kind: "finalizer", label: "Finalizer", description: "Collect outputs and finish the run." },
];

export function createStarterGraph(graphId: string): GraphCanvasNode[] {
  return [
    {
      id: "input_1",
      type: "default",
      position: { x: 80, y: 220 },
      data: {
        label: "Input",
        kind: "input",
        description: "Provide task input for the workflow.",
        status: "idle",
        config: {
          taskInput: "Describe the workflow task here.",
        },
      },
    },
    {
      id: "planner_1",
      type: "default",
      position: { x: 320, y: 220 },
      data: {
        label: "Planner",
        kind: "planner",
        description: "Create a plan using available context.",
        status: "idle",
        config: {
          plannerMode: "default",
        },
      },
    },
    {
      id: "evaluator_1",
      type: "default",
      position: { x: 560, y: 220 },
      data: {
        label: "Evaluator",
        kind: "evaluator",
        description: "Evaluate output and choose next route.",
        status: "idle",
        config: {
          evaluatorDecision: "pass",
          score: 8.5,
        },
      },
    },
    {
      id: "finalizer_1",
      type: "default",
      position: { x: 800, y: 220 },
      data: {
        label: "Finalizer",
        kind: "finalizer",
        description: "Return final result and wrap the run.",
        status: "idle",
        config: {
          finalMessage: "Finalize workflow output.",
        },
      },
    },
  ];
}

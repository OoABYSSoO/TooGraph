import type { GraphNode } from "../../types/node-system.ts";
import {
  shouldExposeVirtualAnyInput,
  shouldExposeVirtualAnyOutput,
  VIRTUAL_ANY_INPUT_STATE_KEY,
  VIRTUAL_ANY_OUTPUT_STATE_KEY,
} from "../../lib/virtual-any-input.ts";

export type AnchorDescriptor = {
  id: string;
  side: "left" | "right" | "top" | "bottom";
  lane: "header" | "body" | "footer";
  row: number;
  stateKey?: string;
  branch?: string;
};

export type NodeAnchorModel = {
  nodeId: string;
  flowIn: AnchorDescriptor | null;
  flowOut: AnchorDescriptor | null;
  stateInputs: AnchorDescriptor[];
  stateOutputs: AnchorDescriptor[];
  routeOutputs: AnchorDescriptor[];
};

export function buildAnchorModel(nodeId: string, node: GraphNode): NodeAnchorModel {
  const stateInputs = shouldExposeVirtualAnyInput(node)
    ? [
        {
          id: `state-in:${VIRTUAL_ANY_INPUT_STATE_KEY}`,
          side: "left" as const,
          lane: "body" as const,
          row: 0,
          stateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
        },
      ]
    : node.reads.map((binding, index) => ({
        id: `state-in:${binding.state}`,
        side: "left" as const,
        lane: "body" as const,
        row: index,
        stateKey: binding.state,
      }));

  const stateOutputs = shouldExposeVirtualAnyOutput(node)
    ? [
        {
          id: `state-out:${VIRTUAL_ANY_OUTPUT_STATE_KEY}`,
          side: "right" as const,
          lane: "body" as const,
          row: 0,
          stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
        },
      ]
    : node.writes.map((binding, index) => ({
        id: `state-out:${binding.state}`,
        side: "right" as const,
        lane: "body" as const,
        row: index,
        stateKey: binding.state,
      }));

  if (node.kind === "input") {
    return {
      nodeId,
      flowIn: null,
      flowOut: { id: "flow-out", side: "right", lane: "header", row: 0 },
      stateInputs,
      stateOutputs,
      routeOutputs: [],
    };
  }

  if (node.kind === "output") {
    return {
      nodeId,
      flowIn: { id: "flow-in", side: "left", lane: "header", row: 0 },
      flowOut: null,
      stateInputs,
      stateOutputs,
      routeOutputs: [],
    };
  }

  if (node.kind === "condition") {
    return {
      nodeId,
      flowIn: { id: "flow-in", side: "left", lane: "header", row: 0 },
      flowOut: null,
      stateInputs,
      stateOutputs,
      routeOutputs: node.config.branches.map((branch, index) => ({
        id: `branch:${branch}`,
        side: "right",
        lane: "body",
        row: index,
        branch,
      })),
    };
  }

  return {
    nodeId,
    flowIn: { id: "flow-in", side: "left", lane: "header", row: 0 },
    flowOut: { id: "flow-out", side: "right", lane: "header", row: 0 },
    stateInputs,
    stateOutputs,
    routeOutputs: [],
  };
}

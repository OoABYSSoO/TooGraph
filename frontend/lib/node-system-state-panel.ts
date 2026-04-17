import {
  getCanonicalNodeDisplayName,
  listEditorInputPortsFromCanonicalNode,
  listEditorOutputPortsFromCanonicalNode,
  type CanonicalGraphPayload,
} from "./node-system-canonical.ts";
import type { NodeFamily, PortDefinition } from "./node-system-schema.ts";

export type StateBindingSummary = {
  id: string;
  nodeId: string;
  nodeLabel: string;
  nodeFamily: NodeFamily;
  portKey: string;
  portLabel: string;
  valid: boolean;
};

export type StateBindingNodeOption = {
  id: string;
  label: string;
  family: NodeFamily;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
};

function getStateDisplayName(graph: CanonicalGraphPayload, stateKey: string) {
  return graph.state_schema[stateKey]?.name?.trim() || stateKey;
}

export function buildDisplayPortsForCanonicalNode(
  graph: CanonicalGraphPayload,
  nodeId: string,
): {
  inputs: PortDefinition[];
  outputs: PortDefinition[];
} {
  const node = graph.nodes[nodeId];
  if (!node) {
    return {
      inputs: [],
      outputs: [],
    };
  }

  return {
    inputs: listEditorInputPortsFromCanonicalNode(node, graph.state_schema),
    outputs: listEditorOutputPortsFromCanonicalNode(node, graph.state_schema),
  };
}

export function buildStateBindingNodeOptions(
  graph: CanonicalGraphPayload,
): StateBindingNodeOption[] {
  return Object.entries(graph.nodes).map(([nodeId, node]) => {
    const ports = buildDisplayPortsForCanonicalNode(graph, nodeId);

    return {
      id: nodeId,
      label: getCanonicalNodeDisplayName(nodeId, node),
      family: node.kind,
      inputs: ports.inputs,
      outputs: ports.outputs,
    };
  });
}

export function buildStateBindingsByKeyFromCanonicalGraph(graph: CanonicalGraphPayload): {
  readersByKey: Record<string, StateBindingSummary[]>;
  writersByKey: Record<string, StateBindingSummary[]>;
} {
  const readersByKey: Record<string, StateBindingSummary[]> = {};
  const writersByKey: Record<string, StateBindingSummary[]> = {};

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    const nodeLabel = getCanonicalNodeDisplayName(nodeId, node);
    const { inputs: inputPorts, outputs: outputPorts } = buildDisplayPortsForCanonicalNode(graph, nodeId);

    for (const binding of node.reads) {
      const matchedPort = inputPorts.find((port) => port.key === binding.state);
      const summary: StateBindingSummary = {
        id: `${nodeId}:read:${binding.state}`,
        nodeId,
        nodeLabel,
        nodeFamily: node.kind,
        portKey: binding.state,
        portLabel: matchedPort?.label ?? getStateDisplayName(graph, binding.state),
        valid: Boolean(matchedPort),
      };
      readersByKey[binding.state] = [...(readersByKey[binding.state] ?? []), summary];
    }

    for (const binding of node.writes) {
      const matchedPort = outputPorts.find((port) => port.key === binding.state);
      const summary: StateBindingSummary = {
        id: `${nodeId}:write:${binding.state}`,
        nodeId,
        nodeLabel,
        nodeFamily: node.kind,
        portKey: binding.state,
        portLabel: matchedPort?.label ?? getStateDisplayName(graph, binding.state),
        valid: Boolean(matchedPort),
      };
      writersByKey[binding.state] = [...(writersByKey[binding.state] ?? []), summary];
    }
  }

  return {
    readersByKey,
    writersByKey,
  };
}

export function listStateBindingNodeIdsForCanonicalState(
  graph: CanonicalGraphPayload,
  stateKey: string,
): {
  readerNodeIds: string[];
  writerNodeIds: string[];
} {
  const readerNodeIds: string[] = [];
  const writerNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (node.reads.some((binding) => binding.state === stateKey)) {
      readerNodeIds.push(nodeId);
    }
    if (node.writes.some((binding) => binding.state === stateKey)) {
      writerNodeIds.push(nodeId);
    }
  }

  return {
    readerNodeIds,
    writerNodeIds,
  };
}

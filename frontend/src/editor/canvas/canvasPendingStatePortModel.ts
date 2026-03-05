import type { PendingGraphConnection } from "../../lib/graph-connections.ts";
import {
  CREATE_AGENT_INPUT_STATE_KEY,
  VIRTUAL_ANY_INPUT_STATE_KEY,
  VIRTUAL_ANY_OUTPUT_STATE_KEY,
} from "../../lib/virtual-any-input.ts";
import type { GraphDocument, GraphPayload, StateDefinition } from "../../types/node-system.ts";
import { isConcreteStateConnectionKey } from "./canvasConnectionModel.ts";

export type PendingStateInputSource = {
  stateKey: string;
  label: string;
  stateColor: string;
};

export type PendingStatePortPreview = PendingStateInputSource;

type StateSchemaLike = Record<string, Pick<StateDefinition, "name" | "color"> | undefined>;

export function resolveStatePortPreview(
  stateSchema: StateSchemaLike,
  stateKey: string | null | undefined,
): PendingStatePortPreview | null {
  if (!isConcreteStateConnectionKey(stateKey)) {
    return null;
  }
  const state = stateSchema[stateKey];
  if (!state) {
    return null;
  }

  return {
    stateKey,
    label: state.name?.trim() || stateKey,
    stateColor: state.color?.trim() || "#d97706",
  };
}

export function buildPendingAgentInputSourceByNodeId(input: {
  document: GraphPayload | GraphDocument;
  connection: PendingGraphConnection | null;
  canCompleteAgentInput: (nodeId: string) => boolean;
}): Record<string, PendingStateInputSource> {
  const connection = input.connection;
  if (connection?.sourceKind !== "state-out" || !isConcreteStateConnectionKey(connection.sourceStateKey)) {
    return {};
  }

  const pendingSource = resolveStatePortPreview(input.document.state_schema, connection.sourceStateKey);
  if (!pendingSource) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input.document.nodes)
      .filter(([, node]) => node.kind === "agent")
      .filter(([nodeId]) => input.canCompleteAgentInput(nodeId))
      .map(([nodeId]) => [nodeId, pendingSource]),
  );
}

export function buildPendingStateInputSourceTargetByNodeId(input: {
  connection: PendingGraphConnection | null;
  stateSchema: StateSchemaLike;
  autoSnappedTargetStateKey?: string | null;
}): Record<string, PendingStatePortPreview> {
  const connection = input.connection;
  if (connection?.sourceKind !== "state-in" || connection.sourceStateKey !== VIRTUAL_ANY_INPUT_STATE_KEY) {
    return {};
  }

  const sourcePreview = resolveStatePortPreview(input.stateSchema, input.autoSnappedTargetStateKey);
  return sourcePreview ? { [connection.sourceNodeId]: sourcePreview } : {};
}

export function buildPendingStateOutputTargetByNodeId(input: {
  connection: PendingGraphConnection | null;
  stateSchema: StateSchemaLike;
  autoSnappedTargetStateKey?: string | null;
}): Record<string, PendingStatePortPreview> {
  const connection = input.connection;
  if (connection?.sourceKind !== "state-out" || connection.sourceStateKey !== VIRTUAL_ANY_OUTPUT_STATE_KEY) {
    return {};
  }

  const targetPreview = resolveStatePortPreview(input.stateSchema, input.autoSnappedTargetStateKey);
  return targetPreview ? { [connection.sourceNodeId]: targetPreview } : {};
}

export { CREATE_AGENT_INPUT_STATE_KEY };

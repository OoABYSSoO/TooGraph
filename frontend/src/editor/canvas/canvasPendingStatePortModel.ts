import type { PendingGraphConnection } from "../../lib/graph-connections.ts";
import {
  CREATE_AGENT_INPUT_STATE_KEY,
  VIRTUAL_ANY_OUTPUT_COLOR,
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
const PENDING_NEW_STATE_LABEL = "new state";

function buildPendingNewStatePreview(): PendingStatePortPreview {
  return {
    stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    label: PENDING_NEW_STATE_LABEL,
    stateColor: VIRTUAL_ANY_OUTPUT_COLOR,
  };
}

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
  if (connection?.sourceKind !== "state-out" || !connection.sourceStateKey) {
    return {};
  }

  const sourceStateKey = connection.sourceStateKey;
  const sourceState = input.document.state_schema[sourceStateKey];
  const pendingSource = {
    stateKey: sourceStateKey,
    label: sourceStateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY ? PENDING_NEW_STATE_LABEL : sourceState?.name?.trim() || sourceStateKey,
    stateColor: sourceStateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY ? VIRTUAL_ANY_OUTPUT_COLOR : sourceState?.color?.trim() || "#d97706",
  };

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
  if (connection?.sourceKind !== "state-in") {
    return {};
  }

  if (connection.sourceStateKey && input.autoSnappedTargetStateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY) {
    return { [connection.sourceNodeId]: buildPendingNewStatePreview() };
  }

  if (connection.sourceStateKey !== VIRTUAL_ANY_INPUT_STATE_KEY) {
    return {};
  }

  const sourcePreview = resolveStatePortPreview(input.stateSchema, input.autoSnappedTargetStateKey);
  return sourcePreview ? { [connection.sourceNodeId]: sourcePreview } : {};
}

export function buildPendingStateOutputTargetByNodeId(input: {
  connection: PendingGraphConnection | null;
  stateSchema: StateSchemaLike;
  autoSnappedTargetNodeId?: string | null;
  autoSnappedTargetStateKey?: string | null;
}): Record<string, PendingStatePortPreview> {
  const connection = input.connection;
  if (
    connection?.sourceKind === "state-in" &&
    input.autoSnappedTargetNodeId &&
    input.autoSnappedTargetStateKey === VIRTUAL_ANY_OUTPUT_STATE_KEY
  ) {
    return { [input.autoSnappedTargetNodeId]: buildPendingNewStatePreview() };
  }

  if (connection?.sourceKind !== "state-out" || connection.sourceStateKey !== VIRTUAL_ANY_OUTPUT_STATE_KEY) {
    return {};
  }

  if (input.autoSnappedTargetStateKey === VIRTUAL_ANY_INPUT_STATE_KEY || input.autoSnappedTargetStateKey === CREATE_AGENT_INPUT_STATE_KEY) {
    return { [connection.sourceNodeId]: buildPendingNewStatePreview() };
  }

  const targetPreview = resolveStatePortPreview(input.stateSchema, input.autoSnappedTargetStateKey);
  return targetPreview ? { [connection.sourceNodeId]: targetPreview } : {};
}

export { CREATE_AGENT_INPUT_STATE_KEY };

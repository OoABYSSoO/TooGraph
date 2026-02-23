import { cloneGraphDocument } from "../../lib/graph-document.ts";
import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";
import type { RunDetail } from "../../types/run.ts";

export function applyRunWrittenStateValuesToDocument<T extends GraphPayload | GraphDocument>(document: T, run: RunDetail): T {
  const candidateKeys = collectGeneratedStateKeys(document, run);
  if (candidateKeys.size === 0) {
    return document;
  }

  const finalValues = collectFinalStateValues(run);
  let nextDocument: T | null = null;

  for (const stateKey of candidateKeys) {
    if (!Object.prototype.hasOwnProperty.call(document.state_schema, stateKey)) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(finalValues, stateKey)) {
      continue;
    }

    const nextValue = clonePlainValue(finalValues[stateKey]);
    const currentValue = document.state_schema[stateKey]?.value;
    if (arePlainValuesEqual(currentValue, nextValue)) {
      continue;
    }

    nextDocument ??= cloneGraphDocument(document) as T;
    nextDocument.state_schema[stateKey] = {
      ...nextDocument.state_schema[stateKey],
      value: nextValue,
    };
  }

  return nextDocument ?? document;
}

function collectGeneratedStateKeys(document: GraphPayload | GraphDocument, run: RunDetail) {
  const stateKeys = new Set<string>();

  for (const event of run.artifacts.state_events ?? []) {
    if (isNonInputStateWriter(document, event.node_id, event.state_key)) {
      stateKeys.add(event.state_key);
    }
  }

  for (const execution of run.node_executions ?? []) {
    for (const write of execution.artifacts.state_writes ?? []) {
      if (isNonInputStateWriter(document, execution.node_id, write.state_key)) {
        stateKeys.add(write.state_key);
      }
    }
  }

  for (const output of run.artifacts.exported_outputs ?? []) {
    if (output.source_kind === "state" && isStateWrittenByNonInputNode(document, output.source_key)) {
      stateKeys.add(output.source_key);
    }
  }

  return stateKeys;
}

function collectFinalStateValues(run: RunDetail) {
  const values: Record<string, unknown> = {
    ...(run.state_snapshot.values ?? {}),
    ...(run.artifacts.state_values ?? {}),
  };

  for (const output of run.artifacts.exported_outputs ?? []) {
    if (output.source_kind !== "state" || Object.prototype.hasOwnProperty.call(values, output.source_key)) {
      continue;
    }
    values[output.source_key] = output.value;
  }

  return values;
}

function isNonInputStateWriter(document: GraphPayload | GraphDocument, nodeId: string, stateKey: string) {
  const node = document.nodes[nodeId];
  return Boolean(node && node.kind !== "input" && node.writes.some((write) => write.state === stateKey));
}

function isStateWrittenByNonInputNode(document: GraphPayload | GraphDocument, stateKey: string) {
  return Object.values(document.nodes).some((node) => node.kind !== "input" && node.writes.some((write) => write.state === stateKey));
}

function clonePlainValue<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function arePlainValuesEqual(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return Object.is(left, right);
  }
}

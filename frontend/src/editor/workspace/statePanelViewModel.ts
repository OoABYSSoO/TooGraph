import type { GraphDocument, GraphPayload } from "@/types/node-system";

export type StatePanelRowViewModel = {
  key: string;
  title: string;
  description: string;
  typeLabel: string;
  valuePreview: string;
  color: string;
  readerCount: number;
  writerCount: number;
  bindingSummary: string;
  readers: StatePanelBindingViewModel[];
  writers: StatePanelBindingViewModel[];
};

export type StatePanelBindingViewModel = {
  nodeId: string;
  nodeLabel: string;
  nodeKindLabel: string;
  portLabel: string;
};

export type StatePanelViewModel = {
  count: number;
  rows: StatePanelRowViewModel[];
  emptyTitle: string;
  emptyBody: string;
};

export function buildStatePanelViewModel(document: GraphPayload | GraphDocument): StatePanelViewModel {
  const bindingsByState = summarizeBindingsByState(document);
  const rows = Object.entries(document.state_schema)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, state]) => ({
      key,
      title: state.name.trim() || key,
      description: state.description.trim(),
      typeLabel: state.type.trim() || "unknown",
      valuePreview: formatStateValue(state.value),
      color: state.color,
      readerCount: bindingsByState[key]?.readerCount ?? 0,
      writerCount: bindingsByState[key]?.writerCount ?? 0,
      bindingSummary: formatBindingSummary(bindingsByState[key]?.readerCount ?? 0, bindingsByState[key]?.writerCount ?? 0),
      readers: bindingsByState[key]?.readers ?? [],
      writers: bindingsByState[key]?.writers ?? [],
    }));

  return {
    count: rows.length,
    rows,
    emptyTitle: "No State Yet",
    emptyBody: "Graph state objects will appear here once the graph defines them.",
  };
}

function summarizeBindingsByState(document: GraphPayload | GraphDocument) {
  const summary = Object.entries(document.nodes).reduce<
    Record<string, { readerCount: number; writerCount: number; readers: StatePanelBindingViewModel[]; writers: StatePanelBindingViewModel[] }>
  >((acc, [nodeId, node]) => {
    const nodeLabel = node.name.trim() || nodeId;

    for (const read of node.reads) {
      const current = acc[read.state] ?? { readerCount: 0, writerCount: 0, readers: [], writers: [] };
      current.readerCount += 1;
      current.readers.push({
        nodeId,
        nodeLabel,
        nodeKindLabel: node.kind,
        portLabel: read.state,
      });
      acc[read.state] = current;
    }

    for (const write of node.writes) {
      const current = acc[write.state] ?? { readerCount: 0, writerCount: 0, readers: [], writers: [] };
      current.writerCount += 1;
      current.writers.push({
        nodeId,
        nodeLabel,
        nodeKindLabel: node.kind,
        portLabel: write.state,
      });
      acc[write.state] = current;
    }

    return acc;
  }, {});

  for (const entry of Object.values(summary)) {
    entry.readers.sort((left, right) => left.nodeLabel.localeCompare(right.nodeLabel) || left.nodeId.localeCompare(right.nodeId));
    entry.writers.sort((left, right) => left.nodeLabel.localeCompare(right.nodeLabel) || left.nodeId.localeCompare(right.nodeId));
  }

  return summary;
}

function formatBindingSummary(readerCount: number, writerCount: number) {
  const readerLabel = `${readerCount} ${readerCount === 1 ? "reader" : "readers"}`;
  const writerLabel = `${writerCount} ${writerCount === 1 ? "writer" : "writers"}`;
  return `${readerLabel} · ${writerLabel}`;
}

function formatStateValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim() || "Empty string";
  }
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "No default value";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

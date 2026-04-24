import type { GraphDocument, GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";
import { sortStateKeysByFirstAppearance } from "./stateOrdering.ts";

export type StatePanelTimelineEntryViewModel = {
  sequence: number;
  nodeId: string;
  nodeLabel: string;
  nodeKindLabel: string;
  outputKey: string;
  modeLabel: string;
  valuePreview: string;
  previousValuePreview: string | null;
  createdAtLabel: string | null;
};

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
  timelineStatus: "unavailable" | "empty" | "available";
  timelineSummary: string;
  timelineEmptyBody: string;
  timelineEntries: StatePanelTimelineEntryViewModel[];
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

export function buildStatePanelViewModel(document: GraphPayload | GraphDocument, run: RunDetail | null = null): StatePanelViewModel {
  const bindingsByState = summarizeBindingsByState(document);
  const timelinesByState = summarizeStateTimelines(document, run);
  const rows = sortStateKeysByFirstAppearance(Object.keys(document.state_schema), document)
    .map((key) => {
      const state = document.state_schema[key];
      const timeline = timelinesByState[key] ?? buildEmptyTimelineSummary(run);
      return {
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
        timelineStatus: timeline.status,
        timelineSummary: timeline.summary,
        timelineEmptyBody: timeline.emptyBody,
        timelineEntries: timeline.entries,
      };
    });

  return {
    count: rows.length,
    rows,
    emptyTitle: "No State Yet",
    emptyBody: "Graph state objects will appear here once the graph defines them.",
  };
}

type StateTimelineSummary = {
  status: "unavailable" | "empty" | "available";
  summary: string;
  emptyBody: string;
  entries: StatePanelTimelineEntryViewModel[];
};

type StateTimelineEvent = {
  stateKey: string;
  nodeId: string;
  outputKey: string;
  mode: string;
  value: unknown;
  createdAt: string | null;
};

function summarizeStateTimelines(document: GraphPayload | GraphDocument, run: RunDetail | null) {
  const events = collectStateTimelineEvents(run);
  const timelineByState: Record<string, StateTimelineSummary> = {};
  const nodeExecutionById = new Map(run?.node_executions.map((execution) => [execution.node_id, execution]) ?? []);

  for (const stateKey of Object.keys(document.state_schema)) {
    const stateEvents = events.filter((event) => event.stateKey === stateKey);
    if (stateEvents.length === 0) {
      timelineByState[stateKey] = buildEmptyTimelineSummary(run);
      continue;
    }

    const entries: StatePanelTimelineEntryViewModel[] = [];
    let previousValuePreview: string | null = null;

    for (const [index, event] of stateEvents.entries()) {
      const node = document.nodes[event.nodeId];
      const execution = nodeExecutionById.get(event.nodeId);
      const valuePreview = formatStateValue(event.value);
      entries.push({
        sequence: index + 1,
        nodeId: event.nodeId,
        nodeLabel: node?.name.trim() || event.nodeId,
        nodeKindLabel: node?.kind ?? execution?.node_type ?? "node",
        outputKey: event.outputKey,
        modeLabel: event.mode || "replace",
        valuePreview,
        previousValuePreview,
        createdAtLabel: formatTimelineTimestamp(event.createdAt),
      });
      previousValuePreview = valuePreview;
    }

    timelineByState[stateKey] = {
      status: "available",
      summary: `${entries.length} 次变更 · ${new Set(entries.map((entry) => entry.nodeId)).size} 个节点`,
      emptyBody: "",
      entries,
    };
  }

  return timelineByState;
}

function collectStateTimelineEvents(run: RunDetail | null): StateTimelineEvent[] {
  if (!run) {
    return [];
  }

  const stateEvents = run.artifacts.state_events ?? [];
  if (stateEvents.length > 0) {
    return stateEvents.map((event) => ({
      stateKey: event.state_key,
      nodeId: event.node_id,
      outputKey: event.output_key,
      mode: event.mode ?? "replace",
      value: event.value,
      createdAt: event.created_at ?? null,
    }));
  }

  return run.node_executions.flatMap((execution) =>
    execution.artifacts.state_writes.map((write) => ({
      stateKey: write.state_key,
      nodeId: execution.node_id,
      outputKey: write.output_key,
      mode: write.mode ?? "replace",
      value: write.value,
      createdAt: execution.finished_at ?? execution.started_at ?? null,
    })),
  );
}

function buildEmptyTimelineSummary(run: RunDetail | null): StateTimelineSummary {
  if (!run) {
    return {
      status: "unavailable",
      summary: "暂无运行",
      emptyBody: "还没有可回看的运行结果。",
      entries: [],
    };
  }

  return {
    status: "empty",
    summary: "上次运行未写入",
    emptyBody: "最近一次运行没有写入这个 state。",
    entries: [],
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

function formatTimelineTimestamp(createdAt: string | null) {
  if (!createdAt) {
    return null;
  }
  const trimmed = createdAt.trim();
  const match = trimmed.match(/T(\d{2}:\d{2}:\d{2})/);
  if (match) {
    return match[1];
  }
  return trimmed;
}

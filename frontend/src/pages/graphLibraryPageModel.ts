import type { GraphCatalogStatus, GraphDocument, TemplateRecord, TemplateSource } from "../types/node-system.ts";
import type { EvalRun, EvalSuite } from "../types/eval.ts";

export { buildGraphRevisionHistoryRows, type GraphRevisionHistoryRow } from "../lib/graphRevisionHistoryModel.ts";

export type GraphLibraryKindFilter = "all" | "graphs" | "templates";
export type GraphLibraryStatusFilter = "all" | GraphCatalogStatus;
export type GraphLibraryItemKind = "graph" | "template";

export type GraphLibraryItem = {
  id: string;
  kind: GraphLibraryItemKind;
  title: string;
  description: string;
  status: GraphCatalogStatus;
  source: TemplateSource;
  canManage: boolean;
  capabilityDiscoverable: boolean;
  canToggleCapabilityDiscoverable: boolean;
  capabilityDiscoverableBlockedReason: string;
  nodeCount: number;
  edgeCount: number;
  stateCount: number;
  galleryValue: string;
  targetUsersPreview: string;
  requiredActionsPreview: string;
  permissionsPreview: string;
  mockEntry: string;
  sampleOutput: string;
  evalCaseCount: number;
  latestEvalStatus: string;
  latestEvalRunId: string;
};

export type GraphLibraryTemplateEvalSummary = {
  suiteCount: number;
  caseCount: number;
  latestStatus: string;
  latestRunId: string;
};

export type GraphLibraryTemplateEvalSummaries = Record<string, GraphLibraryTemplateEvalSummary>;

export type GraphLibraryFilters = {
  query: string;
  kind: GraphLibraryKindFilter;
  status: GraphLibraryStatusFilter;
};

export type GraphLibraryOverview = {
  total: number;
  graphs: number;
  templates: number;
  officialTemplates: number;
  disabled: number;
};

export type GraphLibraryColumns = {
  templates: GraphLibraryItem[];
  graphs: GraphLibraryItem[];
};

export function buildGraphLibraryItems(
  graphs: GraphDocument[],
  templates: TemplateRecord[],
  templateEvalSummaries: GraphLibraryTemplateEvalSummaries = {},
): GraphLibraryItem[] {
  return [
    ...graphs.map((graph) => ({
      id: graph.graph_id,
      kind: "graph" as const,
      title: graph.name,
      description: readDescription(graph.metadata),
      status: graph.status ?? "active",
      source: "user" as const,
      canManage: true,
      capabilityDiscoverable: false,
      canToggleCapabilityDiscoverable: false,
      capabilityDiscoverableBlockedReason: "",
      nodeCount: Object.keys(graph.nodes).length,
      edgeCount: graph.edges.length + graph.conditional_edges.length,
      stateCount: Object.keys(graph.state_schema).length,
      ...emptyTemplateGalleryFields(),
    })),
    ...templates.map((template) => {
      const source = template.source ?? "official";
      const capabilityDiscoverableBlockedReason =
        template.capabilityDiscoverableBlockedReason || (template.hasBreakpointMetadata ? "breakpoint_metadata" : "");
      const evalSummary = templateEvalSummaries[template.template_id];
      return {
        id: template.template_id,
        kind: "template" as const,
        title: template.label,
        description: template.description,
        status: template.status ?? "active",
        source,
        canManage: source === "user",
        capabilityDiscoverable: template.status !== "disabled" && template.capabilityDiscoverable !== false,
        canToggleCapabilityDiscoverable: (template.status ?? "active") === "active" && !capabilityDiscoverableBlockedReason,
        capabilityDiscoverableBlockedReason,
        nodeCount: Object.keys(template.nodes).length,
        edgeCount: template.edges.length + template.conditional_edges.length,
        stateCount: Object.keys(template.state_schema).length,
        ...buildTemplateGalleryFields(template, evalSummary),
      };
    }),
  ];
}

export function buildGraphLibraryTemplateEvalSummaries(
  suites: Array<Pick<EvalSuite, "suite_id" | "target_template_id" | "case_count">>,
  runsBySuiteId: Record<string, Array<Pick<EvalRun, "eval_run_id" | "status"> & Partial<Pick<EvalRun, "created_at" | "updated_at" | "started_at">>>>,
): GraphLibraryTemplateEvalSummaries {
  const latestRunTimeByTemplate: Record<string, number> = {};
  const summaries: GraphLibraryTemplateEvalSummaries = {};
  for (const suite of suites) {
    const templateId = text(suite.target_template_id);
    if (!templateId) {
      continue;
    }
    const summary = summaries[templateId] ?? { suiteCount: 0, caseCount: 0, latestStatus: "", latestRunId: "" };
    summary.suiteCount += 1;
    summary.caseCount += Math.max(0, Number(suite.case_count || 0));
    const latestRun = runsBySuiteId[suite.suite_id]?.[0];
    if (latestRun) {
      const candidateTime = runTimestamp(latestRun);
      const currentTime = latestRunTimeByTemplate[templateId] ?? -1;
      if (!summary.latestRunId || candidateTime >= currentTime) {
        summary.latestStatus = text(latestRun.status);
        summary.latestRunId = text(latestRun.eval_run_id);
        latestRunTimeByTemplate[templateId] = candidateTime;
      }
    }
    summaries[templateId] = summary;
  }
  return summaries;
}

export function splitGraphLibraryItems(items: GraphLibraryItem[]): GraphLibraryColumns {
  return {
    templates: items.filter((item) => item.kind === "template"),
    graphs: items.filter((item) => item.kind === "graph"),
  };
}

export function filterGraphLibraryItems(items: GraphLibraryItem[], filters: GraphLibraryFilters): GraphLibraryItem[] {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.kind === "graphs" && item.kind !== "graph") {
      return false;
    }
    if (filters.kind === "templates" && item.kind !== "template") {
      return false;
    }
    if (filters.status !== "all" && item.status !== filters.status) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return buildSearchText(item).includes(normalizedQuery);
  });
}

export function buildGraphLibraryOverview(items: GraphLibraryItem[]): GraphLibraryOverview {
  return {
    total: items.length,
    graphs: items.filter((item) => item.kind === "graph").length,
    templates: items.filter((item) => item.kind === "template").length,
    officialTemplates: items.filter((item) => item.kind === "template" && item.source === "official").length,
    disabled: items.filter((item) => item.status === "disabled").length,
  };
}

function readDescription(metadata: Record<string, unknown>): string {
  const description = metadata.description;
  return typeof description === "string" ? description : "";
}

function buildSearchText(item: GraphLibraryItem): string {
  return [
    item.id,
    item.kind,
    item.title,
    item.description,
    item.status,
    item.source,
    item.canManage ? "manageable" : "readonly",
    item.galleryValue,
    item.targetUsersPreview,
    item.requiredActionsPreview,
    item.permissionsPreview,
    item.mockEntry,
    item.sampleOutput,
    item.latestEvalStatus,
  ]
    .join(" ")
    .toLowerCase();
}

function buildTemplateGalleryFields(
  template: TemplateRecord,
  evalSummary: GraphLibraryTemplateEvalSummary | undefined,
): Pick<
  GraphLibraryItem,
  | "galleryValue"
  | "targetUsersPreview"
  | "requiredActionsPreview"
  | "permissionsPreview"
  | "mockEntry"
  | "sampleOutput"
  | "evalCaseCount"
  | "latestEvalStatus"
  | "latestEvalRunId"
> {
  const metadata = template.metadata ?? {};
  const gallery = objectValue(metadata.gallery);
  const metadataEvalCaseCount = countMetadataEvalCases(metadata.evalCases);
  const evalCaseCount = evalSummary?.caseCount ?? metadataEvalCaseCount;
  return {
    galleryValue: text(gallery.valueProposition),
    targetUsersPreview: previewList(stringList(gallery.targetUsers), 3),
    requiredActionsPreview: previewList(stringList(metadata.requiredActions), 3),
    permissionsPreview: previewList(stringList(metadata.requiredPermissions || metadata.permissions), 4),
    mockEntry: readMockEntry(metadata, gallery),
    sampleOutput: readSampleOutput(metadata),
    evalCaseCount,
    latestEvalStatus: evalSummary?.latestStatus || (evalCaseCount > 0 ? "ready" : ""),
    latestEvalRunId: evalSummary?.latestRunId ?? "",
  };
}

function emptyTemplateGalleryFields(): Pick<
  GraphLibraryItem,
  | "galleryValue"
  | "targetUsersPreview"
  | "requiredActionsPreview"
  | "permissionsPreview"
  | "mockEntry"
  | "sampleOutput"
  | "evalCaseCount"
  | "latestEvalStatus"
  | "latestEvalRunId"
> {
  return {
    galleryValue: "",
    targetUsersPreview: "",
    requiredActionsPreview: "",
    permissionsPreview: "",
    mockEntry: "",
    sampleOutput: "",
    evalCaseCount: 0,
    latestEvalStatus: "",
    latestEvalRunId: "",
  };
}

function readMockEntry(metadata: Record<string, unknown>, gallery: Record<string, unknown>): string {
  const mockMode = objectValue(metadata.mockMode);
  return text(mockMode.input) || text(gallery.mockRun);
}

function readSampleOutput(metadata: Record<string, unknown>): string {
  const artifactPaths = arrayValue(metadata.artifactContract)
    .map((artifact) => text(objectValue(artifact).path))
    .filter(Boolean);
  if (artifactPaths.length > 0) {
    return compactPathList(artifactPaths);
  }
  const outputNames = arrayValue(metadata.outputContract)
    .map((output) => text(objectValue(output).name || objectValue(output).state || objectValue(output).source))
    .filter(Boolean);
  return compactPathList(outputNames);
}

function compactPathList(values: string[]): string {
  if (values.length === 0) {
    return "";
  }
  return values.length === 1 ? values[0] : `${values[0]} +${values.length - 1}`;
}

function countMetadataEvalCases(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  return text(value) ? 1 : 0;
}

function runTimestamp(run: Partial<Pick<EvalRun, "created_at" | "updated_at" | "started_at">>): number {
  const timestamp = text(run.created_at) || text(run.started_at) || text(run.updated_at);
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function previewList(values: string[], limit: number): string {
  const visible = values.slice(0, limit);
  const suffix = values.length > limit ? ` +${values.length - limit}` : "";
  return visible.join(", ") + suffix;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

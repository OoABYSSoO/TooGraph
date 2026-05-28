import type { GraphCatalogStatus, GraphDocument, TemplateRecord, TemplateSource } from "../types/node-system.ts";

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
};

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

export function buildGraphLibraryItems(graphs: GraphDocument[], templates: TemplateRecord[]): GraphLibraryItem[] {
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
        ...buildTemplateGalleryFields(template),
      };
    }),
  ];
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
  ]
    .join(" ")
    .toLowerCase();
}

function buildTemplateGalleryFields(template: TemplateRecord): Pick<
  GraphLibraryItem,
  | "galleryValue"
  | "targetUsersPreview"
  | "requiredActionsPreview"
  | "permissionsPreview"
  | "mockEntry"
  | "sampleOutput"
> {
  const metadata = template.metadata ?? {};
  const gallery = objectValue(metadata.gallery);
  return {
    galleryValue: text(gallery.valueProposition),
    targetUsersPreview: previewList(stringList(gallery.targetUsers), 3),
    requiredActionsPreview: previewList(stringList(metadata.requiredActions), 3),
    permissionsPreview: previewList(stringList(metadata.requiredPermissions || metadata.permissions), 4),
    mockEntry: readMockEntry(metadata, gallery),
    sampleOutput: readSampleOutput(metadata),
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
> {
  return {
    galleryValue: "",
    targetUsersPreview: "",
    requiredActionsPreview: "",
    permissionsPreview: "",
    mockEntry: "",
    sampleOutput: "",
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

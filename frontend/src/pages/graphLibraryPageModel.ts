import type { GraphCatalogStatus, GraphDocument, TemplateRecord, TemplateSource } from "../types/node-system.ts";

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
  nodeCount: number;
  edgeCount: number;
  stateCount: number;
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
      nodeCount: Object.keys(graph.nodes).length,
      edgeCount: graph.edges.length + graph.conditional_edges.length,
      stateCount: Object.keys(graph.state_schema).length,
    })),
    ...templates.map((template) => {
      const source = template.source ?? "official";
      return {
        id: template.template_id,
        kind: "template" as const,
        title: template.label,
        description: template.description,
        status: template.status ?? "active",
        source,
        canManage: source === "user",
        capabilityDiscoverable: template.status !== "disabled" && template.capabilityDiscoverable !== false,
        nodeCount: Object.keys(template.nodes).length,
        edgeCount: template.edges.length + template.conditional_edges.length,
        stateCount: Object.keys(template.state_schema).length,
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
  ]
    .join(" ")
    .toLowerCase();
}

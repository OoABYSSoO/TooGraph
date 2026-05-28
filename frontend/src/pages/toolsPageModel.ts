import type { ToolDefinition } from "../types/tools.ts";

export type ToolStatusFilter = "all" | "active" | "disabled";
export type ToolSourceFilter = "all" | "user" | "official";

export type ToolManagementFilters = {
  query: string;
  status: ToolStatusFilter;
  source: ToolSourceFilter;
};

export type ToolOverview = {
  total: number;
  active: number;
  visibleTools: number;
  userTools: number;
  officialTools: number;
};

export function buildToolStatusOptions(): ToolStatusFilter[] {
  return ["all", "active", "disabled"];
}

export function buildToolSourceOptions(): ToolSourceFilter[] {
  return ["all", "user", "official"];
}

export function filterToolsForManagement(tools: ToolDefinition[], filters: ToolManagementFilters): ToolDefinition[] {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return tools.filter((tool) => {
    if (!matchesToolStatus(tool, filters.status)) {
      return false;
    }
    if (!matchesToolSource(tool, filters.source)) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return buildToolSearchText(tool).includes(normalizedQuery);
  });
}

export function buildToolOverview(tools: ToolDefinition[]): ToolOverview {
  return {
    total: tools.length,
    active: tools.filter((tool) => tool.status === "active").length,
    visibleTools: tools.filter((tool) => tool.status === "active").length,
    userTools: tools.filter((tool) => tool.sourceScope === "user").length,
    officialTools: tools.filter((tool) => tool.sourceScope === "official").length,
  };
}

function matchesToolStatus(tool: ToolDefinition, filter: ToolStatusFilter): boolean {
  if (filter === "active") {
    return tool.status === "active";
  }
  if (filter === "disabled") {
    return tool.status === "disabled";
  }
  return true;
}

function matchesToolSource(tool: ToolDefinition, filter: ToolSourceFilter): boolean {
  if (filter === "user") {
    return tool.sourceScope === "user";
  }
  if (filter === "official") {
    return tool.sourceScope === "official";
  }
  return true;
}

function buildToolSearchText(tool: ToolDefinition): string {
  return [
    tool.toolKey,
    tool.name,
    tool.description,
    tool.version,
    tool.sourceScope,
    tool.sourcePath,
    tool.status,
    tool.runtime.type,
    tool.runtime.entrypoint,
    ...(tool.runtime.command ?? []),
    ...tool.permissions,
    ...tool.inputSchema.map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
    ...tool.outputSchema.map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
  ]
    .join(" ")
    .toLowerCase();
}

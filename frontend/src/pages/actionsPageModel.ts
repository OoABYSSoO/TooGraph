import type { ActionDefinition } from "../types/actions.ts";

export type ActionStatusFilter = "all" | "active" | "disabled";

export type ActionManagementFilters = {
  query: string;
  status: ActionStatusFilter;
};

export type ActionOverview = {
  total: number;
  active: number;
  visibleActions: number;
};

export function buildActionStatusOptions(): ActionStatusFilter[] {
  return ["all", "active", "disabled"];
}

export function filterActionsForManagement(
  actions: ActionDefinition[],
  filters: ActionManagementFilters,
): ActionDefinition[] {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return actions.filter((action) => {
    if (!matchesActionStatus(action, filters.status)) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return buildActionSearchText(action).includes(normalizedQuery);
  });
}

export function buildActionOverview(actions: ActionDefinition[]): ActionOverview {
  return {
    total: actions.length,
    active: actions.filter((action) => action.status === "active").length,
    visibleActions: actions.filter((action) => action.status === "active").length,
  };
}

function matchesActionStatus(action: ActionDefinition, filter: ActionStatusFilter): boolean {
  if (filter === "active") {
    return action.status === "active";
  }
  if (filter === "disabled") {
    return action.status === "disabled";
  }
  return true;
}

function buildActionSearchText(action: ActionDefinition): string {
  return [
    action.actionKey,
    action.name,
    action.description,
    action.llmInstruction,
    action.version,
    action.sourceScope,
    action.sourcePath,
    action.status,
    ...action.permissions,
    ...(action.stateInputSchema ?? []).map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
    ...action.llmOutputSchema.map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
    ...action.stateOutputSchema.map((field) => `${field.key} ${field.name} ${field.valueType} ${field.description}`),
  ]
    .join(" ")
    .toLowerCase();
}

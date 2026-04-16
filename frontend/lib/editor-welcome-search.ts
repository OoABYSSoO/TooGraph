import type { CanonicalTemplateRecord } from "@/lib/node-system-canonical";
import type { GraphSummary } from "@/lib/types";

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function includesQuery(parts: Array<string | null | undefined>, query: string) {
  if (!query) {
    return true;
  }
  return parts.some((part) => normalizeSearchText(part ?? "").includes(query));
}

export function filterWelcomeTemplates(templates: CanonicalTemplateRecord[], rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return templates;
  }

  return templates.filter((template) =>
    includesQuery([template.template_id, template.label, template.description], query),
  );
}

export function filterWelcomeGraphs(graphs: GraphSummary[], rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return graphs;
  }

  return graphs.filter((graph) => includesQuery([graph.graph_id, graph.name], query));
}

export function getEditorWelcomePanelClass() {
  return "rounded-[28px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.82)] p-6 min-h-0";
}

export function getEditorWelcomePanelBodyClass() {
  return "mt-4 min-h-0 flex-1 overflow-y-auto pr-1";
}

export function getEditorWelcomeCardGridClass() {
  return "grid grid-cols-1 gap-3 md:grid-cols-2";
}

export function getEditorWelcomeCardClass() {
  return "flex h-full flex-col rounded-[22px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.86)] p-4";
}

export function getEditorWelcomeTemplateDescriptionClass() {
  return "mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]";
}

export const EDITOR_WELCOME_SEARCH_DEBOUNCE_MS = 300;

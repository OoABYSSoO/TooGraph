import type {
  GraphCatalogStatus,
  GraphDeleteResponse,
  GraphDocument,
  GraphPayload,
  GraphRevisionContext,
  GraphRevisionRecord,
  GraphRevisionRestoreResponse,
  GraphRunResponse,
  GraphSaveResponse,
  GraphValidationResponse,
  TemplateDeleteResponse,
  TemplateSaveResponse,
  TemplateRecord,
} from "@/types/node-system";

import { apiDelete, apiGet, apiPost, apiPostText } from "./http.ts";

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export async function fetchTemplates(options: { includeDisabled?: boolean } = {}): Promise<TemplateRecord[]> {
  if (options.includeDisabled) {
    return apiGet<TemplateRecord[]>("/api/templates?include_disabled=true");
  }
  return apiGet<TemplateRecord[]>("/api/templates");
}

export async function fetchTemplate(templateId: string): Promise<TemplateRecord> {
  return apiGet<TemplateRecord>(`/api/templates/${encodePathSegment(templateId)}`);
}

export async function saveGraphAsTemplate(payload: GraphPayload): Promise<TemplateSaveResponse> {
  return apiPost("/api/templates/save", payload);
}

export async function updateTemplateStatus(templateId: string, status: GraphCatalogStatus): Promise<TemplateRecord> {
  const action = status === "active" ? "enable" : "disable";
  return apiPost<TemplateRecord>(`/api/templates/${encodePathSegment(templateId)}/${action}`, null);
}

export async function updateTemplateCapabilityDiscoverable(
  templateId: string,
  capabilityDiscoverable: boolean,
): Promise<TemplateRecord> {
  return apiPost<TemplateRecord>(`/api/templates/${encodePathSegment(templateId)}/capability-discoverable`, { capabilityDiscoverable });
}

export async function deleteTemplate(templateId: string): Promise<TemplateDeleteResponse> {
  return apiDelete<TemplateDeleteResponse>(`/api/templates/${encodePathSegment(templateId)}`);
}

export async function fetchGraphs(options: { includeDisabled?: boolean } = {}): Promise<GraphDocument[]> {
  if (options.includeDisabled) {
    return apiGet<GraphDocument[]>("/api/graphs?include_disabled=true");
  }
  return apiGet<GraphDocument[]>("/api/graphs");
}

export async function fetchGraph(graphId: string): Promise<GraphDocument> {
  return apiGet<GraphDocument>(`/api/graphs/${encodePathSegment(graphId)}`);
}

export async function fetchGraphRevisions(graphId: string): Promise<GraphRevisionRecord[]> {
  return apiGet<GraphRevisionRecord[]>(`/api/graphs/${encodePathSegment(graphId)}/revisions`);
}

export async function restoreGraphRevision(graphId: string, revisionId: string): Promise<GraphRevisionRestoreResponse> {
  return apiPost<GraphRevisionRestoreResponse>(
    `/api/graphs/${encodePathSegment(graphId)}/revisions/${encodePathSegment(revisionId)}/restore`,
    null,
  );
}

export async function saveGraph(
  payload: GraphPayload | GraphDocument,
  options: { revisionContext?: GraphRevisionContext } = {},
): Promise<GraphSaveResponse> {
  const requestPayload = options.revisionContext
    ? {
        ...payload,
        revision_context: options.revisionContext,
      }
    : payload;
  return apiPost("/api/graphs/save", requestPayload);
}

export async function updateGraphStatus(graphId: string, status: GraphCatalogStatus): Promise<GraphDocument> {
  const action = status === "active" ? "enable" : "disable";
  return apiPost<GraphDocument>(`/api/graphs/${encodePathSegment(graphId)}/${action}`, null);
}

export async function deleteGraph(graphId: string): Promise<GraphDeleteResponse> {
  return apiDelete<GraphDeleteResponse>(`/api/graphs/${encodePathSegment(graphId)}`);
}

export async function validateGraph(payload: GraphPayload): Promise<GraphValidationResponse> {
  return apiPost("/api/graphs/validate", payload);
}

export async function runGraph(payload: GraphPayload): Promise<GraphRunResponse> {
  return apiPost("/api/graphs/run", payload);
}

export async function exportLangGraphPython(payload: GraphPayload): Promise<string> {
  return apiPostText("/api/graphs/export/langgraph-python", payload);
}

export async function importGraphFromPythonSource(source: string): Promise<GraphPayload> {
  return apiPost("/api/graphs/import/python", { source });
}

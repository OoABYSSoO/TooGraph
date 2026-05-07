import type {
  GraphDocument,
  GraphPayload,
  GraphRunResponse,
  GraphSaveResponse,
  GraphValidationResponse,
  TemplateSaveResponse,
  TemplateRecord,
} from "@/types/node-system";

import { apiGet, apiPost, apiPostText } from "./http.ts";

export async function fetchTemplates(): Promise<TemplateRecord[]> {
  return apiGet<TemplateRecord[]>("/api/templates");
}

export async function fetchTemplate(templateId: string): Promise<TemplateRecord> {
  return apiGet<TemplateRecord>(`/api/templates/${templateId}`);
}

export async function saveGraphAsTemplate(payload: GraphPayload): Promise<TemplateSaveResponse> {
  return apiPost("/api/templates/save", payload);
}

export async function fetchGraphs(): Promise<GraphDocument[]> {
  return apiGet<GraphDocument[]>("/api/graphs");
}

export async function fetchGraph(graphId: string): Promise<GraphDocument> {
  return apiGet<GraphDocument>(`/api/graphs/${graphId}`);
}

export async function saveGraph(payload: GraphPayload): Promise<GraphSaveResponse> {
  return apiPost("/api/graphs/save", payload);
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

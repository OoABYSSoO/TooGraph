import type {
  GraphDocument,
  GraphPayload,
  GraphRunResponse,
  GraphSaveResponse,
  GraphValidationResponse,
  TemplateRecord,
} from "@/types/node-system";

import { apiGet } from "./http";

const API_BASE = "http://127.0.0.1:8765";

export async function fetchTemplates(): Promise<TemplateRecord[]> {
  return apiGet<TemplateRecord[]>("/api/templates");
}

export async function fetchTemplate(templateId: string): Promise<TemplateRecord> {
  return apiGet<TemplateRecord>(`/api/templates/${templateId}`);
}

export async function fetchGraphs(): Promise<GraphDocument[]> {
  return apiGet<GraphDocument[]>("/api/graphs");
}

export async function fetchGraph(graphId: string): Promise<GraphDocument> {
  return apiGet<GraphDocument>(`/api/graphs/${graphId}`);
}

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
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

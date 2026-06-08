import { apiGet, apiPost } from "./http.ts";

export type KnowledgeIndexingOperation = {
  operation_id: string;
  collection_id: string;
  source_root: string;
  template_id: string;
  ingestion_run_id: string;
  embedding_run_ids: string[];
  status: string;
  stage: string;
  last_error_type: string;
  last_error: string;
  next_retry_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string;
  metadata: Record<string, unknown>;
};

export type KnowledgeBase = {
  collection_id: string;
  name: string;
  source_root: string;
  original_path: string;
  template_id: string;
  document_count: number;
  chunk_count: number;
  embedding_job_count: number;
  completed_embedding_job_count: number;
  pending_embedding_job_count: number;
  running_embedding_job_count: number;
  retry_wait_embedding_job_count: number;
  failed_embedding_job_count: number;
  blocked_embedding_job_count: number;
  embedding_vector_count: number;
  indexing_status: string;
  last_error_type: string;
  last_error: string;
  next_retry_at: string;
  current_operation: KnowledgeIndexingOperation | null;
  last_run_id: string;
  imported_at: string;
  updated_at: string;
};

export type KnowledgeBaseListResponse = {
  bases: KnowledgeBase[];
};

export type KnowledgeOperationActionResponse = KnowledgeBase;

export type LocalFolderPackage = {
  kind: "local_folder";
  root: string;
  selection_mode: "all" | "selected";
  selected: string[];
};

export type KnowledgeFolderImportRequest = {
  name: string;
  source_path: string;
  collection_id?: string | null;
  template_id?: string;
};

export type KnowledgeFolderImportResponse = {
  knowledge_base: KnowledgeBase;
  folder_package: LocalFolderPackage;
  operation: KnowledgeIndexingOperation;
};

export type KnowledgeRunRecordRequest = {
  run_id: string;
  template_id?: string | null;
  operation_id?: string | null;
};

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export async function fetchKnowledgeBases(): Promise<KnowledgeBaseListResponse> {
  return apiGet<KnowledgeBaseListResponse>("/api/knowledge/bases");
}

export async function importKnowledgeFolder(payload: KnowledgeFolderImportRequest): Promise<KnowledgeFolderImportResponse> {
  return apiPost<KnowledgeFolderImportResponse>("/api/knowledge/imports/folder", payload);
}

export async function recordKnowledgeBaseRun(collectionId: string, payload: KnowledgeRunRecordRequest): Promise<KnowledgeBase> {
  return apiPost<KnowledgeBase>(`/api/knowledge/bases/${encodePathSegment(collectionId)}/runs`, payload);
}

export async function retryKnowledgeOperation(collectionId: string, operationId: string): Promise<KnowledgeOperationActionResponse> {
  return apiPost<KnowledgeOperationActionResponse>(
    `/api/knowledge/bases/${encodePathSegment(collectionId)}/operations/${encodePathSegment(operationId)}/retry`,
    {},
  );
}

export async function pauseKnowledgeOperation(collectionId: string, operationId: string): Promise<KnowledgeOperationActionResponse> {
  return apiPost<KnowledgeOperationActionResponse>(
    `/api/knowledge/bases/${encodePathSegment(collectionId)}/operations/${encodePathSegment(operationId)}/pause`,
    {},
  );
}

export async function resumeKnowledgeOperation(collectionId: string, operationId: string): Promise<KnowledgeOperationActionResponse> {
  return apiPost<KnowledgeOperationActionResponse>(
    `/api/knowledge/bases/${encodePathSegment(collectionId)}/operations/${encodePathSegment(operationId)}/resume`,
    {},
  );
}

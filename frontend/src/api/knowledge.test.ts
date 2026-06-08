import assert from "node:assert/strict";
import test from "node:test";

import { fetchKnowledgeBases, importKnowledgeFolder } from "./knowledge.ts";

const originalFetch = globalThis.fetch;

test("knowledge API lists managed knowledge bases from the new knowledge endpoint", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        bases: [
          {
            collection_id: "xian_policy",
            name: "Xian policy",
            source_root: "knowledge/xian_policy/source",
            original_path: "knowledge/raw/xian",
            template_id: "knowledge_folder_retrieval_ingestion",
            document_count: 2,
            chunk_count: 8,
            embedding_job_count: 8,
            completed_embedding_job_count: 5,
            embedding_vector_count: 5,
            pending_embedding_job_count: 3,
            running_embedding_job_count: 0,
            retry_wait_embedding_job_count: 0,
            failed_embedding_job_count: 0,
            blocked_embedding_job_count: 0,
            indexing_status: "indexing",
            last_error_type: "",
            last_error: "",
            next_retry_at: "",
            current_operation: null,
            last_run_id: "run_knowledge",
            imported_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:00Z",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const response = await fetchKnowledgeBases();

    assert.equal(requestedUrl, "/api/knowledge/bases");
    assert.equal(response.bases[0]?.collection_id, "xian_policy");
    assert.equal(response.bases[0]?.indexing_status, "indexing");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("knowledge API imports a local folder into a managed source package", async () => {
  let requestedUrl = "";
  let requestBody = "";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        knowledge_base: {
          collection_id: "xian_policy",
          name: "Xian policy",
          source_root: "knowledge/xian_policy/source",
          original_path: "C:/policy/xian",
          template_id: "knowledge_folder_retrieval_ingestion",
          document_count: 0,
          chunk_count: 0,
          embedding_job_count: 0,
          completed_embedding_job_count: 0,
          embedding_vector_count: 0,
          pending_embedding_job_count: 0,
          running_embedding_job_count: 0,
          retry_wait_embedding_job_count: 0,
          failed_embedding_job_count: 0,
          blocked_embedding_job_count: 0,
          indexing_status: "ingesting",
          last_error_type: "",
          last_error: "",
          next_retry_at: "",
          current_operation: {
            operation_id: "kop_xian",
            collection_id: "xian_policy",
            source_root: "knowledge/xian_policy/source",
            template_id: "knowledge_folder_retrieval_ingestion",
            ingestion_run_id: "",
            embedding_run_ids: [],
            status: "ingesting",
            stage: "source_imported",
            last_error_type: "",
            last_error: "",
            next_retry_at: "",
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:00Z",
            completed_at: "",
            metadata: { original_path: "C:/policy/xian" },
          },
          last_run_id: "",
          imported_at: "2026-06-07T00:00:00Z",
          updated_at: "2026-06-07T00:00:00Z",
        },
        folder_package: {
          kind: "local_folder",
          root: "knowledge/xian_policy/source",
          selection_mode: "all",
          selected: [],
        },
        operation: {
          operation_id: "kop_xian",
          collection_id: "xian_policy",
          source_root: "knowledge/xian_policy/source",
          template_id: "knowledge_folder_retrieval_ingestion",
          ingestion_run_id: "",
          embedding_run_ids: [],
          status: "ingesting",
          stage: "source_imported",
          last_error_type: "",
          last_error: "",
          next_retry_at: "",
          created_at: "2026-06-07T00:00:00Z",
          updated_at: "2026-06-07T00:00:00Z",
          completed_at: "",
          metadata: { original_path: "C:/policy/xian" },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const response = await importKnowledgeFolder({
      name: "Xian policy",
      source_path: "C:/policy/xian",
      template_id: "knowledge_folder_retrieval_ingestion",
    });

    assert.equal(requestedUrl, "/api/knowledge/imports/folder");
    assert.deepEqual(JSON.parse(requestBody), {
      name: "Xian policy",
      source_path: "C:/policy/xian",
      template_id: "knowledge_folder_retrieval_ingestion",
    });
    assert.equal(response.folder_package.root, "knowledge/xian_policy/source");
    assert.equal(response.knowledge_base.current_operation?.stage, "source_imported");
    assert.equal(response.operation.status, "ingesting");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database


class EmbeddingStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        data_dir = Path(self._temp_dir.name) / "data"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", data_dir),
            patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
        ]
        for patcher in self._patchers:
            patcher.start()
        database.initialize_storage()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._temp_dir.cleanup()

    def test_register_embedding_model_records_provider_model_dimension_and_metric(self) -> None:
        from app.core.storage.embedding_store import register_embedding_model

        model = register_embedding_model(
            provider_key="openai",
            model="text-embedding-3-small",
            dimensions=8,
            distance_metric="cosine",
            metadata={"normalized": True},
        )

        self.assertTrue(model["embedding_model_id"].startswith("emodel_"))
        self.assertEqual(model["provider_key"], "openai")
        self.assertEqual(model["model"], "text-embedding-3-small")
        self.assertEqual(model["dimensions"], 8)
        self.assertEqual(model["distance_metric"], "cosine")
        self.assertEqual(model["metadata"]["normalized"], True)

    def test_upsert_embedding_vector_deduplicates_by_chunk_model_and_content_hash(self) -> None:
        from app.core.storage.embedding_store import register_embedding_model, upsert_embedding_vector
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
        document = upsert_retrieval_document(source_kind="buddy_message", source_id="msg_1")
        [chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_1", "content": "Refund audit evidence."}],
        )

        first = upsert_embedding_vector(
            chunk_id=chunk["chunk_id"],
            model_ref=model["embedding_model_id"],
            vector=[1.0, 0.0, 0.0],
            content_hash=chunk["content_hash"],
        )
        second = upsert_embedding_vector(
            chunk_id=chunk["chunk_id"],
            model_ref=model["embedding_model_id"],
            vector=[1.0, 0.0, 0.0],
            content_hash=chunk["content_hash"],
        )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            count = connection.execute("SELECT COUNT(*) FROM embedding_vectors").fetchone()[0]

        self.assertEqual(first["embedding_id"], second["embedding_id"])
        self.assertEqual(count, 1)

    def test_embedding_jobs_support_lifecycle_status_and_error_recording(self) -> None:
        from app.core.storage.embedding_store import (
            queue_embedding_job,
            register_embedding_model,
            update_embedding_job_status,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
        document = upsert_retrieval_document(source_kind="graph_output", source_id="output_1")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_job", "content": "Graph output to embed."}],
        )

        [job] = queue_embedding_job("graph_output", "output_1", model["embedding_model_id"])
        running = update_embedding_job_status(job["job_id"], "running")
        failed = update_embedding_job_status(job["job_id"], "failed", error="provider unavailable")
        completed = update_embedding_job_status(job["job_id"], "completed")

        self.assertEqual(job["status"], "pending")
        self.assertEqual(running["status"], "running")
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["last_error"], "provider unavailable")
        self.assertEqual(completed["status"], "completed")
        self.assertTrue(completed["completed_at"])

    def test_process_pending_embedding_jobs_uses_provider_vectors_and_completes_jobs(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
            search_embedding_vectors,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
        document = upsert_retrieval_document(source_kind="memory_entry", source_id="mem_job")
        [chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_memory_job", "content": "Embedding processor should index memory recall content."}],
        )
        [job] = queue_embedding_job("memory_entry", "mem_job", model["embedding_model_id"])

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([1.0, 0.0, 0.0], {"provider_id": "openai", "model": "text-embedding-3-small"}),
        ) as embed:
            report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10)

        embed.assert_called_once_with(
            model_ref="openai/text-embedding-3-small",
            text="Embedding processor should index memory recall content.",
            dimensions=3,
        )
        results = search_embedding_vectors(
            [1.0, 0.0, 0.0],
            {"embedding_model_ref": model["embedding_model_id"], "source_kind": "memory_entry"},
            limit=1,
        )

        self.assertEqual(report["completed_count"], 1)
        self.assertEqual(report["failed_count"], 0)
        self.assertEqual(report["processed_jobs"][0]["job_id"], job["job_id"])
        self.assertEqual(report["processed_jobs"][0]["status"], "completed")
        self.assertEqual(report["processed_jobs"][0]["chunk_id"], chunk["chunk_id"])
        self.assertNotIn("query_vector", report["processed_jobs"][0])
        self.assertEqual(results[0]["chunk_id"], chunk["chunk_id"])

    def test_process_pending_embedding_jobs_uses_provider_vectors_for_external_models(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
            search_embedding_vectors,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
        document = upsert_retrieval_document(source_kind="memory_entry", source_id="mem_provider_job")
        [chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_provider_memory", "content": "Provider embedding content."}],
        )
        [job] = queue_embedding_job("memory_entry", "mem_provider_job", model["embedding_model_id"])

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.0, 1.0, 0.0], {"provider_id": "openai", "model": "text-embedding-3-small"}),
        ) as embed:
            report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10)

        embed.assert_called_once_with(
            model_ref="openai/text-embedding-3-small",
            text="Provider embedding content.",
            dimensions=3,
        )
        results = search_embedding_vectors(
            [0.0, 1.0, 0.0],
            {"embedding_model_ref": model["embedding_model_id"], "source_kind": "memory_entry"},
            limit=1,
        )

        self.assertEqual(report["completed_count"], 1)
        self.assertEqual(report["failed_count"], 0)
        self.assertEqual(report["processed_jobs"][0]["job_id"], job["job_id"])
        self.assertEqual(report["processed_jobs"][0]["status"], "completed")
        self.assertEqual(report["processed_jobs"][0]["chunk_id"], chunk["chunk_id"])
        self.assertEqual(results[0]["chunk_id"], chunk["chunk_id"])

    def test_process_pending_embedding_jobs_reports_failed_status_when_provider_errors(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="buddy_message", source_id="session_1:msg_1:msg_1")
        [chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_failed_provider", "content": "Provider failure should be visible."}],
        )
        [job] = queue_embedding_job("buddy_message", "session_1:msg_1:msg_1", model["embedding_model_id"])

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            side_effect=RuntimeError("provider offline"),
        ):
            report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10)

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            job_row = connection.execute(
                "SELECT status, last_error FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()
            vector_count = connection.execute(
                "SELECT COUNT(*) FROM embedding_vectors WHERE chunk_id = ?",
                (chunk["chunk_id"],),
            ).fetchone()[0]

        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["processed_count"], 1)
        self.assertEqual(report["completed_count"], 0)
        self.assertEqual(report["failed_count"], 1)
        self.assertEqual(report["processed_jobs"][0]["status"], "failed")
        self.assertIn("provider offline", report["processed_jobs"][0]["error"])
        self.assertEqual(job_row[0], "failed")
        self.assertIn("provider offline", job_row[1])
        self.assertEqual(vector_count, 0)

    def test_search_embedding_vectors_uses_application_cosine_similarity(self) -> None:
        from app.core.storage.embedding_store import (
            register_embedding_model,
            search_embedding_vectors,
            upsert_embedding_vector,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
        document = upsert_retrieval_document(source_kind="memory_entry", source_id="mem_1")
        chunks = upsert_retrieval_chunks(
            document["document_id"],
            [
                {"chunk_id": "chunk_refund", "content": "Refund policy preference."},
                {"chunk_id": "chunk_release", "content": "Release notes preference."},
            ],
        )
        upsert_embedding_vector("chunk_refund", model["embedding_model_id"], [1.0, 0.0, 0.0], chunks[0]["content_hash"])
        upsert_embedding_vector("chunk_release", model["embedding_model_id"], [0.0, 1.0, 0.0], chunks[1]["content_hash"])

        results = search_embedding_vectors([0.95, 0.05, 0.0], {"source_kind": "memory_entry"}, limit=2)

        self.assertEqual([result["chunk_id"] for result in results], ["chunk_refund", "chunk_release"])
        self.assertGreater(results[0]["score"], results[1]["score"])
        self.assertEqual(results[0]["retrieval"]["mode"], "vector")

    def test_hybrid_search_uses_provider_query_vector_and_records_audit(self) -> None:
        from app.core.storage.embedding_store import (
            register_embedding_model,
            upsert_embedding_vector,
        )
        from app.core.storage.retrieval_store import hybrid_search, upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
        document = upsert_retrieval_document(source_kind="buddy_message", source_id="msg_hybrid")
        chunks = upsert_retrieval_chunks(
            document["document_id"],
            [
                {
                    "chunk_id": "chunk_refund",
                    "content": "Refund audit requires support ticket evidence.",
                    "metadata": {"topic": "refund", "recency_boost": 0.2},
                },
                {
                    "chunk_id": "chunk_release",
                    "content": "Release note migration checklist.",
                    "metadata": {"topic": "release", "recency_boost": 0.9},
                },
            ],
        )
        upsert_embedding_vector(
            "chunk_refund",
            model["embedding_model_id"],
            [1.0, 0.0, 0.0],
            chunks[0]["content_hash"],
        )
        upsert_embedding_vector(
            "chunk_release",
            model["embedding_model_id"],
            [0.0, 1.0, 0.0],
            chunks[1]["content_hash"],
        )

        with patch(
            "app.core.storage.retrieval_store.embed_text_with_model_ref",
            return_value=([1.0, 0.0, 0.0], {"provider_id": "openai", "model": "text-embedding-3-small"}),
        ) as embed:
            results = hybrid_search(
                "refund audit",
                filters={"source_kind": "buddy_message", "metadata_filter": {"topic": "refund"}},
                embedding_model_ref=model["embedding_model_id"],
                limit=5,
            )

        embed.assert_called_once_with(
            model_ref="openai/text-embedding-3-small",
            text="refund audit",
            dimensions=3,
        )

        self.assertEqual([result["chunk_id"] for result in results], ["chunk_refund"])
        self.assertEqual(results[0]["retrieval"]["mode"], "hybrid")
        self.assertGreater(results[0]["retrieval"]["vector_score"], 0)
        self.assertGreater(results[0]["retrieval"]["lexical_score"], 0)
        self.assertGreater(results[0]["retrieval"]["recency_boost"], 0)

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            query_row = connection.execute("SELECT query_id, query_text FROM retrieval_queries").fetchone()
            result_row = connection.execute(
                "SELECT chunk_id, source_ref_json FROM retrieval_results WHERE query_id = ?",
                (query_row[0],),
            ).fetchone()

        self.assertEqual(query_row[1], "refund audit")
        self.assertEqual(result_row[0], "chunk_refund")
        self.assertEqual(json.loads(result_row[1])["source_kind"], "buddy_message")

    def test_hybrid_search_uses_reranker_model_and_records_rerank_audit(self) -> None:
        from app.core.storage.retrieval_store import hybrid_search, load_retrieval_ranking_report, upsert_retrieval_chunks, upsert_retrieval_document

        document = upsert_retrieval_document(source_kind="buddy_message", source_id="msg_rerank")
        upsert_retrieval_chunks(
            document["document_id"],
            [
                {
                    "chunk_id": "chunk_base_first",
                    "content": "Refund audit checklist evidence from an older thread.",
                },
                {
                    "chunk_id": "chunk_reranked_first",
                    "content": "Refund audit checklist evidence with the exact current preference.",
                },
            ],
        )

        def fake_rerank(**kwargs):
            self.assertEqual(kwargs["model_ref"], "local-rerank/bge-reranker-v2")
            self.assertEqual(kwargs["query"], "refund audit checklist")
            self.assertEqual(kwargs["top_n"], 2)
            self.assertEqual(len(kwargs["documents"]), 2)
            return [
                {"index": 1, "score": 0.96, "document": kwargs["documents"][1]},
                {"index": 0, "score": 0.42, "document": kwargs["documents"][0]},
            ], {
                "provider_id": "local-rerank",
                "model": "bge-reranker-v2",
                "provider_fallback_used": False,
            }

        with patch("app.core.storage.retrieval_store.rerank_documents_with_model_ref", side_effect=fake_rerank):
            results = hybrid_search(
                "refund audit checklist",
                filters={"source_kind": "buddy_message"},
                reranker_model_ref="local-rerank/bge-reranker-v2",
                limit=2,
            )

        self.assertEqual([result["chunk_id"] for result in results], ["chunk_reranked_first", "chunk_base_first"])
        self.assertEqual(results[0]["retrieval"]["mode"], "hybrid_rerank")
        self.assertEqual(results[0]["retrieval"]["rerank_score"], 0.96)
        self.assertGreater(results[0]["retrieval"]["pre_rerank_score"], 0)
        self.assertEqual(results[0]["score"], 0.96)

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            query_row = connection.execute("SELECT query_id, reranker_model_ref FROM retrieval_queries").fetchone()
            result_rows = connection.execute(
                "SELECT chunk_id, rerank_score, base_score, final_score FROM retrieval_results WHERE query_id = ? ORDER BY rank ASC",
                (query_row[0],),
            ).fetchall()

        self.assertEqual(query_row[1], "local-rerank/bge-reranker-v2")
        self.assertEqual(result_rows[0][0], "chunk_reranked_first")
        self.assertEqual(result_rows[0][1], 0.96)
        self.assertGreater(result_rows[0][2], 0)
        self.assertEqual(result_rows[0][3], 0.96)
        report = load_retrieval_ranking_report(query_row[0])
        self.assertEqual(report["reranker_model_ref"], "local-rerank/bge-reranker-v2")
        self.assertEqual(report["ranking_metadata"]["rerank"]["status"], "succeeded")
        self.assertEqual(report["ranked_results"][0]["rerank_score"], 0.96)


if __name__ == "__main__":
    unittest.main()

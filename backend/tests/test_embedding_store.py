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

    def _insert_knowledge_indexing_operation(self, operation_id: str, *, status: str = "paused") -> None:
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            connection.execute(
                """
                INSERT INTO knowledge_indexing_operations (
                    operation_id, collection_id, source_root, template_id,
                    status, stage, created_at, updated_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    operation_id,
                    "policy_qa",
                    "knowledge/policy_qa/source",
                    "knowledge_folder_retrieval_ingestion",
                    status,
                    "user_paused" if status == "paused" else "embedding_queued",
                    "2026-06-08T00:00:00Z",
                    "2026-06-08T00:00:00Z",
                    "{}",
                ),
            )
            connection.commit()

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

    def test_sync_default_embedding_model_records_dimensions_source_metadata(self) -> None:
        from app.core.storage.embedding_model_sync import sync_default_embedding_model_from_settings

        configured_model = sync_default_embedding_model_from_settings(
            {
                "embedding_model_ref": "local/configured-embedding",
                "model_providers": {
                    "local": {
                        "label": "Local Provider",
                        "models": [
                            {
                                "model": "configured-embedding",
                                "label": "Configured Embedding",
                                "capabilities": {"embedding": True},
                                "embedding": {"dimensions": 4096},
                            }
                        ],
                    }
                },
            }
        )
        default_model = sync_default_embedding_model_from_settings(
            {
                "embedding_model_ref": "local/default-embedding",
                "model_providers": {
                    "local": {
                        "label": "Local Provider",
                        "models": [
                            {
                                "model": "default-embedding",
                                "label": "Default Embedding",
                                "capabilities": {"embedding": True},
                                "embedding": {},
                            }
                        ],
                    }
                },
            }
        )

        self.assertEqual(configured_model["dimensions"], 4096)
        self.assertEqual(configured_model["metadata"]["dimensions_source"], "configured")
        self.assertEqual(configured_model["metadata"]["source"], "model_providers.default_embedding_model_ref")
        self.assertEqual(configured_model["metadata"]["model_ref"], "local/configured-embedding")
        self.assertEqual(configured_model["metadata"]["provider_label"], "Local Provider")
        self.assertEqual(configured_model["metadata"]["model_label"], "Configured Embedding")
        self.assertEqual(default_model["dimensions"], 384)
        self.assertEqual(default_model["metadata"]["dimensions_source"], "default")

    def test_default_embedding_model_sync_preserves_probed_dimensions_when_vectors_exist(self) -> None:
        from app.core.storage.embedding_model_sync import sync_default_embedding_model_from_settings
        from app.core.storage.embedding_store import register_embedding_model, upsert_embedding_vector
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        settings = {
            "embedding_model_ref": "local/probed-embedding",
            "model_providers": {
                "local": {
                    "label": "Local Provider",
                    "models": [
                        {
                            "model": "probed-embedding",
                            "label": "Probed Embedding",
                            "capabilities": {"embedding": True},
                            "embedding": {},
                        }
                    ],
                }
            },
        }
        model = register_embedding_model(
            provider_key="local",
            model="probed-embedding",
            dimensions=4096,
            metadata={"dimensions_source": "provider_probe", "source": "previous_probe"},
        )
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_probed_sync")
        [chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_probed_sync", "content": "Do not reset probed dimensions."}],
        )
        upsert_embedding_vector(
            chunk["chunk_id"],
            model["embedding_model_id"],
            [0.0] * 4096,
            chunk["content_hash"],
        )

        synced = sync_default_embedding_model_from_settings(settings)

        self.assertEqual(synced["dimensions"], 4096)
        self.assertEqual(synced["metadata"]["dimensions_source"], "provider_probe")
        self.assertEqual(synced["metadata"]["source"], "model_providers.default_embedding_model_ref")
        self.assertEqual(synced["metadata"]["model_ref"], "local/probed-embedding")
        self.assertEqual(synced["metadata"]["provider_label"], "Local Provider")
        self.assertEqual(synced["metadata"]["model_label"], "Probed Embedding")

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

    def test_queue_embedding_job_skips_chunks_that_already_have_vectors(self) -> None:
        from app.core.storage.embedding_store import (
            queue_embedding_job,
            register_embedding_model,
            update_embedding_job_status,
            upsert_embedding_vector,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_policy")
        [chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_policy", "content": "Policy content that already has an embedding."}],
        )
        [job] = queue_embedding_job("knowledge_document", "doc_policy", model["embedding_model_id"])
        upsert_embedding_vector(
            chunk_id=chunk["chunk_id"],
            model_ref=model["embedding_model_id"],
            vector=[1.0, 0.0, 0.0],
            content_hash=chunk["content_hash"],
        )
        update_embedding_job_status(job["job_id"], "completed")

        repeated_jobs = queue_embedding_job("knowledge_document", "doc_policy", model["embedding_model_id"])

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            job_row = connection.execute(
                "SELECT status, completed_at FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()
            vector_count = connection.execute(
                "SELECT COUNT(*) FROM embedding_vectors WHERE chunk_id = ?",
                (chunk["chunk_id"],),
            ).fetchone()[0]

        self.assertEqual(repeated_jobs, [])
        self.assertEqual(job_row[0], "completed")
        self.assertTrue(job_row[1])
        self.assertEqual(vector_count, 1)

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

    def test_embedding_processor_updates_default_model_dimensions_from_provider_vector_and_repairs_blocked_jobs(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
            resolve_embedding_model,
            update_embedding_job_status,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(
            provider_key="local",
            model="test-embedding",
            dimensions=384,
            metadata={"dimensions_source": "default", "source": "test"},
        )
        other_model = register_embedding_model(provider_key="local", model="other-embedding", dimensions=384)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_probe_dimensions")
        upsert_retrieval_chunks(
            document["document_id"],
            [
                {"chunk_id": "chunk_probe_pending", "content": "Probe provider dimensions."},
                {"chunk_id": "chunk_probe_blocked", "content": "Blocked mismatch should be repaired."},
                {"chunk_id": "chunk_probe_other_blocked", "content": "Other blocked type should stay blocked."},
                {"chunk_id": "chunk_probe_paused_blocked", "content": "Paused blocked mismatch should stay paused."},
                {"chunk_id": "chunk_probe_stale_blocked", "content": "Stale blocked mismatch should not become pending."},
            ],
        )
        jobs = queue_embedding_job("knowledge_document", "doc_probe_dimensions", model["embedding_model_id"])
        jobs_by_chunk = {job["chunk_id"]: job for job in jobs}
        update_embedding_job_status(
            jobs_by_chunk["chunk_probe_blocked"]["job_id"],
            "blocked",
            error="Expected 384 embedding dimensions, got 4096.",
            error_type="embedding_dimension_mismatch",
            next_retry_at="2999-01-01T00:00:00Z",
            lease_expires_at="2999-01-01T00:15:00Z",
        )
        repaired_operation_id = "kop_probe_repaired"
        self._insert_knowledge_indexing_operation(repaired_operation_id, status="embedding")
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            connection.execute(
                "UPDATE embedding_jobs SET operation_id = ? WHERE job_id = ?",
                (repaired_operation_id, jobs_by_chunk["chunk_probe_blocked"]["job_id"]),
            )
            connection.commit()
        update_embedding_job_status(
            jobs_by_chunk["chunk_probe_other_blocked"]["job_id"],
            "blocked",
            error="model unavailable",
            error_type="embedding_model_unavailable",
            next_retry_at="2999-01-01T00:00:00Z",
            lease_expires_at="2999-01-01T00:15:00Z",
        )
        paused_operation_id = "kop_probe_paused"
        self._insert_knowledge_indexing_operation(paused_operation_id, status="paused")
        update_embedding_job_status(
            jobs_by_chunk["chunk_probe_paused_blocked"]["job_id"],
            "blocked",
            error="Expected 384 embedding dimensions, got 4096.",
            error_type="embedding_dimension_mismatch",
            next_retry_at="2999-01-01T00:00:00Z",
            lease_expires_at="2999-01-01T00:15:00Z",
        )
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            connection.execute(
                "UPDATE embedding_jobs SET operation_id = ? WHERE job_id = ?",
                (paused_operation_id, jobs_by_chunk["chunk_probe_paused_blocked"]["job_id"]),
            )
            connection.commit()
        update_embedding_job_status(
            jobs_by_chunk["chunk_probe_stale_blocked"]["job_id"],
            "blocked",
            error="Expected 384 embedding dimensions, got 4096.",
            error_type="embedding_dimension_mismatch",
            next_retry_at="2999-01-01T00:00:00Z",
            lease_expires_at="2999-01-01T00:15:00Z",
        )
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_probe_stale_blocked", "content": "New stale replacement content."}],
        )
        other_jobs = queue_embedding_job(
            "knowledge_document",
            "doc_probe_dimensions",
            other_model["embedding_model_id"],
        )
        other_job = next(job for job in other_jobs if job["chunk_id"] == "chunk_probe_pending")
        update_embedding_job_status(
            other_job["job_id"],
            "blocked",
            error="Expected 384 embedding dimensions, got 4096.",
            error_type="embedding_dimension_mismatch",
        )

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.0] * 4096, {"provider_id": "local", "model": "test-embedding"}),
        ) as embed:
            report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=1)

        updated = resolve_embedding_model(model["embedding_model_id"])
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            rows = connection.execute(
                """
                SELECT chunk_id, embedding_model_id, status, last_error, last_error_type,
                       next_retry_at, lease_expires_at, completed_at
                FROM embedding_jobs
                ORDER BY chunk_id ASC, embedding_model_id ASC
                """
            ).fetchall()
            vector_row = connection.execute(
                """
                SELECT dimensions
                FROM embedding_vectors
                WHERE chunk_id = 'chunk_probe_pending'
                  AND embedding_model_id = ?
                """,
                (model["embedding_model_id"],),
            ).fetchone()
            repaired_operation_row = connection.execute(
                "SELECT status, stage FROM knowledge_indexing_operations WHERE operation_id = ?",
                (repaired_operation_id,),
            ).fetchone()

        rows_by_chunk_and_model = {(row[0], row[1]): row for row in rows}
        embed.assert_called_once_with(
            model_ref="local/test-embedding",
            text="Probe provider dimensions.",
            dimensions=None,
        )
        self.assertEqual(report["completed_count"], 1)
        self.assertEqual(report["blocked_count"], 0)
        self.assertEqual(report["reset_blocked_dimension_mismatch_count"], 1)
        self.assertEqual(updated["dimensions"], 4096)
        self.assertEqual(updated["metadata"]["dimensions_source"], "provider_probe")
        self.assertEqual(updated["metadata"]["source"], "test")
        self.assertEqual(vector_row[0], 4096)
        repaired_row = rows_by_chunk_and_model[("chunk_probe_blocked", model["embedding_model_id"])]
        self.assertEqual(repaired_row[2], "pending")
        self.assertEqual(repaired_row[3], "")
        self.assertEqual(repaired_row[4], "")
        self.assertEqual(repaired_row[5], "")
        self.assertEqual(repaired_row[6], "")
        self.assertEqual(repaired_row[7], "")
        self.assertEqual(repaired_operation_row[0], "embedding")
        self.assertEqual(repaired_operation_row[1], "embedding_pending")
        other_error_row = rows_by_chunk_and_model[("chunk_probe_other_blocked", model["embedding_model_id"])]
        self.assertEqual(other_error_row[2], "blocked")
        self.assertEqual(other_error_row[4], "embedding_model_unavailable")
        paused_row = rows_by_chunk_and_model[("chunk_probe_paused_blocked", model["embedding_model_id"])]
        self.assertEqual(paused_row[2], "blocked")
        self.assertEqual(paused_row[4], "embedding_dimension_mismatch")
        stale_row = rows_by_chunk_and_model[("chunk_probe_stale_blocked", model["embedding_model_id"])]
        self.assertEqual(stale_row[2], "blocked")
        self.assertEqual(stale_row[4], "embedding_dimension_mismatch")
        other_model_row = rows_by_chunk_and_model[("chunk_probe_pending", other_model["embedding_model_id"])]
        self.assertEqual(other_model_row[2], "blocked")
        self.assertEqual(other_model_row[4], "embedding_dimension_mismatch")

    def test_configured_embedding_model_dimensions_remain_strict_when_provider_vector_differs(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
            resolve_embedding_model,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(
            provider_key="local",
            model="configured-embedding",
            dimensions=384,
            metadata={"dimensions_source": "configured"},
        )
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_configured_dimensions")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_configured_mismatch", "content": "Configured dimensions stay strict."}],
        )
        [job] = queue_embedding_job("knowledge_document", "doc_configured_dimensions", model["embedding_model_id"])

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.0] * 4096, {"provider_id": "local", "model": "configured-embedding"}),
        ) as embed:
            report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=1)

        updated = resolve_embedding_model(model["embedding_model_id"])
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            job_row = connection.execute(
                "SELECT status, last_error_type FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()
            vector_count = connection.execute(
                "SELECT COUNT(*) FROM embedding_vectors WHERE embedding_model_id = ?",
                (model["embedding_model_id"],),
            ).fetchone()[0]

        embed.assert_called_once_with(
            model_ref="local/configured-embedding",
            text="Configured dimensions stay strict.",
            dimensions=384,
        )
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["completed_count"], 0)
        self.assertEqual(report["blocked_count"], 1)
        self.assertEqual(report["reset_blocked_dimension_mismatch_count"], 0)
        self.assertEqual(updated["dimensions"], 384)
        self.assertEqual(updated["metadata"]["dimensions_source"], "configured")
        self.assertEqual(job_row[0], "blocked")
        self.assertEqual(job_row[1], "embedding_dimension_mismatch")
        self.assertEqual(vector_count, 0)

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

    def test_process_pending_embedding_jobs_moves_transient_provider_errors_to_retry_wait(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="policy_qa:doc_1")
        [chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_retry_wait", "content": "Retry wait content."}],
        )
        [job] = queue_embedding_job(
            "knowledge_document",
            "policy_qa:doc_1",
            model["embedding_model_id"],
            operation_id="kop_test",
        )

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            side_effect=ConnectionRefusedError("provider offline"),
        ):
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                operation_id="kop_test",
            )

        self.assertEqual(report["status"], "paused_retrying")
        self.assertEqual(report["retry_wait_count"], 1)
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT status, last_error_type, next_retry_at FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()
        self.assertEqual(row[0], "retry_wait")
        self.assertEqual(row[1], "provider_unavailable")
        self.assertTrue(row[2])

    def test_process_pending_embedding_jobs_blocks_configuration_errors(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="policy_qa:doc_2")
        [chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_blocked", "content": "Blocked content."}],
        )
        [job] = queue_embedding_job(
            "knowledge_document",
            "policy_qa:doc_2",
            model["embedding_model_id"],
            operation_id="kop_test",
        )

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            side_effect=ValueError("Expected 3 embedding dimensions, got 4096."),
        ):
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                operation_id="kop_test",
            )

        self.assertEqual(report["status"], "blocked")
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT status, last_error_type FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()
        self.assertEqual(row[0], "blocked")
        self.assertEqual(row[1], "embedding_dimension_mismatch")

    def test_classify_embedding_processing_error_treats_timeout_exception_as_retry_wait(self) -> None:
        from app.core.storage.embedding_store import classify_embedding_processing_error

        classification = classify_embedding_processing_error(TimeoutError())

        self.assertEqual(classification["status"], "retry_wait")
        self.assertEqual(classification["error_type"], "provider_timeout")
        self.assertEqual(classification["retryable"], True)

    def test_classify_embedding_processing_error_treats_model_unavailable_as_blocked(self) -> None:
        from app.core.storage.embedding_store import classify_embedding_processing_error

        classification = classify_embedding_processing_error(RuntimeError("model unavailable"))

        self.assertEqual(classification["status"], "blocked")
        self.assertEqual(classification["error_type"], "embedding_model_unavailable")
        self.assertEqual(classification["retryable"], False)

    def test_classify_embedding_processing_error_treats_provider_unavailable_as_retry_wait(self) -> None:
        from app.core.storage.embedding_store import classify_embedding_processing_error

        classification = classify_embedding_processing_error(RuntimeError("provider unavailable"))

        self.assertEqual(classification["status"], "retry_wait")
        self.assertEqual(classification["error_type"], "provider_unavailable")
        self.assertEqual(classification["retryable"], True)

    def test_queue_embedding_job_records_operation_id_and_priority(self) -> None:
        from app.core.storage.embedding_store import queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="policy_qa:doc_3")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_operation", "content": "Operation scoped content."}],
        )

        [job] = queue_embedding_job(
            "knowledge_document",
            "policy_qa:doc_3",
            model["embedding_model_id"],
            operation_id="kop_priority",
            priority=25,
        )

        self.assertEqual(job["operation_id"], "kop_priority")
        self.assertEqual(job["priority"], 25)
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT operation_id, priority FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()
        self.assertEqual(row[0], "kop_priority")
        self.assertEqual(row[1], 25)

    def test_reset_embedding_jobs_for_operation_requeues_retryable_operation_jobs_only(self) -> None:
        from app.core.storage.embedding_store import (
            queue_embedding_job,
            register_embedding_model,
            reset_embedding_jobs_for_operation,
            update_embedding_job_status,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        target_document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="doc_reset_operation",
        )
        other_document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="doc_reset_other_operation",
        )
        upsert_retrieval_chunks(
            target_document["document_id"],
            [
                {"chunk_id": "chunk_reset_retry_wait", "content": "Retry wait content."},
                {"chunk_id": "chunk_reset_blocked", "content": "Blocked content."},
                {"chunk_id": "chunk_reset_failed", "content": "Failed content."},
                {"chunk_id": "chunk_reset_completed", "content": "Completed content."},
                {"chunk_id": "chunk_reset_superseded", "content": "Superseded content."},
            ],
        )
        upsert_retrieval_chunks(
            other_document["document_id"],
            [{"chunk_id": "chunk_reset_other", "content": "Other operation failed content."}],
        )
        target_jobs = queue_embedding_job(
            "knowledge_document",
            "doc_reset_operation",
            model["embedding_model_id"],
            operation_id="kop_reset_target",
        )
        [other_job] = queue_embedding_job(
            "knowledge_document",
            "doc_reset_other_operation",
            model["embedding_model_id"],
            operation_id="kop_reset_other",
        )
        jobs_by_chunk = {job["chunk_id"]: job for job in target_jobs}
        update_embedding_job_status(
            jobs_by_chunk["chunk_reset_retry_wait"]["job_id"],
            "retry_wait",
            error="provider timeout",
            error_type="provider_timeout",
            next_retry_at="2999-01-01T00:00:00Z",
            lease_expires_at="2999-01-01T00:00:00Z",
        )
        update_embedding_job_status(
            jobs_by_chunk["chunk_reset_blocked"]["job_id"],
            "blocked",
            error="dimension mismatch",
            error_type="embedding_dimension_mismatch",
            lease_expires_at="2999-01-01T00:00:00Z",
        )
        update_embedding_job_status(
            jobs_by_chunk["chunk_reset_failed"]["job_id"],
            "failed",
            error="provider failed",
            error_type="embedding_job_failed",
            lease_expires_at="2999-01-01T00:00:00Z",
        )
        update_embedding_job_status(jobs_by_chunk["chunk_reset_completed"]["job_id"], "completed")
        update_embedding_job_status(
            jobs_by_chunk["chunk_reset_superseded"]["job_id"],
            "failed",
            error="superseded by newer content hash",
            error_type="superseded_content_hash",
        )
        update_embedding_job_status(
            other_job["job_id"],
            "failed",
            error="other provider failed",
            error_type="embedding_job_failed",
        )

        reset_count = reset_embedding_jobs_for_operation("kop_reset_target")

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            rows = connection.execute(
                """
                SELECT chunk_id, operation_id, status, last_error, last_error_type,
                       next_retry_at, lease_expires_at, completed_at
                FROM embedding_jobs
                ORDER BY chunk_id ASC
                """
            ).fetchall()

        rows_by_chunk = {row[0]: row for row in rows}
        self.assertEqual(reset_count, 3)
        for chunk_id in ("chunk_reset_retry_wait", "chunk_reset_blocked", "chunk_reset_failed"):
            row = rows_by_chunk[chunk_id]
            self.assertEqual(row[1], "kop_reset_target")
            self.assertEqual(row[2], "pending")
            self.assertEqual(row[3], "")
            self.assertEqual(row[4], "")
            self.assertEqual(row[5], "")
            self.assertEqual(row[6], "")
            self.assertEqual(row[7], "")
        self.assertEqual(rows_by_chunk["chunk_reset_completed"][2], "completed")
        self.assertTrue(rows_by_chunk["chunk_reset_completed"][7])
        self.assertEqual(rows_by_chunk["chunk_reset_superseded"][2], "failed")
        self.assertEqual(rows_by_chunk["chunk_reset_superseded"][4], "superseded_content_hash")
        self.assertEqual(rows_by_chunk["chunk_reset_other"][1], "kop_reset_other")
        self.assertEqual(rows_by_chunk["chunk_reset_other"][2], "failed")

    def test_reset_embedding_jobs_for_operation_requires_operation_id(self) -> None:
        from app.core.storage.embedding_store import reset_embedding_jobs_for_operation

        with self.assertRaises(ValueError):
            reset_embedding_jobs_for_operation("")

    def test_reset_stale_running_embedding_jobs_requeues_expired_leases(self) -> None:
        from app.core.storage.embedding_store import (
            queue_embedding_job,
            register_embedding_model,
            reset_stale_running_embedding_jobs,
            update_embedding_job_status,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="policy_qa:doc_4")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_stale_lease", "content": "Stale lease content."}],
        )
        [job] = queue_embedding_job(
            "knowledge_document",
            "policy_qa:doc_4",
            model["embedding_model_id"],
            operation_id="kop_stale",
        )
        update_embedding_job_status(job["job_id"], "running")

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            connection.execute(
                "UPDATE embedding_jobs SET lease_expires_at = ? WHERE job_id = ?",
                ("2026-06-08T00:00:00Z", job["job_id"]),
            )
            connection.commit()

        reset_count = reset_stale_running_embedding_jobs(
            model_id=model["embedding_model_id"],
            operation_id="kop_stale",
            now="2026-06-08T00:01:00Z",
        )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT status, lease_expires_at, attempt_count FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()
        self.assertEqual(reset_count, 1)
        self.assertEqual(row[0], "pending")
        self.assertEqual(row[1], "")
        self.assertEqual(row[2], 1)

    def test_process_pending_embedding_jobs_processes_due_retry_wait_but_not_future_retry_wait(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
            update_embedding_job_status,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="policy_qa:retry_due")
        chunks = upsert_retrieval_chunks(
            document["document_id"],
            [
                {"chunk_id": "chunk_due_retry_wait", "content": "Due retry content."},
                {"chunk_id": "chunk_future_retry_wait", "content": "Future retry content."},
            ],
        )
        jobs = queue_embedding_job("knowledge_document", "policy_qa:retry_due", model["embedding_model_id"])
        due_job = next(job for job in jobs if job["chunk_id"] == "chunk_due_retry_wait")
        future_job = next(job for job in jobs if job["chunk_id"] == "chunk_future_retry_wait")
        update_embedding_job_status(
            due_job["job_id"],
            "retry_wait",
            error="provider timeout",
            error_type="provider_timeout",
            next_retry_at="2000-01-01T00:00:00Z",
        )
        update_embedding_job_status(
            future_job["job_id"],
            "retry_wait",
            error="provider timeout",
            error_type="provider_timeout",
            next_retry_at="2999-01-01T00:00:00Z",
        )

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.2, 0.3, 0.4], {"provider_id": "local", "model": "test-embedding"}),
        ) as embed:
            report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10)

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            due_row = connection.execute(
                "SELECT status FROM embedding_jobs WHERE job_id = ?",
                (due_job["job_id"],),
            ).fetchone()
            future_row = connection.execute(
                "SELECT status, next_retry_at FROM embedding_jobs WHERE job_id = ?",
                (future_job["job_id"],),
            ).fetchone()
            vector_count = connection.execute(
                "SELECT COUNT(*) FROM embedding_vectors WHERE chunk_id = ?",
                (chunks[0]["chunk_id"],),
            ).fetchone()[0]

        embed.assert_called_once()
        self.assertEqual(report["status"], "succeeded")
        self.assertEqual(report["processed_count"], 1)
        self.assertEqual(due_row[0], "completed")
        self.assertEqual(future_row[0], "retry_wait")
        self.assertEqual(future_row[1], "2999-01-01T00:00:00Z")
        self.assertEqual(vector_count, 1)

    def test_process_pending_embedding_jobs_scopes_by_operation_id(self) -> None:
        from app.core.storage.embedding_store import process_pending_embedding_jobs, queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        self._insert_knowledge_indexing_operation("kop_target", status="embedding")
        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        first_document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_target_scope")
        second_document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_other_scope")
        upsert_retrieval_chunks(
            first_document["document_id"],
            [{"chunk_id": "chunk_target_scope", "content": "Target scoped content."}],
        )
        upsert_retrieval_chunks(
            second_document["document_id"],
            [{"chunk_id": "chunk_other_scope", "content": "Other scoped content."}],
        )
        queue_embedding_job(
            "knowledge_document",
            "doc_target_scope",
            model["embedding_model_id"],
            operation_id="kop_target",
        )
        queue_embedding_job(
            "knowledge_document",
            "doc_other_scope",
            model["embedding_model_id"],
            operation_id="kop_other",
        )

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.2, 0.3, 0.4], {"provider_id": "local", "model": "test-embedding"}),
        ):
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                operation_id="kop_target",
            )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            operation_row = connection.execute(
                "SELECT status, stage, completed_at FROM knowledge_indexing_operations WHERE operation_id = ?",
                ("kop_target",),
            ).fetchone()

        self.assertEqual(report["processed_count"], 1)
        self.assertEqual(report["processed_jobs"][0]["operation_id"], "kop_target")
        self.assertEqual(report["remaining_count"], 0)
        self.assertEqual(operation_row[0], "completed")
        self.assertEqual(operation_row[1], "embedding_completed")
        self.assertTrue(operation_row[2])

    def test_process_pending_embedding_jobs_syncs_operation_status_when_maintenance_is_unscoped(self) -> None:
        from app.core.storage.embedding_store import process_pending_embedding_jobs, queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        self._insert_knowledge_indexing_operation("kop_global_maintenance", status="embedding")
        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_global_maintenance")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_global_maintenance", "content": "Global maintenance operation content."}],
        )
        queue_embedding_job(
            "knowledge_document",
            "doc_global_maintenance",
            model["embedding_model_id"],
            operation_id="kop_global_maintenance",
        )

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.2, 0.3, 0.4], {"provider_id": "local", "model": "test-embedding"}),
        ):
            report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10)

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            operation_row = connection.execute(
                "SELECT status, stage, completed_at FROM knowledge_indexing_operations WHERE operation_id = ?",
                ("kop_global_maintenance",),
            ).fetchone()

        self.assertEqual(report["processed_count"], 1)
        self.assertEqual(report["processed_jobs"][0]["operation_id"], "kop_global_maintenance")
        self.assertEqual(operation_row[0], "completed")
        self.assertEqual(operation_row[1], "embedding_completed")
        self.assertTrue(operation_row[2])

    def test_process_pending_embedding_jobs_scopes_by_collection_and_source(self) -> None:
        from app.core.storage.embedding_store import process_pending_embedding_jobs, queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        target_document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="doc_policy_target",
            scope={"collection": "policy_qa"},
        )
        other_collection_document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="doc_policy_other_collection",
            scope={"collection": "other_policy"},
        )
        other_source_document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="doc_policy_other_source",
            scope={"collection": "policy_qa"},
        )
        upsert_retrieval_chunks(
            target_document["document_id"],
            [{"chunk_id": "chunk_policy_target", "content": "Target policy content."}],
        )
        upsert_retrieval_chunks(
            other_collection_document["document_id"],
            [{"chunk_id": "chunk_policy_other_collection", "content": "Other collection content."}],
        )
        upsert_retrieval_chunks(
            other_source_document["document_id"],
            [{"chunk_id": "chunk_policy_other_source", "content": "Other source content."}],
        )
        queue_embedding_job("knowledge_document", "doc_policy_target", model["embedding_model_id"])
        queue_embedding_job("knowledge_document", "doc_policy_other_collection", model["embedding_model_id"])
        queue_embedding_job("knowledge_document", "doc_policy_other_source", model["embedding_model_id"])

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.2, 0.3, 0.4], {"provider_id": "local", "model": "test-embedding"}),
        ):
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                collection_id="policy_qa",
                source_kind="knowledge_document",
                source_id="doc_policy_target",
            )

        self.assertEqual(report["processed_count"], 1)
        self.assertEqual(report["processed_jobs"][0]["chunk_id"], "chunk_policy_target")
        self.assertEqual(report["scope"]["collection_id"], "policy_qa")
        self.assertEqual(report["scope"]["source_kind"], "knowledge_document")
        self.assertEqual(report["scope"]["source_id"], "doc_policy_target")

    def test_process_pending_embedding_jobs_time_budget_reports_remaining_scope_count(self) -> None:
        from app.core.storage.embedding_store import process_pending_embedding_jobs, queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_time_budget")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_time_budget", "content": "Time budget content."}],
        )
        queue_embedding_job("knowledge_document", "doc_time_budget", model["embedding_model_id"])

        with patch("app.core.storage.embedding_store.time.monotonic", side_effect=[100.0, 101.0]):
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                source_kind="knowledge_document",
                source_id="doc_time_budget",
                time_budget_seconds=1,
            )

        self.assertEqual(report["processed_count"], 0)
        self.assertEqual(report["remaining_count"], 1)

    def test_process_pending_embedding_jobs_candidate_scan_is_paged(self) -> None:
        from app.core.storage.embedding_store import process_pending_embedding_jobs

        class FakeCursor:
            def __init__(self, rows: list[object]) -> None:
                self._rows = rows
                self.rowcount = 0

            def fetchall(self) -> list[object]:
                return self._rows

        class FakeConnection:
            candidate_scan_count = 0

            def __enter__(self) -> "FakeConnection":
                return self

            def __exit__(self, *args: object) -> None:
                return None

            def execute(self, sql: str, params: list[object] | tuple[object, ...] = ()) -> FakeCursor:
                normalized_sql = " ".join(sql.split())
                if "JOIN embedding_models AS m" in normalized_sql:
                    self.candidate_scan_count += 1
                    self.assert_query_is_paged(normalized_sql)
                return FakeCursor([])

            def assert_query_is_paged(self, sql: str) -> None:
                if "LIMIT ?" not in sql or "OFFSET ?" not in sql:
                    raise AssertionError("embedding job candidate scans must use bounded paging")

        fake_connection = FakeConnection()
        with patch("app.core.storage.embedding_store.get_connection", return_value=fake_connection):
            report = process_pending_embedding_jobs(
                limit=5,
                collection_id="policy_qa",
                time_budget_seconds=1,
            )

        self.assertEqual(report["processed_count"], 0)
        self.assertEqual(fake_connection.candidate_scan_count, 1)

    def test_process_pending_embedding_jobs_pages_past_collection_like_false_positives(self) -> None:
        from app.core.storage.embedding_store import process_pending_embedding_jobs, queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        for index in range(105):
            source_id = f"doc_false_policy_{index}"
            document = upsert_retrieval_document(
                source_kind="knowledge_document",
                source_id=source_id,
                scope={"collection": "not_policy_qa"},
            )
            upsert_retrieval_chunks(
                document["document_id"],
                [{"chunk_id": f"chunk_false_policy_{index}", "content": f"False positive policy {index}."}],
            )
            queue_embedding_job("knowledge_document", source_id, model["embedding_model_id"], priority=10)

        target_document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="doc_true_policy",
            scope={"collection": "policy_qa"},
        )
        upsert_retrieval_chunks(
            target_document["document_id"],
            [{"chunk_id": "chunk_true_policy", "content": "True policy content."}],
        )
        queue_embedding_job("knowledge_document", "doc_true_policy", model["embedding_model_id"], priority=20)

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.2, 0.3, 0.4], {"provider_id": "local", "model": "test-embedding"}),
        ):
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=1,
                collection_id="policy_qa",
            )

        self.assertEqual(report["processed_count"], 1)
        self.assertEqual(report["processed_jobs"][0]["chunk_id"], "chunk_true_policy")
        self.assertEqual(report["remaining_count"], 0)

    def test_process_pending_embedding_jobs_scoped_drain_requires_include_retry_wait(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
            update_embedding_job_status,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_retry_scoped")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_retry_scoped", "content": "Scoped retry content."}],
        )
        [job] = queue_embedding_job(
            "knowledge_document",
            "doc_retry_scoped",
            model["embedding_model_id"],
            operation_id="kop_retry_scope",
        )
        update_embedding_job_status(
            job["job_id"],
            "retry_wait",
            error="provider timeout",
            error_type="provider_timeout",
            next_retry_at="2000-01-01T00:00:00Z",
        )

        without_retry = process_pending_embedding_jobs(
            model_ref=model["embedding_model_id"],
            limit=10,
            operation_id="kop_retry_scope",
        )
        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.2, 0.3, 0.4], {"provider_id": "local", "model": "test-embedding"}),
        ):
            with_retry = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                operation_id="kop_retry_scope",
                include_retry_wait=True,
            )

        self.assertEqual(without_retry["processed_count"], 0)
        self.assertEqual(without_retry["remaining_count"], 0)
        self.assertEqual(with_retry["processed_count"], 1)
        self.assertEqual(with_retry["processed_jobs"][0]["status"], "completed")

    def test_process_pending_embedding_jobs_noops_for_paused_operation(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_paused_operation")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_paused_operation", "content": "Paused operation content."}],
        )
        [job] = queue_embedding_job(
            "knowledge_document",
            "doc_paused_operation",
            model["embedding_model_id"],
            operation_id="kop_paused_operation",
        )
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            connection.execute(
                """
                INSERT INTO knowledge_indexing_operations (
                    operation_id, collection_id, source_root, template_id,
                    status, stage, created_at, updated_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "kop_paused_operation",
                    "policy_qa",
                    "knowledge/policy_qa/source",
                    "knowledge_folder_retrieval_ingestion",
                    "paused",
                    "user_paused",
                    "2026-06-08T00:00:00Z",
                    "2026-06-08T00:00:00Z",
                    "{}",
                ),
            )
            connection.commit()

        with patch("app.core.storage.embedding_store.embed_text_with_model_ref") as embed:
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                operation_id="kop_paused_operation",
                include_retry_wait=True,
                retry_failed=True,
            )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT status, attempt_count, last_error, last_error_type FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()

        embed.assert_not_called()
        self.assertEqual(report["status"], "paused")
        self.assertEqual(report["error"], "")
        self.assertEqual(report["processed_count"], 0)
        self.assertEqual(report["completed_count"], 0)
        self.assertEqual(report["failed_count"], 0)
        self.assertEqual(report["retry_wait_count"], 0)
        self.assertEqual(report["blocked_count"], 0)
        self.assertEqual(report["retried_failed_count"], 0)
        self.assertEqual(report["remaining_count"], 1)
        self.assertEqual(report["scope"]["operation_id"], "kop_paused_operation")
        self.assertEqual(report["processed_jobs"], [])
        self.assertEqual(row, ("pending", 0, "", ""))

    def test_process_pending_embedding_jobs_unscoped_skips_paused_operation_pending_jobs(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_paused_unscoped")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_paused_unscoped", "content": "Paused unscoped content."}],
        )
        [job] = queue_embedding_job(
            "knowledge_document",
            "doc_paused_unscoped",
            model["embedding_model_id"],
            operation_id="kop_paused_unscoped",
        )
        self._insert_knowledge_indexing_operation("kop_paused_unscoped")

        with patch("app.core.storage.embedding_store.embed_text_with_model_ref") as embed:
            report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10)

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT status, attempt_count FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()

        embed.assert_not_called()
        self.assertEqual(report["processed_count"], 0)
        self.assertEqual(report["remaining_count"], 0)
        self.assertEqual(row, ("pending", 0))

    def test_claim_embedding_job_skips_paused_operation_jobs(self) -> None:
        from app.core.storage.embedding_store import _claim_embedding_job, queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_paused_claim")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_paused_claim", "content": "Paused claim content."}],
        )
        [job] = queue_embedding_job(
            "knowledge_document",
            "doc_paused_claim",
            model["embedding_model_id"],
            operation_id="kop_paused_claim",
        )
        self._insert_knowledge_indexing_operation("kop_paused_claim")

        claimed = _claim_embedding_job(job["job_id"], now="2026-06-08T00:00:00Z")

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT status, attempt_count FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()

        self.assertIsNone(claimed)
        self.assertEqual(row, ("pending", 0))

    def test_process_pending_embedding_jobs_unscoped_retry_failed_skips_paused_operation_jobs(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
            update_embedding_job_status,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_paused_failed_unscoped")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_paused_failed_unscoped", "content": "Paused failed content."}],
        )
        [job] = queue_embedding_job(
            "knowledge_document",
            "doc_paused_failed_unscoped",
            model["embedding_model_id"],
            operation_id="kop_paused_failed_unscoped",
        )
        update_embedding_job_status(
            job["job_id"],
            "failed",
            error="provider failed",
            error_type="embedding_job_failed",
        )
        self._insert_knowledge_indexing_operation("kop_paused_failed_unscoped")

        with patch("app.core.storage.embedding_store.embed_text_with_model_ref") as embed:
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                retry_failed=True,
            )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT status, last_error, last_error_type FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()

        embed.assert_not_called()
        self.assertEqual(report["retried_failed_count"], 0)
        self.assertEqual(report["processed_count"], 0)
        self.assertEqual(row, ("failed", "provider failed", "embedding_job_failed"))

    def test_reset_stale_running_embedding_jobs_skips_paused_operation_jobs(self) -> None:
        from app.core.storage.embedding_store import (
            queue_embedding_job,
            register_embedding_model,
            reset_stale_running_embedding_jobs,
            update_embedding_job_status,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_paused_stale_running")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_paused_stale_running", "content": "Paused stale running content."}],
        )
        [job] = queue_embedding_job(
            "knowledge_document",
            "doc_paused_stale_running",
            model["embedding_model_id"],
            operation_id="kop_paused_stale_running",
        )
        update_embedding_job_status(job["job_id"], "running")
        self._insert_knowledge_indexing_operation("kop_paused_stale_running")
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            connection.execute(
                "UPDATE embedding_jobs SET lease_expires_at = ? WHERE job_id = ?",
                ("2026-06-08T00:00:00Z", job["job_id"]),
            )
            connection.commit()

        reset_count = reset_stale_running_embedding_jobs(now="2026-06-08T00:01:00Z")

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT status, lease_expires_at FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()

        self.assertEqual(reset_count, 0)
        self.assertEqual(row, ("running", "2026-06-08T00:00:00Z"))

    def test_process_pending_embedding_jobs_retry_failed_respects_collection_scope(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
            update_embedding_job_status,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        target_document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="doc_retry_target_scope",
            scope={"collection": "policy_qa"},
        )
        other_document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="doc_retry_other_scope",
            scope={"collection": "other_policy"},
        )
        upsert_retrieval_chunks(
            target_document["document_id"],
            [{"chunk_id": "chunk_retry_target_scope", "content": "Target retry content."}],
        )
        upsert_retrieval_chunks(
            other_document["document_id"],
            [{"chunk_id": "chunk_retry_other_scope", "content": "Other retry content."}],
        )
        [target_job] = queue_embedding_job("knowledge_document", "doc_retry_target_scope", model["embedding_model_id"])
        [other_job] = queue_embedding_job("knowledge_document", "doc_retry_other_scope", model["embedding_model_id"])
        update_embedding_job_status(target_job["job_id"], "failed", error="provider offline")
        update_embedding_job_status(other_job["job_id"], "failed", error="provider offline")

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.2, 0.3, 0.4], {"provider_id": "local", "model": "test-embedding"}),
        ):
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                retry_failed=True,
                collection_id="policy_qa",
            )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            other_row = connection.execute(
                "SELECT status FROM embedding_jobs WHERE job_id = ?",
                (other_job["job_id"],),
            ).fetchone()

        self.assertEqual(report["retried_failed_count"], 1)
        self.assertEqual(report["processed_count"], 1)
        self.assertEqual(report["processed_jobs"][0]["job_id"], target_job["job_id"])
        self.assertEqual(other_row[0], "failed")

    def test_claim_embedding_job_skips_jobs_claimed_by_another_worker(self) -> None:
        from app.core.storage.embedding_store import _claim_embedding_job, queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_claim_race")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_claim_race", "content": "Claim race content."}],
        )
        [job] = queue_embedding_job("knowledge_document", "doc_claim_race", model["embedding_model_id"])
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            connection.execute("UPDATE embedding_jobs SET status = 'running' WHERE job_id = ?", (job["job_id"],))
            connection.commit()

        claimed = _claim_embedding_job(job["job_id"], now="2026-06-08T00:00:00Z")

        self.assertIsNone(claimed)

    def test_process_pending_embedding_jobs_can_retry_failed_jobs(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
            update_embedding_job_status,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_retry")
        [chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_retry_failed_embedding", "content": "Retry failed embedding jobs."}],
        )
        [job] = queue_embedding_job("knowledge_document", "doc_retry", model["embedding_model_id"])
        update_embedding_job_status(job["job_id"], "failed", error="model was offline")

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.25, 0.5, 0.75], {"provider_id": "local", "model": "test-embedding"}),
        ):
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                retry_failed=True,
            )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            job_row = connection.execute(
                "SELECT status, last_error FROM embedding_jobs WHERE job_id = ?",
                (job["job_id"],),
            ).fetchone()
            vector_count = connection.execute(
                "SELECT COUNT(*) FROM embedding_vectors WHERE chunk_id = ?",
                (chunk["chunk_id"],),
            ).fetchone()[0]

        self.assertEqual(report["status"], "succeeded")
        self.assertEqual(report["retried_failed_count"], 1)
        self.assertEqual(report["processed_count"], 1)
        self.assertEqual(report["completed_count"], 1)
        self.assertEqual(report["failed_count"], 0)
        self.assertEqual(job_row[0], "completed")
        self.assertEqual(job_row[1], "")
        self.assertEqual(vector_count, 1)

    def test_process_pending_embedding_jobs_clears_stale_fields_when_retrying_failed_jobs(self) -> None:
        from app.core.storage.embedding_store import (
            process_pending_embedding_jobs,
            queue_embedding_job,
            register_embedding_model,
            update_embedding_job_status,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_retry_clear")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_retry_failed_clear", "content": "Retry failed cleanup."}],
        )
        [job] = queue_embedding_job("knowledge_document", "doc_retry_clear", model["embedding_model_id"])
        update_embedding_job_status(
            job["job_id"],
            "failed",
            error="model was offline",
            error_type="provider_unavailable",
            next_retry_at="2999-01-01T00:00:00Z",
            lease_expires_at="2999-01-01T00:15:00Z",
        )

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.5, 0.25, 0.75], {"provider_id": "local", "model": "test-embedding"}),
        ):
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                retry_failed=True,
            )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                """
                SELECT status, last_error, last_error_type, next_retry_at, lease_expires_at
                FROM embedding_jobs
                WHERE job_id = ?
                """,
                (job["job_id"],),
            ).fetchone()

        self.assertEqual(report["status"], "succeeded")
        self.assertEqual(row[0], "completed")
        self.assertEqual(row[1], "")
        self.assertEqual(row[2], "")
        self.assertEqual(row[3], "")
        self.assertEqual(row[4], "")

    def test_queue_embedding_job_clears_stale_fields_when_existing_vector_completes_job(self) -> None:
        from app.core.storage.embedding_store import (
            queue_embedding_job,
            register_embedding_model,
            update_embedding_job_status,
            upsert_embedding_vector,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_existing_clear")
        [chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_existing_clear", "content": "Existing vector cleanup."}],
        )
        [job] = queue_embedding_job("knowledge_document", "doc_existing_clear", model["embedding_model_id"])
        update_embedding_job_status(
            job["job_id"],
            "retry_wait",
            error="provider timeout",
            error_type="provider_timeout",
            next_retry_at="2999-01-01T00:00:00Z",
            lease_expires_at="2999-01-01T00:15:00Z",
        )
        upsert_embedding_vector(
            chunk["chunk_id"],
            model["embedding_model_id"],
            [1.0, 0.0, 0.0],
            chunk["content_hash"],
        )

        repeated_jobs = queue_embedding_job("knowledge_document", "doc_existing_clear", model["embedding_model_id"])

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                """
                SELECT status, last_error, last_error_type, next_retry_at, lease_expires_at
                FROM embedding_jobs
                WHERE job_id = ?
                """,
                (job["job_id"],),
            ).fetchone()

        self.assertEqual(repeated_jobs, [])
        self.assertEqual(row[0], "completed")
        self.assertEqual(row[1], "")
        self.assertEqual(row[2], "")
        self.assertEqual(row[3], "")
        self.assertEqual(row[4], "")

    def test_queue_embedding_job_supersedes_retry_wait_and_blocked_old_content_hash_jobs(self) -> None:
        from app.core.storage.embedding_store import queue_embedding_job, register_embedding_model, update_embedding_job_status
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_supersede")
        upsert_retrieval_chunks(
            document["document_id"],
            [
                {"chunk_id": "chunk_supersede_retry", "content": "Old retry content."},
                {"chunk_id": "chunk_supersede_blocked", "content": "Old blocked content."},
            ],
        )
        old_jobs = queue_embedding_job("knowledge_document", "doc_supersede", model["embedding_model_id"])
        retry_job = next(job for job in old_jobs if job["chunk_id"] == "chunk_supersede_retry")
        blocked_job = next(job for job in old_jobs if job["chunk_id"] == "chunk_supersede_blocked")
        update_embedding_job_status(
            retry_job["job_id"],
            "retry_wait",
            error="provider timeout",
            error_type="provider_timeout",
            next_retry_at="2999-01-01T00:00:00Z",
            lease_expires_at="2999-01-01T00:15:00Z",
        )
        update_embedding_job_status(
            blocked_job["job_id"],
            "blocked",
            error="Expected 3 embedding dimensions, got 4096.",
            error_type="embedding_dimension_mismatch",
            next_retry_at="2999-01-01T00:00:00Z",
            lease_expires_at="2999-01-01T00:15:00Z",
        )
        upsert_retrieval_chunks(
            document["document_id"],
            [
                {"chunk_id": "chunk_supersede_retry", "content": "New retry content."},
                {"chunk_id": "chunk_supersede_blocked", "content": "New blocked content."},
            ],
        )

        new_jobs = queue_embedding_job("knowledge_document", "doc_supersede", model["embedding_model_id"])

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            rows = connection.execute(
                """
                SELECT status, last_error_type, next_retry_at, lease_expires_at
                FROM embedding_jobs
                WHERE job_id IN (?, ?)
                ORDER BY job_id ASC
                """,
                (retry_job["job_id"], blocked_job["job_id"]),
            ).fetchall()

        self.assertEqual(len(new_jobs), 2)
        self.assertEqual({row[0] for row in rows}, {"failed"})
        self.assertEqual({row[1] for row in rows}, {"superseded_content_hash"})
        self.assertEqual({row[2] for row in rows}, {""})
        self.assertEqual({row[3] for row in rows}, {""})

    def test_queue_embedding_job_supersedes_pending_and_running_old_content_hash_jobs(self) -> None:
        from app.core.storage.embedding_store import queue_embedding_job, register_embedding_model, update_embedding_job_status
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_supersede_active")
        upsert_retrieval_chunks(
            document["document_id"],
            [
                {"chunk_id": "chunk_supersede_pending", "content": "Old pending content."},
                {"chunk_id": "chunk_supersede_running", "content": "Old running content."},
            ],
        )
        old_jobs = queue_embedding_job("knowledge_document", "doc_supersede_active", model["embedding_model_id"])
        pending_job = next(job for job in old_jobs if job["chunk_id"] == "chunk_supersede_pending")
        running_job = next(job for job in old_jobs if job["chunk_id"] == "chunk_supersede_running")
        update_embedding_job_status(running_job["job_id"], "running")
        upsert_retrieval_chunks(
            document["document_id"],
            [
                {"chunk_id": "chunk_supersede_pending", "content": "New pending content."},
                {"chunk_id": "chunk_supersede_running", "content": "New running content."},
            ],
        )

        new_jobs = queue_embedding_job("knowledge_document", "doc_supersede_active", model["embedding_model_id"])

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            rows = connection.execute(
                """
                SELECT status, last_error_type, next_retry_at, lease_expires_at
                FROM embedding_jobs
                WHERE job_id IN (?, ?)
                ORDER BY job_id ASC
                """,
                (pending_job["job_id"], running_job["job_id"]),
            ).fetchall()

        self.assertEqual(len(new_jobs), 2)
        self.assertEqual({row[0] for row in rows}, {"failed"})
        self.assertEqual({row[1] for row in rows}, {"superseded_content_hash"})
        self.assertEqual({row[2] for row in rows}, {""})
        self.assertEqual({row[3] for row in rows}, {""})

    def test_update_embedding_job_status_does_not_complete_superseded_running_job(self) -> None:
        from app.core.storage.embedding_store import queue_embedding_job, register_embedding_model, update_embedding_job_status
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_supersede_late")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_supersede_late", "content": "Old running content."}],
        )
        [old_job] = queue_embedding_job("knowledge_document", "doc_supersede_late", model["embedding_model_id"])
        update_embedding_job_status(old_job["job_id"], "running")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_supersede_late", "content": "New running content."}],
        )
        queue_embedding_job("knowledge_document", "doc_supersede_late", model["embedding_model_id"])

        completed = update_embedding_job_status(old_job["job_id"], "completed")
        running = update_embedding_job_status(old_job["job_id"], "running")

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT status, last_error, last_error_type FROM embedding_jobs WHERE job_id = ?",
                (old_job["job_id"],),
            ).fetchone()

        self.assertEqual(completed["status"], "failed")
        self.assertEqual(completed["last_error_type"], "superseded_content_hash")
        self.assertEqual(running["status"], "failed")
        self.assertEqual(running["last_error_type"], "superseded_content_hash")
        self.assertEqual(row[0], "failed")
        self.assertEqual(row[1], "superseded by newer content hash")
        self.assertEqual(row[2], "superseded_content_hash")

    def test_update_embedding_job_status_preserves_superseded_job_for_late_retry_and_failed_updates(self) -> None:
        from app.core.storage.embedding_store import queue_embedding_job, register_embedding_model, update_embedding_job_status
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_supersede_late_failure")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_supersede_late_failure", "content": "Old running content."}],
        )
        [old_job] = queue_embedding_job("knowledge_document", "doc_supersede_late_failure", model["embedding_model_id"])
        update_embedding_job_status(old_job["job_id"], "running")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_supersede_late_failure", "content": "New running content."}],
        )
        queue_embedding_job("knowledge_document", "doc_supersede_late_failure", model["embedding_model_id"])

        retry_wait = update_embedding_job_status(
            old_job["job_id"],
            "retry_wait",
            error="provider unavailable",
            error_type="provider_unavailable",
            next_retry_at="2999-01-01T00:00:00Z",
        )
        failed = update_embedding_job_status(
            old_job["job_id"],
            "failed",
            error="provider failed later",
            error_type="embedding_job_failed",
        )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT status, last_error, last_error_type, next_retry_at FROM embedding_jobs WHERE job_id = ?",
                (old_job["job_id"],),
            ).fetchone()

        self.assertEqual(retry_wait["status"], "failed")
        self.assertEqual(retry_wait["last_error_type"], "superseded_content_hash")
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["last_error_type"], "superseded_content_hash")
        self.assertEqual(row[0], "failed")
        self.assertEqual(row[1], "superseded by newer content hash")
        self.assertEqual(row[2], "superseded_content_hash")
        self.assertEqual(row[3], "")

    def test_retry_failed_does_not_reset_superseded_content_hash_jobs(self) -> None:
        from app.core.storage.embedding_store import process_pending_embedding_jobs, queue_embedding_job, register_embedding_model, update_embedding_job_status
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_retry_superseded")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_retry_superseded", "content": "Old content."}],
        )
        [old_job] = queue_embedding_job("knowledge_document", "doc_retry_superseded", model["embedding_model_id"])
        update_embedding_job_status(old_job["job_id"], "running")
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_retry_superseded", "content": "New content."}],
        )
        queue_embedding_job("knowledge_document", "doc_retry_superseded", model["embedding_model_id"])

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.1, 0.2, 0.3], {"provider_id": "local", "model": "test-embedding"}),
        ) as embed:
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                retry_failed=True,
            )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            row = connection.execute(
                "SELECT status, last_error_type FROM embedding_jobs WHERE job_id = ?",
                (old_job["job_id"],),
            ).fetchone()

        embed.assert_called_once()
        self.assertEqual(report["retried_failed_count"], 0)
        self.assertNotIn(old_job["job_id"], {job["job_id"] for job in report["processed_jobs"]})
        self.assertEqual(row[0], "failed")
        self.assertEqual(row[1], "superseded_content_hash")

    def test_process_pending_embedding_jobs_skips_jobs_with_stale_content_hash(self) -> None:
        from app.core.storage.embedding_store import process_pending_embedding_jobs, queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_stale_hash_processor")
        [old_chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_stale_hash_processor", "content": "Old content."}],
        )
        [old_job] = queue_embedding_job("knowledge_document", "doc_stale_hash_processor", model["embedding_model_id"])
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_stale_hash_processor", "content": "New content."}],
        )

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            return_value=([0.1, 0.2, 0.3], {"provider_id": "local", "model": "test-embedding"}),
        ) as embed:
            report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10)

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            vector_count = connection.execute(
                """
                SELECT COUNT(*)
                FROM embedding_vectors
                WHERE chunk_id = ? AND content_hash = ?
                """,
                (old_chunk["chunk_id"], old_job["content_hash"]),
            ).fetchone()[0]
            row = connection.execute(
                "SELECT status FROM embedding_jobs WHERE job_id = ?",
                (old_job["job_id"],),
            ).fetchone()

        embed.assert_not_called()
        self.assertEqual(report["processed_count"], 0)
        self.assertEqual(vector_count, 0)
        self.assertEqual(row[0], "pending")

    def test_process_pending_embedding_jobs_reports_mixed_completed_and_retry_wait_batch(self) -> None:
        from app.core.storage.embedding_store import process_pending_embedding_jobs, queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_mixed_batch")
        upsert_retrieval_chunks(
            document["document_id"],
            [
                {"chunk_id": "chunk_mixed_completed", "content": "Mixed success content."},
                {"chunk_id": "chunk_mixed_retry", "content": "Mixed retry content."},
            ],
        )
        queue_embedding_job("knowledge_document", "doc_mixed_batch", model["embedding_model_id"])

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            side_effect=[
                ([1.0, 0.0, 0.0], {"provider_id": "local", "model": "test-embedding"}),
                ConnectionRefusedError("provider offline"),
            ],
        ):
            report = process_pending_embedding_jobs(model_ref=model["embedding_model_id"], limit=10)

        self.assertEqual(report["status"], "paused_retrying")
        self.assertEqual(report["processed_count"], 2)
        self.assertEqual(report["completed_count"], 1)
        self.assertEqual(report["retry_wait_count"], 1)
        self.assertEqual(report["blocked_count"], 0)
        self.assertEqual(report["failed_count"], 0)

    def test_process_pending_embedding_jobs_marks_operation_retrying_when_provider_is_unavailable(self) -> None:
        from app.core.storage.embedding_store import process_pending_embedding_jobs, queue_embedding_job, register_embedding_model
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        self._insert_knowledge_indexing_operation("kop_retrying", status="embedding")
        model = register_embedding_model(provider_key="local", model="test-embedding", dimensions=3)
        document = upsert_retrieval_document(source_kind="knowledge_document", source_id="doc_retrying_operation")
        upsert_retrieval_chunks(
            document["document_id"],
            [
                {"chunk_id": "chunk_retrying_completed", "content": "Retrying operation success content."},
                {"chunk_id": "chunk_retrying_wait", "content": "Retrying operation wait content."},
            ],
        )
        queue_embedding_job(
            "knowledge_document",
            "doc_retrying_operation",
            model["embedding_model_id"],
            operation_id="kop_retrying",
        )

        with patch(
            "app.core.storage.embedding_store.embed_text_with_model_ref",
            side_effect=[
                ([1.0, 0.0, 0.0], {"provider_id": "local", "model": "test-embedding"}),
                ConnectionRefusedError("provider offline"),
            ],
        ):
            report = process_pending_embedding_jobs(
                model_ref=model["embedding_model_id"],
                limit=10,
                operation_id="kop_retrying",
                include_retry_wait=True,
            )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            operation_row = connection.execute(
                """
                SELECT status, stage, last_error_type, last_error, next_retry_at, completed_at
                FROM knowledge_indexing_operations
                WHERE operation_id = ?
                """,
                ("kop_retrying",),
            ).fetchone()

        self.assertEqual(report["status"], "paused_retrying")
        self.assertEqual(report["completed_count"], 1)
        self.assertEqual(report["retry_wait_count"], 1)
        self.assertEqual(operation_row[0], "retrying")
        self.assertEqual(operation_row[1], "embedding_retry_wait")
        self.assertEqual(operation_row[2], "provider_unavailable")
        self.assertIn("provider offline", operation_row[3])
        self.assertTrue(operation_row[4])
        self.assertEqual(operation_row[5], "")

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

    def test_search_embedding_vectors_ignores_stale_vectors_after_chunk_content_changes(self) -> None:
        from app.core.storage.embedding_store import (
            register_embedding_model,
            search_embedding_vectors,
            upsert_embedding_vector,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
        document = upsert_retrieval_document(source_kind="memory_entry", source_id="mem_stale")
        [original_chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_stale_memory", "content": "Original memory content."}],
        )
        upsert_embedding_vector(
            original_chunk["chunk_id"],
            model["embedding_model_id"],
            [1.0, 0.0, 0.0],
            original_chunk["content_hash"],
        )
        upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_stale_memory", "content": "Updated memory content."}],
        )

        results = search_embedding_vectors(
            [1.0, 0.0, 0.0],
            {"embedding_model_ref": model["embedding_model_id"], "source_kind": "memory_entry"},
            limit=5,
        )

        self.assertEqual(results, [])

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

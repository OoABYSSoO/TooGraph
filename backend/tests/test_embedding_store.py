from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
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
            provider_key="local",
            model="hashing-v1",
            dimensions=8,
            distance_metric="cosine",
            metadata={"normalized": True},
        )

        self.assertTrue(model["embedding_model_id"].startswith("emodel_"))
        self.assertEqual(model["provider_key"], "local")
        self.assertEqual(model["model"], "hashing-v1")
        self.assertEqual(model["dimensions"], 8)
        self.assertEqual(model["distance_metric"], "cosine")
        self.assertEqual(model["metadata"]["normalized"], True)

    def test_upsert_embedding_vector_deduplicates_by_chunk_model_and_content_hash(self) -> None:
        from app.core.storage.embedding_store import register_embedding_model, upsert_embedding_vector
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="hashing-v1", dimensions=3)
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

        with sqlite3.connect(database.DB_PATH) as connection:
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

        model = register_embedding_model(provider_key="local", model="hashing-v1", dimensions=3)
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

    def test_search_embedding_vectors_uses_application_cosine_similarity(self) -> None:
        from app.core.storage.embedding_store import (
            register_embedding_model,
            search_embedding_vectors,
            upsert_embedding_vector,
        )
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="hashing-v1", dimensions=3)
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

    def test_hybrid_search_merges_fts_vector_metadata_filter_recency_and_records_audit(self) -> None:
        from app.core.storage.embedding_store import (
            build_local_text_embedding,
            register_embedding_model,
            upsert_embedding_vector,
        )
        from app.core.storage.retrieval_store import hybrid_search, upsert_retrieval_chunks, upsert_retrieval_document

        model = register_embedding_model(provider_key="local", model="hashing-v1", dimensions=16)
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
            build_local_text_embedding("refund audit evidence", dimensions=16),
            chunks[0]["content_hash"],
        )
        upsert_embedding_vector(
            "chunk_release",
            model["embedding_model_id"],
            build_local_text_embedding("release migration", dimensions=16),
            chunks[1]["content_hash"],
        )

        results = hybrid_search(
            "refund audit",
            filters={"source_kind": "buddy_message", "metadata_filter": {"topic": "refund"}},
            embedding_model_ref=model["embedding_model_id"],
            limit=5,
        )

        self.assertEqual([result["chunk_id"] for result in results], ["chunk_refund"])
        self.assertEqual(results[0]["retrieval"]["mode"], "hybrid")
        self.assertGreater(results[0]["retrieval"]["vector_score"], 0)
        self.assertGreater(results[0]["retrieval"]["lexical_score"], 0)
        self.assertGreater(results[0]["retrieval"]["recency_boost"], 0)

        with sqlite3.connect(database.DB_PATH) as connection:
            query_row = connection.execute("SELECT query_id, query_text FROM retrieval_queries").fetchone()
            result_row = connection.execute(
                "SELECT chunk_id, source_ref_json FROM retrieval_results WHERE query_id = ?",
                (query_row[0],),
            ).fetchone()

        self.assertEqual(query_row[1], "refund audit")
        self.assertEqual(result_row[0], "chunk_refund")
        self.assertEqual(json.loads(result_row[1])["source_kind"], "buddy_message")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database


class KnowledgeStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self._temp_dir.name) / "repo"
        self.repo_root.mkdir(parents=True)
        data_dir = Path(self._temp_dir.name) / "data"
        self.knowledge_root = self.repo_root / "knowledge"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", data_dir),
            patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
            patch("app.core.storage.local_input_sources.REPO_ROOT", self.repo_root),
            patch("app.core.storage.knowledge_store.REPO_ROOT", self.repo_root),
            patch("app.core.storage.knowledge_store.KNOWLEDGE_ROOT", self.knowledge_root),
        ]
        for patcher in self._patchers:
            patcher.start()
        database.initialize_storage()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._temp_dir.cleanup()

    def test_import_knowledge_folder_copies_source_into_managed_source_root(self) -> None:
        from app.core.storage.knowledge_store import import_knowledge_folder

        source_root = self.repo_root / "raw_policy"
        source_root.mkdir()
        (source_root / "guide.md").write_text("Policy guide", encoding="utf-8")

        result = import_knowledge_folder(
            name="Xi'an action policy",
            source_path="raw_policy",
            collection_id="xian_policy",
            template_id="knowledge_folder_retrieval_ingestion",
        )

        self.assertEqual(result["knowledge_base"]["collection_id"], "xian_policy")
        self.assertEqual(result["knowledge_base"]["source_root"], "knowledge/xian_policy/source")
        self.assertEqual(result["folder_package"]["kind"], "local_folder")
        self.assertEqual(result["folder_package"]["root"], "knowledge/xian_policy/source")
        self.assertEqual(result["folder_package"]["selection_mode"], "all")
        self.assertTrue((self.knowledge_root / "xian_policy" / "source" / "guide.md").is_file())
        self.assertTrue((self.knowledge_root / "xian_policy" / "knowledge.json").is_file())

    def test_import_knowledge_folder_creates_indexing_operation(self) -> None:
        from app.core.storage.knowledge_store import import_knowledge_folder

        source_dir = self.repo_root / "policy_source"
        source_dir.mkdir()
        (source_dir / "guide.md").write_text("Policy guide", encoding="utf-8")

        response = import_knowledge_folder(
            name="Policy",
            source_path=str(source_dir),
            collection_id="policy_qa",
        )

        base = response["knowledge_base"]
        operation = base["current_operation"]

        self.assertTrue(operation["operation_id"].startswith("kop_"))
        self.assertEqual(operation["collection_id"], "policy_qa")
        self.assertEqual(operation["status"], "ingesting")
        self.assertEqual(operation["stage"], "source_imported")
        self.assertEqual(base["indexing_status"], "ingesting")
        self.assertEqual(response["operation"], operation)

    def test_reimporting_same_collection_creates_distinct_indexing_operations(self) -> None:
        from app.core.storage.knowledge_store import import_knowledge_folder

        source_dir = self.repo_root / "policy_source"
        source_dir.mkdir()
        (source_dir / "guide.md").write_text("Policy guide", encoding="utf-8")

        with patch("app.core.storage.knowledge_store.utc_now_iso", return_value="2026-06-08T09:00:00Z"):
            first = import_knowledge_folder(name="Policy", source_path=str(source_dir), collection_id="policy_qa")
            second = import_knowledge_folder(name="Policy", source_path=str(source_dir), collection_id="policy_qa")

        first_operation_id = first["operation"]["operation_id"]
        second_operation_id = second["operation"]["operation_id"]
        self.assertNotEqual(first_operation_id, second_operation_id)
        with database.get_connection() as connection:
            rows = connection.execute(
                """
                SELECT operation_id
                FROM knowledge_indexing_operations
                WHERE collection_id = 'policy_qa'
                ORDER BY operation_id
                """
            ).fetchall()
        self.assertEqual({str(row["operation_id"]) for row in rows}, {first_operation_id, second_operation_id})

    def test_record_knowledge_base_run_does_not_downgrade_operation_that_already_started_embedding(self) -> None:
        from app.core.storage.knowledge_store import (
            import_knowledge_folder,
            record_knowledge_base_run,
            update_knowledge_indexing_operation,
        )

        source_dir = self.repo_root / "policy_source"
        source_dir.mkdir()
        (source_dir / "guide.md").write_text("Policy guide", encoding="utf-8")
        imported = import_knowledge_folder(name="Policy", source_path=str(source_dir), collection_id="policy_qa")
        operation_id = imported["operation"]["operation_id"]
        update_knowledge_indexing_operation(
            operation_id,
            ingestion_run_id="run_fast_ingestion",
            status="completed",
            stage="embedding_completed",
            completed_at="2026-06-08T01:00:00Z",
        )

        base = record_knowledge_base_run(
            "policy_qa",
            run_id="run_fast_ingestion",
            template_id="knowledge_folder_retrieval_ingestion",
            operation_id=operation_id,
        )

        self.assertEqual(base["last_run_id"], "run_fast_ingestion")
        self.assertEqual(base["current_operation"]["status"], "completed")
        self.assertEqual(base["current_operation"]["stage"], "embedding_completed")
        self.assertEqual(base["current_operation"]["completed_at"], "2026-06-08T01:00:00Z")

    def test_list_knowledge_bases_reports_new_retrieval_scope_counts_without_legacy_tables(self) -> None:
        from app.core.storage.embedding_store import (
            queue_embedding_job,
            register_embedding_model,
            upsert_embedding_vector,
        )
        from app.core.storage.knowledge_store import import_knowledge_folder, list_knowledge_bases
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        source_root = self.repo_root / "raw_policy"
        source_root.mkdir()
        (source_root / "guide.md").write_text("Policy guide", encoding="utf-8")
        import_knowledge_folder(name="Xi'an action policy", source_path="raw_policy", collection_id="xian_policy")

        model = register_embedding_model(provider_key="local", model="embedding", dimensions=3)
        document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="raw_policy/guide.md",
            title="guide.md",
            scope={"collection": "xian_policy"},
        )
        [chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_policy", "content": "Policy guide"}],
        )
        queue_embedding_job("knowledge_document", "raw_policy/guide.md", model["embedding_model_id"])
        upsert_embedding_vector(
            chunk_id=chunk["chunk_id"],
            model_ref=model["embedding_model_id"],
            vector=[1, 0, 0],
            content_hash=chunk["content_hash"],
        )

        [base] = list_knowledge_bases()

        self.assertEqual(base["collection_id"], "xian_policy")
        self.assertEqual(base["document_count"], 1)
        self.assertEqual(base["chunk_count"], 1)
        self.assertEqual(base["embedding_job_count"], 1)
        self.assertEqual(base["embedding_vector_count"], 1)
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            table_names = {
                row[0]
                for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
            }
        self.assertNotIn("knowledge_bases", table_names)
        self.assertNotIn("knowledge_documents", table_names)
        self.assertNotIn("knowledge_chunks", table_names)

    def test_list_knowledge_bases_reports_embedding_job_distribution(self) -> None:
        from app.core.storage.embedding_store import register_embedding_model, upsert_embedding_vector
        from app.core.storage.knowledge_store import import_knowledge_folder, list_knowledge_bases
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        source_root = self.repo_root / "raw_policy"
        source_root.mkdir()
        (source_root / "guide.md").write_text("Policy guide", encoding="utf-8")
        import_knowledge_folder(name="Policy", source_path="raw_policy", collection_id="policy_qa")

        model = register_embedding_model(provider_key="local", model="embedding", dimensions=3)
        document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="raw_policy/guide.md",
            title="guide.md",
            scope={"collection": "policy_qa"},
        )
        chunks = upsert_retrieval_chunks(
            document["document_id"],
            [
                {"chunk_id": "chunk_completed", "content": "Completed chunk"},
                {"chunk_id": "chunk_pending", "content": "Pending chunk"},
                {"chunk_id": "chunk_retry", "content": "Retry chunk"},
                {"chunk_id": "chunk_blocked", "content": "Blocked chunk"},
            ],
        )
        status_by_chunk = {
            "chunk_completed": "completed",
            "chunk_pending": "pending",
            "chunk_retry": "retry_wait",
            "chunk_blocked": "blocked",
        }
        with database.get_connection() as connection:
            for index, chunk in enumerate(chunks, start=1):
                chunk_id = str(chunk["chunk_id"])
                status = status_by_chunk[chunk_id]
                connection.execute(
                    """
                    INSERT INTO embedding_jobs (
                        job_id, source_kind, source_id, chunk_id, embedding_model_id,
                        content_hash, status, last_error_type, last_error,
                        next_retry_at, created_at, updated_at
                    ) VALUES (?, 'knowledge_document', 'raw_policy/guide.md', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"job_{chunk_id}",
                        chunk_id,
                        model["embedding_model_id"],
                        chunk["content_hash"],
                        status,
                        "rate_limit" if status == "retry_wait" else "provider_error" if status == "blocked" else "",
                        "retry later" if status == "retry_wait" else "manual review required" if status == "blocked" else "",
                        "2026-06-08T10:00:00Z" if status == "retry_wait" else "",
                        f"2026-06-08T09:00:0{index}Z",
                        f"2026-06-08T09:00:0{index}Z",
                    ),
                )
        completed_chunk = next(chunk for chunk in chunks if chunk["chunk_id"] == "chunk_completed")
        upsert_embedding_vector(
            chunk_id=completed_chunk["chunk_id"],
            model_ref=model["embedding_model_id"],
            vector=[1, 0, 0],
            content_hash=completed_chunk["content_hash"],
        )

        [base] = list_knowledge_bases()

        self.assertEqual(base["embedding_job_count"], 4)
        self.assertEqual(base["completed_embedding_job_count"], 1)
        self.assertEqual(base["pending_embedding_job_count"], 1)
        self.assertEqual(base["retry_wait_embedding_job_count"], 1)
        self.assertEqual(base["blocked_embedding_job_count"], 1)
        self.assertEqual(base["indexing_status"], "needs_attention")
        self.assertEqual(base["last_error_type"], "provider_error")
        self.assertEqual(base["last_error"], "manual review required")
        self.assertEqual(base["next_retry_at"], "2026-06-08T10:00:00Z")
        self.assertIn("current_operation", base)

    def test_list_knowledge_bases_ignores_stale_embedding_jobs_vectors_errors_and_retries(self) -> None:
        from app.core.storage.embedding_store import queue_embedding_job, register_embedding_model, upsert_embedding_vector
        from app.core.storage.knowledge_store import import_knowledge_folder, list_knowledge_bases
        from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

        source_root = self.repo_root / "raw_policy"
        source_root.mkdir()
        (source_root / "guide.md").write_text("Policy guide", encoding="utf-8")
        import_knowledge_folder(name="Policy", source_path="raw_policy", collection_id="policy_qa")

        model = register_embedding_model(provider_key="local", model="embedding", dimensions=3)
        document = upsert_retrieval_document(
            source_kind="knowledge_document",
            source_id="raw_policy/guide.md",
            title="guide.md",
            scope={"collection": "policy_qa"},
        )
        [old_chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_policy", "content": "Old policy guide"}],
        )
        with database.get_connection() as connection:
            connection.execute(
                """
                INSERT INTO embedding_jobs (
                    job_id, source_kind, source_id, chunk_id, embedding_model_id,
                    content_hash, status, last_error_type, last_error,
                    next_retry_at, created_at, updated_at, completed_at
                ) VALUES (
                    'job_stale_completed', 'knowledge_document', 'raw_policy/guide.md',
                    'chunk_policy', ?, ?, 'completed', 'stale_error', 'old error',
                    '2026-06-08T10:00:00Z', '2026-06-08T08:00:00Z',
                    '2026-06-08T11:00:00Z', '2026-06-08T08:01:00Z'
                )
                """,
                (model["embedding_model_id"], old_chunk["content_hash"]),
            )
        upsert_embedding_vector(
            chunk_id="chunk_policy",
            model_ref=model["embedding_model_id"],
            vector=[1, 0, 0],
            content_hash=old_chunk["content_hash"],
        )

        [current_chunk] = upsert_retrieval_chunks(
            document["document_id"],
            [{"chunk_id": "chunk_policy", "content": "Current policy guide"}],
        )
        self.assertNotEqual(old_chunk["content_hash"], current_chunk["content_hash"])
        queue_embedding_job("knowledge_document", "raw_policy/guide.md", model["embedding_model_id"])

        [base] = list_knowledge_bases()

        self.assertEqual(base["embedding_job_count"], 1)
        self.assertEqual(base["completed_embedding_job_count"], 0)
        self.assertEqual(base["pending_embedding_job_count"], 1)
        self.assertEqual(base["embedding_vector_count"], 0)
        self.assertEqual(base["indexing_status"], "indexing")
        self.assertEqual(base["last_error_type"], "")
        self.assertEqual(base["last_error"], "")
        self.assertEqual(base["next_retry_at"], "")


if __name__ == "__main__":
    unittest.main()

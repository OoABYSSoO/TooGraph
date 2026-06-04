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

from app.buddy import store
from app.core.storage import database


class BuddySessionSummaryRetrievalProjectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        data_dir = Path(self._temp_dir.name) / "data"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", data_dir),
            patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
            patch.object(store, "BUDDY_HOME_DIR", Path(self._temp_dir.name) / "buddy_home"),
            patch("app.core.storage.settings_store.load_app_settings", return_value={}),
        ]
        for patcher in self._patchers:
            patcher.start()
        database.initialize_storage()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._temp_dir.cleanup()

    def test_save_session_summary_projects_summary_into_retrieval_and_queues_embeddings(self) -> None:
        from app.core.storage.embedding_store import register_embedding_model

        model = register_embedding_model(provider_key="openai", model="text-embedding-3-small", dimensions=3)
        session = store.create_chat_session(
            {"session_id": "session_summary_projection", "title": "Summary Projection"},
            changed_by="user",
            change_reason="test",
        )
        message = store.append_chat_message(
            session["session_id"],
            {
                "message_id": "msg_summary_projection_1",
                "role": "user",
                "content": "We agreed that memory chunks should be indexed after compaction.",
            },
            changed_by="user",
            change_reason="test",
        )

        store.save_session_summary(
            {
                "summary_id": "summary_projection_1",
                "session_id": session["session_id"],
                "content": "Memory compaction produced a durable summary about chunk ingestion timing.",
                "source_run_id": "run_summary_projection",
                "source_refs": [
                    {
                        "source_kind": "buddy_message",
                        "source_id": message["message_id"],
                        "role": "user",
                    }
                ],
                "embedding_model_refs": [model["embedding_model_id"]],
            },
            changed_by="buddy",
            change_reason="test summary projection",
        )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            document_row = connection.execute(
                """
                SELECT source_kind, source_id, source_revision_id, title, scope_json, metadata_json
                FROM retrieval_documents
                WHERE source_kind = 'buddy_session_summary' AND source_id = 'summary_projection_1'
                """
            ).fetchone()
            chunk_row = connection.execute(
                """
                SELECT chunk_id, source_kind, source_id, source_locator_json, content, metadata_json
                FROM retrieval_chunks
                WHERE source_kind = 'buddy_session_summary' AND source_id = 'summary_projection_1'
                """
            ).fetchone()
            job_row = connection.execute(
                """
                SELECT source_kind, source_id, embedding_model_id, status
                FROM embedding_jobs
                WHERE source_kind = 'buddy_session_summary' AND source_id = 'summary_projection_1'
                """
            ).fetchone()

        self.assertIsNotNone(document_row)
        self.assertEqual(document_row[0], "buddy_session_summary")
        self.assertEqual(document_row[1], "summary_projection_1")
        self.assertTrue(str(document_row[2]).startswith("rev_"))
        self.assertIn("Summary Projection", document_row[3])
        self.assertEqual(json.loads(document_row[4])["session_id"], session["session_id"])
        self.assertEqual(json.loads(document_row[5])["source_run_id"], "run_summary_projection")

        self.assertIsNotNone(chunk_row)
        self.assertTrue(chunk_row[0].startswith("buddy_session_summary:summary_projection_1:"))
        self.assertEqual(chunk_row[1], "buddy_session_summary")
        self.assertEqual(chunk_row[2], "summary_projection_1")
        locator = json.loads(chunk_row[3])
        self.assertEqual(locator["session_id"], session["session_id"])
        self.assertEqual(locator["source_refs"][0]["source_id"], message["message_id"])
        self.assertIn("chunk ingestion timing", chunk_row[4])
        self.assertEqual(json.loads(chunk_row[5])["role"], "buddy_session_summary")

        self.assertEqual(job_row, ("buddy_session_summary", "summary_projection_1", model["embedding_model_id"], "pending"))

    def test_save_session_summary_queues_default_embedding_model_from_settings(self) -> None:
        embedding_settings = {
            "embedding_model_ref": "local/text-embedding-qwen3-embedding-8b",
            "model_providers": {
                "local": {
                    "label": "Local",
                    "transport": "openai-compatible",
                    "base_url": "http://127.0.0.1:1234/v1",
                    "enabled": True,
                    "models": [
                        {
                            "model": "text-embedding-qwen3-embedding-8b",
                            "label": "text-embedding-qwen3-embedding-8b",
                            "capabilities": {"chat": False, "embedding": True},
                            "embedding": {"dimensions": 4096},
                        }
                    ],
                }
            },
        }

        with patch("app.core.storage.settings_store.load_app_settings", return_value=embedding_settings):
            session = store.create_chat_session(
                {"session_id": "session_default_summary_embedding", "title": "Default Summary Embedding"},
                changed_by="user",
                change_reason="test",
            )
            store.save_session_summary(
                {
                    "summary_id": "summary_default_embedding",
                    "session_id": session["session_id"],
                    "content": "Default embedding model should queue the compacted memory summary.",
                    "source_run_id": "run_default_summary_embedding",
                    "source_refs": [],
                },
                changed_by="buddy",
                change_reason="test summary projection",
            )

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            model_row = connection.execute(
                """
                SELECT embedding_model_id, provider_key, model, dimensions, enabled
                FROM embedding_models
                WHERE provider_key = 'local' AND model = 'text-embedding-qwen3-embedding-8b'
                """
            ).fetchone()
            job_row = connection.execute(
                """
                SELECT source_kind, source_id, embedding_model_id, status
                FROM embedding_jobs
                WHERE source_kind = 'buddy_session_summary' AND source_id = 'summary_default_embedding'
                """
            ).fetchone()

        self.assertIsNotNone(model_row)
        self.assertEqual(model_row[1:], ("local", "text-embedding-qwen3-embedding-8b", 4096, 1))
        self.assertIsNotNone(job_row)
        self.assertEqual(job_row[0], "buddy_session_summary")
        self.assertEqual(job_row[1], "summary_default_embedding")
        self.assertEqual(job_row[2], model_row[0])
        self.assertEqual(job_row[3], "pending")


if __name__ == "__main__":
    unittest.main()

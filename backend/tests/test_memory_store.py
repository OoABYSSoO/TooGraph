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


class MemoryStoreTests(unittest.TestCase):
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

    def test_create_memory_entry_creates_revision_event_and_retrieval_projection(self) -> None:
        from app.core.storage.memory_store import create_memory_entry

        memory = create_memory_entry(
            scope_kind="buddy_session",
            scope_id="session_1",
            layer="long_term",
            memory_type="preference",
            title="事实源偏好",
            content="用户倾向把图运行记录作为唯一事实源。",
            confidence=0.9,
            salience=0.8,
            sources=[
                {
                    "source_kind": "buddy_message",
                    "source_id": "msg_1",
                    "source_revision_id": "msgrev_1",
                    "source_locator": {"field": "content"},
                }
            ],
            metadata={"topic": "storage"},
        )

        with sqlite3.connect(database.DB_PATH) as connection:
            revision_count = connection.execute("SELECT COUNT(*) FROM memory_revisions").fetchone()[0]
            event_count = connection.execute("SELECT COUNT(*) FROM memory_events").fetchone()[0]
            retrieval_doc = connection.execute(
                "SELECT source_kind, source_id FROM retrieval_documents WHERE source_id = ?",
                (memory["memory_id"],),
            ).fetchone()
            retrieval_chunk = connection.execute(
                "SELECT content FROM retrieval_chunks WHERE source_id = ?",
                (memory["memory_id"],),
            ).fetchone()

        self.assertEqual(memory["latest_revision_id"], memory["revisions"][0]["revision_id"])
        self.assertEqual(revision_count, 1)
        self.assertEqual(event_count, 1)
        self.assertEqual(retrieval_doc, ("memory_entry", memory["memory_id"]))
        self.assertIn("唯一事实源", retrieval_chunk[0])

    def test_memory_retrieval_projection_queues_enabled_embedding_models(self) -> None:
        from app.core.storage.embedding_store import register_embedding_model
        from app.core.storage.memory_store import create_memory_entry, update_memory_entry

        model = register_embedding_model(provider_key="local", model="hashing-v1", dimensions=16)
        memory = create_memory_entry(
            scope_kind="buddy_session",
            scope_id="session_1",
            layer="long_term",
            memory_type="preference",
            title="召回偏好",
            content="用户希望新记忆自动进入 embedding dirty queue。",
        )
        update_memory_entry(
            memory["memory_id"],
            {"content": "用户希望更新后的记忆自动进入 embedding dirty queue。"},
        )

        with sqlite3.connect(database.DB_PATH) as connection:
            jobs = connection.execute(
                """
                SELECT source_kind, source_id, chunk_id, embedding_model_id, content_hash, status, last_error
                FROM embedding_jobs
                WHERE source_id = ?
                ORDER BY created_at ASC, job_id ASC
                """,
                (memory["memory_id"],),
            ).fetchall()
            current_chunk = connection.execute(
                "SELECT chunk_id, content_hash FROM retrieval_chunks WHERE source_id = ?",
                (memory["memory_id"],),
            ).fetchone()

        self.assertEqual(len(jobs), 2)
        self.assertEqual(jobs[0][5], "failed")
        self.assertIn("superseded", jobs[0][6])
        self.assertEqual(jobs[1][0], "memory_entry")
        self.assertEqual(jobs[1][1], memory["memory_id"])
        self.assertEqual(jobs[1][2], current_chunk[0])
        self.assertEqual(jobs[1][3], model["embedding_model_id"])
        self.assertEqual(jobs[1][4], current_chunk[1])
        self.assertEqual(jobs[1][5], "pending")

    def test_create_memory_entry_skips_duplicate_content_and_merges_sources(self) -> None:
        from app.core.storage.memory_store import create_memory_entry

        first = create_memory_entry(
            scope_kind="buddy",
            scope_id="default",
            layer="long_term",
            memory_type="preference",
            title="回复偏好",
            content="用户偏好先看结论，再看细节。",
            sources=[{"source_kind": "buddy_message", "source_id": "msg_original"}],
        )
        duplicate = create_memory_entry(
            scope_kind="buddy",
            scope_id="default",
            layer="long_term",
            memory_type="preference",
            title="重复回复偏好",
            content=" 用户偏好先看结论，再看细节。 ",
            sources=[{"source_kind": "buddy_message", "source_id": "msg_duplicate"}],
        )

        with sqlite3.connect(database.DB_PATH) as connection:
            memory_count = connection.execute("SELECT COUNT(*) FROM memory_entries").fetchone()[0]
            revision_operations = [
                row[0]
                for row in connection.execute(
                    "SELECT operation FROM memory_revisions WHERE memory_id = ? ORDER BY revision_number",
                    (first["memory_id"],),
                ).fetchall()
            ]
            event_types = [
                row[0]
                for row in connection.execute(
                    "SELECT event_type FROM memory_events WHERE memory_id = ? ORDER BY created_at, event_id",
                    (first["memory_id"],),
                ).fetchall()
            ]

        self.assertEqual(duplicate["memory_id"], first["memory_id"])
        self.assertEqual(duplicate["dedupe"]["status"], "skipped_duplicate")
        self.assertEqual(duplicate["dedupe"]["reason"], "duplicate_canonical_content")
        self.assertEqual(duplicate["dedupe"]["requested_title"], "重复回复偏好")
        self.assertTrue(duplicate["dedupe"]["content_fingerprint"].startswith("sha256:"))
        self.assertEqual(memory_count, 1)
        self.assertEqual(
            [(source["source_kind"], source["source_id"]) for source in duplicate["sources"]],
            [("buddy_message", "msg_original"), ("buddy_message", "msg_duplicate")],
        )
        self.assertEqual(revision_operations, ["create", "dedupe_merge_sources"])
        self.assertEqual(event_types, ["created", "duplicate_skipped"])

    def test_create_memory_entry_skips_near_duplicate_content(self) -> None:
        from app.core.storage.memory_store import create_memory_entry

        first = create_memory_entry(
            scope_kind="buddy",
            scope_id="default",
            layer="long_term",
            memory_type="preference",
            title="技术方案回复偏好",
            content="用户希望技术方案先给结论，再展开依据和取舍。",
            sources=[{"source_kind": "buddy_message", "source_id": "msg_near_original"}],
        )
        duplicate = create_memory_entry(
            scope_kind="buddy",
            scope_id="default",
            layer="long_term",
            memory_type="preference",
            title="近似技术方案偏好",
            content="技术方案回复要先给结论，然后说明依据、取舍和验证。",
            sources=[{"source_kind": "buddy_message", "source_id": "msg_near_duplicate"}],
        )

        with sqlite3.connect(database.DB_PATH) as connection:
            memory_count = connection.execute("SELECT COUNT(*) FROM memory_entries").fetchone()[0]
            duplicate_event = connection.execute(
                """
                SELECT detail_json
                FROM memory_events
                WHERE memory_id = ? AND event_type = 'duplicate_skipped'
                ORDER BY created_at DESC, event_id DESC
                LIMIT 1
                """,
                (first["memory_id"],),
            ).fetchone()

        self.assertEqual(duplicate["memory_id"], first["memory_id"])
        self.assertEqual(duplicate["dedupe"]["status"], "skipped_duplicate")
        self.assertEqual(duplicate["dedupe"]["reason"], "near_duplicate_content")
        self.assertGreaterEqual(duplicate["dedupe"]["similarity_score"], 0.58)
        self.assertEqual(memory_count, 1)
        self.assertEqual(
            [(source["source_kind"], source["source_id"]) for source in duplicate["sources"]],
            [("buddy_message", "msg_near_original"), ("buddy_message", "msg_near_duplicate")],
        )
        self.assertEqual(json.loads(duplicate_event[0])["reason"], "near_duplicate_content")

    def test_memory_entry_sources_can_reference_supported_fact_types(self) -> None:
        from app.core.storage.memory_store import create_memory_entry

        memory = create_memory_entry(
            scope_kind="buddy",
            scope_id="default",
            layer="session",
            memory_type="observation",
            title="多来源记忆",
            content="这条记忆来自消息、运行、输出和召回 chunk。",
            sources=[
                {"source_kind": "buddy_message", "source_id": "msg_1", "source_revision_id": "rev_1"},
                {"source_kind": "graph_run", "source_id": "run_1"},
                {"source_kind": "graph_output", "source_id": "output_1"},
                {"source_kind": "retrieval_chunk", "source_id": "chunk_1"},
            ],
        )

        self.assertEqual(
            [source["source_kind"] for source in memory["sources"]],
            ["buddy_message", "graph_run", "graph_output", "retrieval_chunk"],
        )

    def test_update_and_archive_preserve_revisions_and_update_retrieval_projection(self) -> None:
        from app.core.storage.memory_store import archive_memory_entry, create_memory_entry, update_memory_entry

        memory = create_memory_entry(
            scope_kind="buddy",
            scope_id="default",
            layer="long_term",
            memory_type="preference",
            title="召回偏好",
            content="用户偏好短摘要。",
        )
        updated = update_memory_entry(
            memory["memory_id"],
            {"content": "用户偏好先看结论，再看细节。", "salience": 0.7},
            changed_by="buddy",
            change_reason="测试更新",
        )
        archived = archive_memory_entry(memory["memory_id"], changed_by="buddy", change_reason="测试归档")

        with sqlite3.connect(database.DB_PATH) as connection:
            revision_count = connection.execute(
                "SELECT COUNT(*) FROM memory_revisions WHERE memory_id = ?",
                (memory["memory_id"],),
            ).fetchone()[0]
            retrieval_chunk = connection.execute(
                "SELECT content FROM retrieval_chunks WHERE source_id = ?",
                (memory["memory_id"],),
            ).fetchone()

        self.assertEqual(updated["content"], "用户偏好先看结论，再看细节。")
        self.assertEqual(archived["status"], "archived")
        self.assertEqual(revision_count, 3)
        self.assertIn("先看结论", retrieval_chunk[0])

    def test_recall_memories_returns_source_refs(self) -> None:
        from app.core.storage.memory_store import create_memory_entry, recall_memories

        memory = create_memory_entry(
            scope_kind="buddy_session",
            scope_id="session_1",
            layer="long_term",
            memory_type="preference",
            title="数据库设计偏好",
            content="用户偏好完整 embedding 方案服务记忆召回。",
        )

        results = recall_memories(
            "embedding 记忆召回",
            filters={"scope_kind": "buddy_session", "scope_id": "session_1"},
            limit=3,
        )

        self.assertEqual(results[0]["memory_id"], memory["memory_id"])
        self.assertEqual(results[0]["source_ref"]["source_kind"], "memory_entry")
        self.assertEqual(results[0]["source_ref"]["source_id"], memory["memory_id"])

    def test_recall_memories_uses_reranker_without_embedding_model(self) -> None:
        from app.core.storage.memory_store import create_memory_entry, recall_memories

        first = create_memory_entry(
            memory_id="mem_base_first",
            scope_kind="buddy",
            scope_id="default",
            layer="long_term",
            memory_type="preference",
            title="基础排序靠前",
            content="rerank-memory-evidence older preference.",
        )
        second = create_memory_entry(
            memory_id="mem_reranked_first",
            scope_kind="buddy",
            scope_id="default",
            layer="long_term",
            memory_type="preference",
            title="重排靠前",
            content="rerank-memory-evidence exact current preference.",
        )

        def fake_rerank(**kwargs):
            self.assertEqual(kwargs["model_ref"], "local-rerank/bge-reranker-v2")
            self.assertEqual(len(kwargs["documents"]), 2)
            exact_index = 0 if "exact current" in kwargs["documents"][0] else 1
            other_index = 1 - exact_index
            return [
                {"index": exact_index, "score": 0.98, "document": kwargs["documents"][exact_index]},
                {"index": other_index, "score": 0.41, "document": kwargs["documents"][other_index]},
            ], {"provider_id": "local-rerank", "model": "bge-reranker-v2"}

        with patch("app.core.storage.retrieval_store.rerank_documents_with_model_ref", side_effect=fake_rerank):
            results = recall_memories(
                "rerank-memory-evidence preference",
                filters={"reranker_model_ref": "local-rerank/bge-reranker-v2"},
                limit=2,
            )

        self.assertEqual([memory["memory_id"] for memory in results], [second["memory_id"], first["memory_id"]])
        self.assertEqual(results[0]["retrieval"]["mode"], "hybrid_rerank")
        self.assertEqual(results[0]["retrieval"]["rerank_score"], 0.98)


if __name__ == "__main__":
    unittest.main()

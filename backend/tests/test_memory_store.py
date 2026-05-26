from __future__ import annotations

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


if __name__ == "__main__":
    unittest.main()

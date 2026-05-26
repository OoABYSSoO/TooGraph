from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database


class ContextAssemblyStoreTests(unittest.TestCase):
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

    def test_create_context_assembly_persists_renderer_budget_sources_and_rendered_hash(self) -> None:
        from app.core.storage.context_assembly_store import create_context_assembly, load_context_assembly

        ref = create_context_assembly(
            target_state_key="conversation_history",
            renderer_key="buddy_history",
            renderer_version="1",
            rendered_text="伙伴: 我在。",
            sources=[
                {
                    "source_kind": "buddy_message",
                    "source_id": "msg_1",
                    "source_revision_id": "rev_1",
                    "source_content_hash": "sha256:message",
                    "role": "assistant",
                    "label": "turn 1",
                }
            ],
            budget={"max_messages": 12, "max_chars": 4000},
            metadata={"session_id": "session_1"},
        )
        loaded = load_context_assembly(ref["assembly_id"])

        self.assertEqual(ref["kind"], "context_assembly_ref")
        self.assertEqual(ref["target_state_key"], "conversation_history")
        self.assertEqual(ref["renderer_key"], "buddy_history")
        self.assertEqual(ref["renderer_version"], "1")
        self.assertTrue(ref["rendered_content_hash"].startswith("sha256:"))
        self.assertEqual(ref["source_count"], 1)
        self.assertEqual(loaded["budget"], {"max_messages": 12, "max_chars": 4000})
        self.assertEqual(loaded["metadata"], {"session_id": "session_1"})
        self.assertEqual(loaded["sources"][0]["source_kind"], "buddy_message")
        self.assertEqual(loaded["sources"][0]["source_id"], "msg_1")
        self.assertEqual(loaded["sources"][0]["source_revision_id"], "rev_1")

    def test_create_context_assembly_deduplicates_identical_rendered_text_blobs(self) -> None:
        from app.core.storage.context_assembly_store import create_context_assembly

        first = create_context_assembly(
            target_state_key="conversation_history",
            renderer_key="buddy_history",
            renderer_version="1",
            rendered_text="用户: 你好",
            sources=[],
        )
        second = create_context_assembly(
            target_state_key="conversation_history",
            renderer_key="buddy_history",
            renderer_version="1",
            rendered_text="用户: 你好",
            sources=[],
        )

        with sqlite3.connect(database.DB_PATH) as connection:
            blob_count = connection.execute("SELECT COUNT(*) FROM content_blobs").fetchone()[0]

        self.assertEqual(first["rendered_content_hash"], second["rendered_content_hash"])
        self.assertEqual(blob_count, 1)

    def test_expand_context_assembly_ref_returns_rendered_blob(self) -> None:
        from app.core.storage.context_assembly_store import create_context_assembly, expand_context_assembly_ref

        ref = create_context_assembly(
            target_state_key="conversation_history",
            renderer_key="buddy_history",
            renderer_version="1",
            rendered_text="用户: 你好\n伙伴: 我在。",
            sources=[],
        )

        expanded = expand_context_assembly_ref(ref)

        self.assertEqual(expanded["text"], "用户: 你好\n伙伴: 我在。")
        self.assertEqual(expanded["assembly"]["assembly_id"], ref["assembly_id"])
        self.assertEqual(expanded["warnings"], [])

    def test_expand_context_assembly_ref_materializes_pending_ref_from_source_refs(self) -> None:
        from app.core.storage.context_assembly_store import expand_context_assembly_ref

        self._insert_buddy_message("msg_1", "session_1", "assistant", "我会查运行事实。")
        ref = {
            "kind": "context_assembly_ref",
            "assembly_id": "ctx_pending_test",
            "target_state_key": "conversation_history",
            "renderer_key": "buddy_history",
            "renderer_version": "1",
            "rendered_content_hash": "",
            "source_count": 1,
            "source_refs": [
                {
                    "source_kind": "buddy_message",
                    "source_id": "msg_1",
                    "role": "assistant",
                    "ordinal": 0,
                }
            ],
        }

        expanded = expand_context_assembly_ref(ref)

        self.assertEqual(expanded["text"], "伙伴: 我会查运行事实。")
        self.assertEqual(expanded["assembly"]["assembly_id"], "ctx_pending_test")
        self.assertEqual(expanded["assembly"]["source_count"], 1)

    def test_expand_context_assembly_ref_rebuilds_from_sources_and_audits_hash_mismatch_when_blob_is_missing(self) -> None:
        from app.core.storage.context_assembly_store import create_context_assembly, expand_context_assembly_ref

        self._insert_buddy_message("msg_1", "session_1", "user", "原始内容")
        ref = create_context_assembly(
            target_state_key="conversation_history",
            renderer_key="buddy_history",
            renderer_version="1",
            rendered_text="用户: 原始内容",
            sources=[
                {
                    "source_kind": "buddy_message",
                    "source_id": "msg_1",
                    "role": "user",
                }
            ],
        )
        with sqlite3.connect(database.DB_PATH) as connection:
            connection.execute("DELETE FROM content_blobs WHERE content_hash = ?", (ref["rendered_content_hash"],))
            connection.execute("UPDATE buddy_messages SET content = ? WHERE message_id = ?", ("修改后的内容", "msg_1"))
            connection.commit()

        expanded = expand_context_assembly_ref(ref)

        self.assertEqual(expanded["text"], "用户: 修改后的内容")
        self.assertEqual(expanded["warnings"][0]["code"], "rendered_hash_mismatch")
        self.assertIn("rendered hash mismatch", expanded["warnings"][0]["message"])

    def _insert_buddy_message(self, message_id: str, session_id: str, role: str, content: str) -> None:
        with sqlite3.connect(database.DB_PATH) as connection:
            connection.execute(
                """
                INSERT INTO buddy_sessions (
                    session_id, title, archived, deleted, source, created_at, updated_at
                ) VALUES (?, ?, 0, 0, 'buddy', ?, ?)
                """,
                (session_id, "测试会话", "2026-05-26T00:00:00Z", "2026-05-26T00:00:00Z"),
            )
            connection.execute(
                """
                INSERT INTO buddy_messages (
                    message_id,
                    session_id,
                    role,
                    content,
                    client_order,
                    include_in_context,
                    run_id,
                    metadata_json,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, 0, 1, NULL, '{}', ?, ?)
                """,
                (message_id, session_id, role, content, "2026-05-26T00:00:01Z", "2026-05-26T00:00:01Z"),
            )
            connection.commit()


if __name__ == "__main__":
    unittest.main()

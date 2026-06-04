from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store
from app.buddy.fake_history import FakeHistoryOptions, build_fake_history_dataset, seed_fake_history
from app.core.storage import database


class BuddyFakeHistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self._data_temp_dir = tempfile.TemporaryDirectory()
        data_dir = Path(self._data_temp_dir.name) / "data"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", data_dir),
            patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"),
            patch("app.core.storage.settings_store.load_app_settings", return_value={}),
        ]
        for patcher in self._patchers:
            patcher.start()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._data_temp_dir.cleanup()

    def test_fake_history_dataset_is_deterministic_and_has_buddy_shape(self) -> None:
        options = FakeHistoryOptions(
            batch_id="test_batch",
            session_count=3,
            min_turns=2,
            max_turns=4,
            seed=42,
        )

        first = build_fake_history_dataset(options)
        second = build_fake_history_dataset(options)

        self.assertEqual(first, second)
        self.assertEqual(len(first), 3)
        for session_index, session in enumerate(first, start=1):
            self.assertEqual(session["session_id"], f"synthetic_test_batch_s{session_index:04d}")
            self.assertEqual(session["source"], "synthetic_buddy_history")
            self.assertGreaterEqual(len(session["messages"]), 4)
            self.assertEqual(len(session["messages"]) % 2, 0)
            for message_index, message in enumerate(session["messages"]):
                expected_role = "user" if message_index % 2 == 0 else "assistant"
                self.assertEqual(message["role"], expected_role)
                self.assertTrue(message["content"].strip())
                self.assertEqual(message["metadata"]["synthetic_batch_id"], "test_batch")
                self.assertEqual(message["metadata"]["synthetic"], True)

    def test_seed_fake_history_uses_buddy_store_and_projects_messages_to_retrieval(self) -> None:
        result = seed_fake_history(
            FakeHistoryOptions(
                batch_id="write_test",
                session_count=2,
                min_turns=1,
                max_turns=1,
                seed=7,
            )
        )

        self.assertEqual(result["session_count"], 2)
        self.assertEqual(result["message_count"], 4)
        self.assertEqual(result["retrieval_chunk_count"], 4)
        self.assertEqual(result["embedding_job_count"], 0)

        sessions = store.list_chat_sessions(include_deleted=True)
        self.assertEqual(len(sessions), 2)
        self.assertEqual({session["source"] for session in sessions}, {"synthetic_buddy_history"})

        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            buddy_messages = connection.execute("SELECT COUNT(*) FROM buddy_messages").fetchone()[0]
            retrieval_chunks = connection.execute(
                "SELECT COUNT(*) FROM retrieval_chunks WHERE source_kind = 'buddy_message'"
            ).fetchone()[0]
            embedding_jobs = connection.execute(
                "SELECT COUNT(*) FROM embedding_jobs WHERE source_kind = 'buddy_message'"
            ).fetchone()[0]

        self.assertEqual(buddy_messages, 4)
        self.assertEqual(retrieval_chunks, 4)
        self.assertEqual(embedding_jobs, 0)


if __name__ == "__main__":
    unittest.main()

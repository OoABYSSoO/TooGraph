from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database


class StorageDatabaseTests(unittest.TestCase):
    def test_initialize_storage_creates_graph_run_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()
                with sqlite3.connect(db_path) as connection:
                    table_names = {
                        row[0]
                        for row in connection.execute(
                            "SELECT name FROM sqlite_master WHERE type = 'table'"
                        ).fetchall()
                    }
                    index_names = {
                        row[0]
                        for row in connection.execute(
                            "SELECT name FROM sqlite_master WHERE type = 'index'"
                        ).fetchall()
                    }

        self.assertTrue(
            {
                "content_blobs",
                "graph_runs",
                "graph_run_snapshots",
                "graph_node_executions",
                "graph_run_events",
                "graph_state_events",
                "graph_outputs",
                "graph_artifacts",
                "graph_capability_invocations",
                "graph_model_calls",
            }.issubset(table_names)
        )
        self.assertTrue(
            {
                "idx_graph_runs_started",
                "idx_graph_runs_status",
                "idx_graph_runs_parent",
                "idx_graph_runs_root",
                "idx_graph_runs_graph",
                "idx_graph_node_executions_run_order",
                "idx_graph_node_executions_node",
                "idx_graph_run_events_sequence",
                "idx_graph_run_events_type",
            }.issubset(index_names)
        )

    def test_initialize_storage_is_idempotent_for_graph_run_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()
                with sqlite3.connect(db_path) as connection:
                    connection.execute(
                        """
                        INSERT INTO graph_runs (
                            run_id,
                            root_run_id,
                            graph_name,
                            status,
                            started_at,
                            created_at,
                            updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            "run_schema_test",
                            "run_schema_test",
                            "Schema Test",
                            "completed",
                            "2026-05-26T00:00:00Z",
                            "2026-05-26T00:00:00Z",
                            "2026-05-26T00:00:00Z",
                        ),
                    )
                    connection.commit()

                database.initialize_storage()
                with sqlite3.connect(db_path) as connection:
                    count = connection.execute(
                        "SELECT COUNT(*) FROM graph_runs WHERE run_id = ?",
                        ("run_schema_test",),
                    ).fetchone()[0]

        self.assertEqual(count, 1)

    def test_content_blobs_are_deduplicated_by_hash(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()
                from app.core.storage.content_blob_store import get_content_blob, put_content_blob

                first = put_content_blob("重复上下文", "text/plain", {"source": "test"})
                second = put_content_blob("重复上下文", "text/plain", {"source": "test"})
                loaded = get_content_blob(first["content_hash"])
                with sqlite3.connect(db_path) as connection:
                    count = connection.execute("SELECT COUNT(*) FROM content_blobs").fetchone()[0]

        self.assertEqual(first["content_hash"], second["content_hash"])
        self.assertEqual(count, 1)
        self.assertEqual(loaded["content_text"], "重复上下文")
        self.assertEqual(loaded["mime_type"], "text/plain")

    def test_initialize_storage_drops_legacy_platform_memory_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            data_dir.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(db_path) as connection:
                connection.executescript(
                    """
                    CREATE TABLE memories (id TEXT PRIMARY KEY);
                    CREATE TABLE memory_revisions (revision_id TEXT PRIMARY KEY);
                    CREATE TABLE memory_events (event_id TEXT PRIMARY KEY);
                    CREATE VIRTUAL TABLE memories_fts USING fts5(memory_id, content);
                    """
                )

            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()
                with sqlite3.connect(db_path) as connection:
                    table_names = {
                        row[0]
                        for row in connection.execute(
                            "SELECT name FROM sqlite_master WHERE type = 'table'"
                        ).fetchall()
                    }

            self.assertIn("knowledge_bases", table_names)
            self.assertIn("memory_entries", table_names)
            self.assertIn("memory_revisions", table_names)
            self.assertIn("memory_events", table_names)
            self.assertNotIn("memories", table_names)
            self.assertNotIn("memories_fts", table_names)


if __name__ == "__main__":
    unittest.main()

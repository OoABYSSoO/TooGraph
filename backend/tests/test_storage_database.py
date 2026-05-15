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
            self.assertNotIn("memories", table_names)
            self.assertNotIn("memory_revisions", table_names)
            self.assertNotIn("memory_events", table_names)
            self.assertNotIn("memories_fts", table_names)


if __name__ == "__main__":
    unittest.main()

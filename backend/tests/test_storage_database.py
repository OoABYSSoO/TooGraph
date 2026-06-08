from __future__ import annotations

import sqlite3
import tempfile
import unittest
from contextlib import closing
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
                with closing(sqlite3.connect(db_path)) as connection:
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
                "capability_usage_events",
                "agent_loop_events",
                "graph_model_calls",
                "provider_prompt_cache_resources",
                "scheduled_graph_jobs",
                "scheduled_graph_job_runs",
                "scheduled_delivery_attempts",
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
                "idx_agent_loop_events_run",
                "idx_agent_loop_events_stop_reason",
                "idx_capability_usage_events_run",
                "idx_capability_usage_events_key",
                "idx_graph_model_calls_started",
                "idx_provider_prompt_cache_resources_lookup",
                "idx_provider_prompt_cache_resources_status",
                "idx_scheduled_graph_jobs_due",
                "idx_scheduled_graph_jobs_template",
                "idx_scheduled_graph_job_runs_job",
                "idx_scheduled_graph_job_runs_run",
                "idx_scheduled_delivery_attempts_run",
                "idx_scheduled_delivery_attempts_job",
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
                with closing(sqlite3.connect(db_path)) as connection:
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
                with closing(sqlite3.connect(db_path)) as connection:
                    count = connection.execute(
                        "SELECT COUNT(*) FROM graph_runs WHERE run_id = ?",
                        ("run_schema_test",),
                    ).fetchone()[0]

        self.assertEqual(count, 1)

    def test_storage_includes_knowledge_indexing_operations_and_embedding_recovery_columns(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()
                with closing(sqlite3.connect(database.DB_PATH)) as connection:
                    table_names = {
                        row[0]
                        for row in connection.execute(
                            "SELECT name FROM sqlite_master WHERE type = 'table'"
                        ).fetchall()
                    }
                    operation_columns = {
                        row[1]
                        for row in connection.execute(
                            "PRAGMA table_info(knowledge_indexing_operations)"
                        ).fetchall()
                    }
                    embedding_job_columns = {
                        row[1]
                        for row in connection.execute("PRAGMA table_info(embedding_jobs)").fetchall()
                    }

        self.assertIn("knowledge_indexing_operations", table_names)
        self.assertIn("operation_id", operation_columns)
        self.assertIn("collection_id", operation_columns)
        self.assertIn("status", operation_columns)
        self.assertIn("stage", operation_columns)
        self.assertIn("last_error_type", operation_columns)
        self.assertIn("next_retry_at", operation_columns)
        self.assertIn("operation_id", embedding_job_columns)
        self.assertIn("priority", embedding_job_columns)
        self.assertIn("last_error_type", embedding_job_columns)
        self.assertIn("next_retry_at", embedding_job_columns)
        self.assertIn("lease_expires_at", embedding_job_columns)

    def test_get_connection_initializes_schema_once_per_database_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch("app.core.storage.database.ensure_schema") as ensure_schema,
            ):
                first = database.get_connection()
                first.close()
                second = database.get_connection()
                second.close()

        self.assertEqual(ensure_schema.call_count, 1)

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
                with closing(sqlite3.connect(db_path)) as connection:
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
            with closing(sqlite3.connect(db_path)) as connection:
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
                with closing(sqlite3.connect(db_path)) as connection:
                    table_names = {
                        row[0]
                        for row in connection.execute(
                            "SELECT name FROM sqlite_master WHERE type = 'table'"
                        ).fetchall()
                    }

            self.assertNotIn("knowledge_bases", table_names)
            self.assertIn("memory_entries", table_names)
            self.assertIn("memory_revisions", table_names)
            self.assertIn("memory_events", table_names)
            self.assertNotIn("memories", table_names)
            self.assertNotIn("memories_fts", table_names)

    def test_buddy_message_fts_schema_is_seeded_once_and_keeps_triggers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()
                with closing(sqlite3.connect(db_path)) as connection:
                    marker = connection.execute(
                        "SELECT value_json FROM buddy_kv WHERE key = ?",
                        ("schema.buddy_messages_fts",),
                    ).fetchone()
                    connection.execute(
                        """
                        INSERT INTO buddy_messages (
                            message_id,
                            session_id,
                            role,
                            content,
                            include_in_context,
                            metadata_json,
                            created_at,
                            updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            "msg_1",
                            "session_1",
                            "user",
                            "hello",
                            1,
                            "{}",
                            "2026-05-26T00:00:00Z",
                            "2026-05-26T00:00:00Z",
                        ),
                    )
                    connection.execute(
                        "UPDATE buddy_messages SET content = ? WHERE message_id = ?",
                        ("hello updated", "msg_1"),
                    )
                    connection.commit()
                    fts_content = connection.execute(
                        "SELECT content FROM buddy_messages_fts WHERE message_id = ?",
                        ("msg_1",),
                    ).fetchone()[0]
                    trigram_count = connection.execute("SELECT COUNT(*) FROM buddy_messages_fts_trigram").fetchone()[0]

                database.initialize_storage()
                with closing(sqlite3.connect(db_path)) as connection:
                    marker_after_second_init = connection.execute(
                        "SELECT value_json FROM buddy_kv WHERE key = ?",
                        ("schema.buddy_messages_fts",),
                    ).fetchone()
                    fts_count_after_second_init = connection.execute(
                        "SELECT COUNT(*) FROM buddy_messages_fts"
                    ).fetchone()[0]

        self.assertIsNotNone(marker)
        self.assertEqual(marker[0], '{"version":2,"triggers":"dual_fts"}')
        self.assertEqual(fts_content, "hello updated")
        self.assertEqual(trigram_count, 1)
        self.assertEqual(marker_after_second_init[0], '{"version":2,"triggers":"dual_fts"}')
        self.assertEqual(fts_count_after_second_init, 1)

    def test_initialize_storage_creates_message_platform_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()
                with closing(sqlite3.connect(db_path)) as connection:
                    table_names = {
                        row[0]
                        for row in connection.execute(
                            "SELECT name FROM sqlite_master WHERE type = 'table'"
                        ).fetchall()
                    }

        self.assertTrue(
            {
                "message_platform_bindings",
                "message_platform_connection_status",
                "message_platform_secrets",
                "message_platform_sessions",
                "message_platform_audit_events",
                "message_platform_dedup",
            }.issubset(table_names)
        )


if __name__ == "__main__":
    unittest.main()

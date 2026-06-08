from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.scheduler import official_seed, store


class SchedulerOfficialSeedTests(unittest.TestCase):
    def test_seed_official_jobs_creates_enabled_graph_automation_jobs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                result = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T00:00:00Z")
                jobs = {job["job_id"]: job for job in store.list_scheduled_graph_jobs(include_disabled=True)}
                due = store.list_due_scheduled_graph_jobs(now="2026-05-27T00:00:00Z")
                event_jobs = store.list_event_scheduled_graph_jobs("buddy.message.created")
                knowledge_event_jobs = store.list_event_scheduled_graph_jobs("knowledge.ingestion.completed")

        self.assertEqual(result["created_count"], 4)
        self.assertEqual(result["existing_count"], 0)
        self.assertEqual(result["removed_count"], 0)
        self.assertEqual(
            set(jobs),
            {
                "official_buddy_message_retrieval_ingestion",
                "official_buddy_autonomous_review",
                "official_embedding_maintenance",
                "official_knowledge_embedding_drain",
            },
        )
        message_ingestion = jobs["official_buddy_message_retrieval_ingestion"]
        self.assertEqual(message_ingestion["template_id"], "buddy_message_retrieval_ingestion")
        self.assertEqual(message_ingestion["schedule_kind"], "event")
        self.assertEqual(message_ingestion["schedule_expr"], "buddy.message.created")
        self.assertEqual(message_ingestion["input_bindings"], {"session_id": "{{event.session_id}}"})
        self.assertTrue(message_ingestion["enabled"])

        memory_review = jobs["official_buddy_autonomous_review"]
        self.assertEqual(memory_review["template_id"], "buddy_autonomous_review")
        self.assertEqual(memory_review["schedule_kind"], "interval")
        self.assertEqual(memory_review["schedule_expr"], "PT20M")
        self.assertEqual(memory_review["input_bindings"], {})
        self.assertEqual(memory_review["metadata"]["source_selection"], "auto_unreviewed")
        self.assertTrue(memory_review["enabled"])
        self.assertEqual(memory_review["next_run_at"], "2026-05-27T00:20:00Z")

        embedding = jobs["official_embedding_maintenance"]
        self.assertEqual(embedding["template_id"], "embedding_maintenance")
        self.assertEqual(embedding["schedule_expr"], "PT20M")
        self.assertTrue(embedding["enabled"])
        self.assertEqual(embedding["next_run_at"], "2026-05-27T00:20:00Z")
        self.assertEqual(
            embedding["retry_policy"],
            {"max_attempts": 3, "delay_seconds": 300, "backoff_multiplier": 2.0},
        )
        self.assertEqual(embedding["input_bindings"], {"model_ref": "", "job_limit": 50})
        knowledge_embedding = jobs["official_knowledge_embedding_drain"]
        self.assertEqual(knowledge_embedding["template_id"], "knowledge_embedding_drain")
        self.assertEqual(knowledge_embedding["schedule_kind"], "event")
        self.assertEqual(knowledge_embedding["schedule_expr"], "knowledge.ingestion.completed")
        self.assertTrue(knowledge_embedding["enabled"])
        self.assertEqual(
            knowledge_embedding["input_bindings"],
            {
                "collection_id": "{{event.collection_id}}",
                "operation_id": "{{event.operation_id}}",
                "model_ref": "",
                "job_limit": 250,
                "time_budget_seconds": 300,
            },
        )
        self.assertEqual(
            knowledge_embedding["retry_policy"],
            {"max_attempts": 3, "delay_seconds": 300, "backoff_multiplier": 2.0},
        )
        self.assertEqual(knowledge_embedding["metadata"]["source"], "official_seed")
        self.assertEqual(knowledge_embedding["metadata"]["required_default"], True)
        self.assertEqual(knowledge_embedding["metadata"]["purpose"], "knowledge_embedding_drain")
        self.assertEqual(
            knowledge_embedding["metadata"]["recommended_trigger"],
            "knowledge.ingestion.completed",
        )
        self.assertEqual(due, [])
        self.assertEqual([job["job_id"] for job in event_jobs], ["official_buddy_message_retrieval_ingestion"])
        self.assertEqual([job["job_id"] for job in knowledge_event_jobs], ["official_knowledge_embedding_drain"])

    def test_seed_official_jobs_enables_existing_required_defaults_without_user_disable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                first = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T00:00:00Z")
                with database.get_connection() as connection:
                    connection.execute(
                        """
                        UPDATE scheduled_graph_jobs
                        SET enabled = 0,
                            next_run_at = ''
                        WHERE job_id = ?
                        """,
                        ("official_embedding_maintenance",),
                    )
                second = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T02:00:00Z")
                jobs = store.list_scheduled_graph_jobs(include_disabled=True)
                embedding = store.load_scheduled_graph_job("official_embedding_maintenance")

        self.assertEqual(first["created_count"], 4)
        self.assertEqual(second["created_count"], 0)
        self.assertEqual(second["existing_count"], 4)
        self.assertEqual(second["updated_count"], 1)
        self.assertEqual(second["removed_count"], 0)
        self.assertEqual(len(jobs), 4)
        self.assertTrue(embedding["enabled"])
        self.assertEqual(embedding["next_run_at"], "2026-05-27T02:20:00Z")
        self.assertEqual(embedding["metadata"]["required_default"], True)
        self.assertEqual(embedding["metadata"]["seed_auto_enabled"], True)

    def test_seed_official_jobs_migrates_old_hourly_defaults_to_twenty_minutes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                first = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T00:00:00Z")
                with database.get_connection() as connection:
                    connection.execute(
                        """
                        UPDATE scheduled_graph_jobs
                        SET schedule_expr = 'PT1H',
                            next_run_at = '2026-05-27T01:00:00Z',
                            metadata_json = json_set(metadata_json, '$.recommended_interval', 'hourly')
                        WHERE job_id IN (?, ?)
                        """,
                        ("official_buddy_autonomous_review", "official_embedding_maintenance"),
                    )
                second = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T02:00:00Z")
                review = store.load_scheduled_graph_job("official_buddy_autonomous_review")
                embedding = store.load_scheduled_graph_job("official_embedding_maintenance")

        self.assertEqual(first["created_count"], 4)
        self.assertEqual(second["created_count"], 0)
        self.assertEqual(second["existing_count"], 4)
        self.assertEqual(second["updated_count"], 2)
        self.assertEqual(review["schedule_expr"], "PT20M")
        self.assertEqual(review["next_run_at"], "2026-05-27T02:20:00Z")
        self.assertEqual(review["metadata"]["recommended_interval"], "every_20_minutes")
        self.assertEqual(embedding["schedule_expr"], "PT20M")
        self.assertEqual(embedding["next_run_at"], "2026-05-27T02:20:00Z")
        self.assertEqual(embedding["metadata"]["recommended_interval"], "every_20_minutes")

    def test_seed_official_jobs_preserves_user_modified_official_interval(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                first = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T00:00:00Z")
                customized = store.update_scheduled_graph_job(
                    "official_embedding_maintenance",
                    {"schedule_kind": "interval", "schedule_expr": "PT45M"},
                    now="2026-05-27T00:05:00Z",
                )
                second = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T02:00:00Z")
                embedding = store.load_scheduled_graph_job("official_embedding_maintenance")

        self.assertEqual(first["created_count"], 4)
        self.assertEqual(customized["schedule_expr"], "PT45M")
        self.assertEqual(customized["metadata"]["user_schedule_modified"], True)
        self.assertEqual(second["updated_count"], 0)
        self.assertEqual(embedding["schedule_expr"], "PT45M")
        self.assertEqual(embedding["metadata"]["user_schedule_modified"], True)

    def test_seed_official_jobs_respects_user_disabled_required_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                first = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T00:00:00Z")
                disabled = store.set_scheduled_graph_job_enabled(
                    "official_embedding_maintenance",
                    False,
                    now="2026-05-27T01:00:00Z",
                )
                second = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T02:00:00Z")
                jobs = store.list_scheduled_graph_jobs(include_disabled=True)
                embedding = store.load_scheduled_graph_job("official_embedding_maintenance")

        self.assertEqual(first["created_count"], 4)
        self.assertEqual(second["created_count"], 0)
        self.assertEqual(second["existing_count"], 4)
        self.assertEqual(second["updated_count"], 0)
        self.assertEqual(second["removed_count"], 0)
        self.assertEqual(len(jobs), 4)
        self.assertFalse(disabled["enabled"])
        self.assertEqual(disabled["metadata"]["user_disabled"], True)
        self.assertFalse(embedding["enabled"])
        self.assertEqual(embedding["next_run_at"], "")
        self.assertEqual(embedding["metadata"]["user_disabled"], True)

    def test_seed_official_jobs_removes_deprecated_curator_job(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()
                deprecated = store.create_scheduled_graph_job(
                    {
                        "job_id": "official_buddy_capability_curator",
                        "name": "Deprecated curator",
                        "template_id": "embedding_maintenance",
                        "schedule_kind": "manual",
                        "metadata": {"source": "official_seed"},
                    },
                    now="2026-05-27T00:00:00Z",
                )
                store.record_scheduled_graph_job_run(
                    deprecated["job_id"],
                    run_id="run_deprecated_curator",
                    trigger_reason="manual",
                    status="completed",
                    started_at="2026-05-27T01:00:00Z",
                    completed_at="2026-05-27T01:01:00Z",
                )

                result = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T02:00:00Z")
                jobs = {job["job_id"]: job for job in store.list_scheduled_graph_jobs(include_disabled=True)}
                deprecated_runs = store.list_scheduled_graph_job_runs(job_id="official_buddy_capability_curator")

        self.assertEqual(result["removed_count"], 1)
        self.assertEqual(result["removed"], [{"job_id": "official_buddy_capability_curator"}])
        self.assertNotIn("official_buddy_capability_curator", jobs)
        self.assertIn("official_embedding_maintenance", jobs)
        self.assertIn("official_knowledge_embedding_drain", jobs)
        self.assertEqual(deprecated_runs, [])


if __name__ == "__main__":
    unittest.main()

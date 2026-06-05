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
    def test_seed_official_jobs_creates_disabled_graph_automation_jobs(self) -> None:
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

        self.assertEqual(result["created_count"], 3)
        self.assertEqual(result["existing_count"], 0)
        self.assertEqual(result["removed_count"], 0)
        self.assertEqual(
            set(jobs),
            {
                "official_buddy_message_retrieval_ingestion",
                "official_buddy_autonomous_review",
                "official_embedding_maintenance",
            },
        )
        message_ingestion = jobs["official_buddy_message_retrieval_ingestion"]
        self.assertEqual(message_ingestion["template_id"], "buddy_message_retrieval_ingestion")
        self.assertEqual(message_ingestion["schedule_kind"], "event")
        self.assertEqual(message_ingestion["schedule_expr"], "buddy.message.created")
        self.assertEqual(message_ingestion["input_bindings"], {"session_id": "{{event.session_id}}"})
        self.assertFalse(message_ingestion["enabled"])

        memory_review = jobs["official_buddy_autonomous_review"]
        self.assertEqual(memory_review["template_id"], "buddy_autonomous_review")
        self.assertEqual(memory_review["schedule_kind"], "interval")
        self.assertEqual(memory_review["schedule_expr"], "PT1H")
        self.assertEqual(memory_review["input_bindings"], {})
        self.assertEqual(memory_review["metadata"]["source_selection"], "auto_unreviewed")
        self.assertFalse(memory_review["enabled"])

        embedding = jobs["official_embedding_maintenance"]
        self.assertEqual(embedding["template_id"], "embedding_maintenance")
        self.assertEqual(embedding["schedule_expr"], "PT1H")
        self.assertFalse(embedding["enabled"])
        self.assertEqual(
            embedding["retry_policy"],
            {"max_attempts": 3, "delay_seconds": 300, "backoff_multiplier": 2.0},
        )
        self.assertEqual(embedding["input_bindings"], {"model_ref": "", "job_limit": 50})
        self.assertEqual(due, [])
        self.assertEqual(event_jobs, [])

    def test_seed_official_jobs_is_idempotent_and_preserves_enabled_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                first = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T00:00:00Z")
                store.set_scheduled_graph_job_enabled(
                    "official_embedding_maintenance",
                    True,
                    now="2026-05-27T01:00:00Z",
                )
                second = official_seed.seed_official_scheduled_graph_jobs(now="2026-05-27T02:00:00Z")
                jobs = store.list_scheduled_graph_jobs(include_disabled=True)
                embedding = store.load_scheduled_graph_job("official_embedding_maintenance")

        self.assertEqual(first["created_count"], 3)
        self.assertEqual(second["created_count"], 0)
        self.assertEqual(second["existing_count"], 3)
        self.assertEqual(second["removed_count"], 0)
        self.assertEqual(len(jobs), 3)
        self.assertTrue(embedding["enabled"])
        self.assertEqual(embedding["next_run_at"], "2026-05-27T02:00:00Z")

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
        self.assertEqual(deprecated_runs, [])


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.scheduler import store


class SchedulerStoreTests(unittest.TestCase):
    def test_interval_job_computes_next_run_and_due_jobs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "能力库整理",
                        "template_id": "buddy_capability_curator",
                        "input_bindings": {"curator_scope": "整理官方能力库"},
                        "schedule_kind": "interval",
                        "schedule_expr": "PT6H",
                    },
                    now="2026-05-27T00:00:00Z",
                )
                not_due = store.list_due_scheduled_graph_jobs(now="2026-05-27T05:59:59Z")
                due = store.list_due_scheduled_graph_jobs(now="2026-05-27T06:00:00Z")

        self.assertEqual(job["schedule_kind"], "interval")
        self.assertEqual(job["schedule_expr"], "PT6H")
        self.assertEqual(job["next_run_at"], "2026-05-27T06:00:00Z")
        self.assertEqual(job["input_bindings"], {"curator_scope": "整理官方能力库"})
        self.assertEqual(not_due, [])
        self.assertEqual([item["job_id"] for item in due], [job["job_id"]])

    def test_manual_job_has_no_due_time_and_can_be_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "手动 Embedding 维护",
                        "template_id": "embedding_maintenance",
                        "schedule_kind": "manual",
                    },
                    now="2026-05-27T00:00:00Z",
                )
                disabled = store.set_scheduled_graph_job_enabled(job["job_id"], False)
                enabled = store.set_scheduled_graph_job_enabled(job["job_id"], True, now="2026-05-27T01:00:00Z")
                due = store.list_due_scheduled_graph_jobs(now="2026-05-27T01:00:00Z")

        self.assertEqual(job["next_run_at"], "")
        self.assertFalse(disabled["enabled"])
        self.assertTrue(enabled["enabled"])
        self.assertEqual(due, [])

    def test_update_job_edits_schedule_template_bindings_and_delivery_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "能力库整理",
                        "template_id": "buddy_capability_curator",
                        "input_bindings": {"curator_scope": "整理官方能力库"},
                        "schedule_kind": "interval",
                        "schedule_expr": "PT6H",
                        "enabled": True,
                        "delivery_target": {"kind": "local_audit"},
                    },
                    now="2026-05-27T00:00:00Z",
                )
                store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_curator_1",
                    trigger_reason="manual",
                    status="completed",
                    started_at="2026-05-27T01:00:00Z",
                    now="2026-05-27T01:00:00Z",
                )

                updated = store.update_scheduled_graph_job(
                    job["job_id"],
                    {
                        "name": "每小时 Embedding",
                        "template_id": "embedding_maintenance",
                        "input_bindings": {"job_limit": 20},
                        "schedule_kind": "interval",
                        "schedule_expr": "PT1H",
                        "enabled": False,
                        "delivery_target": {
                            "kind": "message_outlet",
                            "outlet": "buddy",
                            "session_mode": "existing_session",
                            "buddy_session_id": "session_existing",
                        },
                    },
                    now="2026-05-27T02:00:00Z",
                )

        self.assertEqual(updated["job_id"], job["job_id"])
        self.assertEqual(updated["name"], "每小时 Embedding")
        self.assertEqual(updated["template_id"], "embedding_maintenance")
        self.assertEqual(updated["input_bindings"], {"job_limit": 20})
        self.assertEqual(updated["schedule_expr"], "PT1H")
        self.assertFalse(updated["enabled"])
        self.assertEqual(updated["next_run_at"], "")
        self.assertEqual(updated["last_run_id"], "run_curator_1")
        self.assertEqual(updated["created_at"], job["created_at"])
        self.assertEqual(updated["updated_at"], "2026-05-27T02:00:00Z")
        self.assertEqual(updated["delivery_target"]["kind"], "message_outlet")
        self.assertEqual(updated["delivery_target"]["outlet"], "buddy")

    def test_message_outlet_delivery_target_is_supported_delivery_result(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "定时摘要",
                        "template_id": "buddy_capability_curator",
                        "schedule_kind": "manual",
                        "delivery_target": {
                            "kind": "message_outlet",
                            "outlet": "buddy",
                            "session_mode": "existing_session",
                            "buddy_session_id": "session_existing",
                        },
                    },
                    now="2026-05-27T00:00:00Z",
                )
                job_run = store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_summary_1",
                    trigger_reason="manual",
                    status="completed",
                    started_at="2026-05-27T01:00:00Z",
                    now="2026-05-27T01:00:00Z",
                )

        self.assertEqual(job_run["metadata"]["delivery_result"]["kind"], "message_outlet")
        self.assertEqual(job_run["metadata"]["delivery_result"]["status"], "delivered")
        self.assertNotIn("reason", job_run["metadata"]["delivery_result"])

    def test_record_job_run_updates_history_and_next_interval(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "能力库整理",
                        "template_id": "buddy_capability_curator",
                        "schedule_kind": "interval",
                        "schedule_expr": "PT6H",
                    },
                    now="2026-05-27T00:00:00Z",
                )
                job_run = store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_curator_1",
                    trigger_reason="schedule",
                    status="running",
                    started_at="2026-05-27T06:00:00Z",
                    now="2026-05-27T06:00:00Z",
                )
                reloaded = store.load_scheduled_graph_job(job["job_id"])
                runs = store.list_scheduled_graph_job_runs(job_id=job["job_id"])

        self.assertEqual(job_run["run_id"], "run_curator_1")
        self.assertEqual(job_run["status"], "running")
        self.assertEqual(reloaded["last_run_id"], "run_curator_1")
        self.assertEqual(reloaded["next_run_at"], "2026-05-27T12:00:00Z")
        self.assertEqual([item["job_run_id"] for item in runs], [job_run["job_run_id"]])

    def test_failed_scheduled_run_schedules_auditable_retry(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "能力库整理",
                        "template_id": "buddy_capability_curator",
                        "schedule_kind": "interval",
                        "schedule_expr": "PT6H",
                        "retry_policy": {
                            "max_attempts": 3,
                            "delay_seconds": 600,
                            "backoff_multiplier": 2,
                        },
                    },
                    now="2026-05-27T00:00:00Z",
                )
                first_run = store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_curator_1",
                    trigger_reason="schedule",
                    status="running",
                    started_at="2026-05-27T06:00:00Z",
                    now="2026-05-27T06:00:00Z",
                )
                failed_run = store.update_scheduled_graph_job_run(
                    first_run["job_run_id"],
                    status="failed",
                    error="provider timeout",
                    completed_at="2026-05-27T06:05:00Z",
                )
                reloaded = store.load_scheduled_graph_job(job["job_id"])
                not_due = store.list_due_scheduled_graph_jobs(now="2026-05-27T06:14:59Z")
                due = store.list_due_scheduled_graph_jobs(now="2026-05-27T06:15:00Z")

        self.assertEqual(job["retry_policy"]["max_attempts"], 3)
        self.assertEqual(first_run["metadata"]["attempt_number"], 1)
        self.assertEqual(failed_run["metadata"]["retry_decision"]["action"], "scheduled")
        self.assertEqual(reloaded["next_run_at"], "2026-05-27T06:15:00Z")
        self.assertEqual(reloaded["metadata"]["scheduler_retry_pending"]["next_attempt_number"], 2)
        self.assertEqual(reloaded["metadata"]["scheduler_retry_pending"]["parent_job_run_id"], first_run["job_run_id"])
        self.assertEqual(reloaded["metadata"]["scheduler_retry_pending"]["resume_next_run_at"], "2026-05-27T12:00:00Z")
        self.assertEqual(not_due, [])
        self.assertEqual([item["job_id"] for item in due], [job["job_id"]])
        self.assertEqual(store.resolve_due_trigger_reason(due[0]), "retry")

    def test_retry_run_clears_pending_retry_and_exhausts_attempts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "能力库整理",
                        "template_id": "buddy_capability_curator",
                        "schedule_kind": "interval",
                        "schedule_expr": "PT6H",
                        "retry_policy": {"max_attempts": 2, "delay_seconds": 600},
                    },
                    now="2026-05-27T00:00:00Z",
                )
                first_run = store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_curator_1",
                    trigger_reason="schedule",
                    status="running",
                    started_at="2026-05-27T06:00:00Z",
                    now="2026-05-27T06:00:00Z",
                )
                store.update_scheduled_graph_job_run(
                    first_run["job_run_id"],
                    status="failed",
                    completed_at="2026-05-27T06:05:00Z",
                )
                retry_run = store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_curator_retry",
                    trigger_reason="retry",
                    status="running",
                    started_at="2026-05-27T06:15:00Z",
                    now="2026-05-27T06:15:00Z",
                )
                after_retry_start = store.load_scheduled_graph_job(job["job_id"])
                exhausted_run = store.update_scheduled_graph_job_run(
                    retry_run["job_run_id"],
                    status="failed",
                    completed_at="2026-05-27T06:16:00Z",
                )
                after_retry_failure = store.load_scheduled_graph_job(job["job_id"])

        self.assertEqual(retry_run["metadata"]["attempt_number"], 2)
        self.assertEqual(retry_run["metadata"]["retry_parent_job_run_id"], first_run["job_run_id"])
        self.assertNotIn("scheduler_retry_pending", after_retry_start["metadata"])
        self.assertEqual(after_retry_start["next_run_at"], "2026-05-27T12:00:00Z")
        self.assertEqual(exhausted_run["metadata"]["retry_decision"]["action"], "exhausted")
        self.assertNotIn("scheduler_retry_pending", after_retry_failure["metadata"])
        self.assertEqual(after_retry_failure["next_run_at"], "2026-05-27T12:00:00Z")

    def test_manual_run_failure_does_not_schedule_retry(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "能力库整理",
                        "template_id": "buddy_capability_curator",
                        "schedule_kind": "interval",
                        "schedule_expr": "PT6H",
                        "retry_policy": {"max_attempts": 3, "delay_seconds": 600},
                    },
                    now="2026-05-27T00:00:00Z",
                )
                manual_run = store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_manual_1",
                    trigger_reason="manual",
                    status="running",
                    started_at="2026-05-27T01:00:00Z",
                    now="2026-05-27T01:00:00Z",
                )
                failed_run = store.update_scheduled_graph_job_run(
                    manual_run["job_run_id"],
                    status="failed",
                    completed_at="2026-05-27T01:05:00Z",
                )
                reloaded = store.load_scheduled_graph_job(job["job_id"])

        self.assertEqual(failed_run["metadata"]["retry_decision"]["action"], "not_retryable_trigger")
        self.assertNotIn("scheduler_retry_pending", reloaded["metadata"])
        self.assertEqual(reloaded["next_run_at"], "2026-05-27T06:00:00Z")

    def test_manual_run_of_interval_job_preserves_next_scheduled_time(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "能力库整理",
                        "template_id": "buddy_capability_curator",
                        "schedule_kind": "interval",
                        "schedule_expr": "PT6H",
                    },
                    now="2026-05-27T00:00:00Z",
                )
                store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_manual_1",
                    trigger_reason="manual",
                    status="running",
                    started_at="2026-05-27T01:00:00Z",
                    now="2026-05-27T01:00:00Z",
                )
                reloaded = store.load_scheduled_graph_job(job["job_id"])

        self.assertEqual(reloaded["next_run_at"], "2026-05-27T06:00:00Z")

    def test_terminal_job_run_records_local_audit_delivery_result(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "能力库整理",
                        "template_id": "buddy_capability_curator",
                        "schedule_kind": "interval",
                        "schedule_expr": "PT6H",
                        "delivery_target": {
                            "kind": "local_audit",
                            "label": "Curator report",
                            "token": "secret-token",
                        },
                    },
                    now="2026-05-27T00:00:00Z",
                )
                running = store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_curator_1",
                    trigger_reason="schedule",
                    status="running",
                    started_at="2026-05-27T06:00:00Z",
                    now="2026-05-27T06:00:00Z",
                )
                completed = store.update_scheduled_graph_job_run(
                    running["job_run_id"],
                    status="completed",
                    completed_at="2026-05-27T06:04:00Z",
                )

        delivery = completed["metadata"]["delivery_result"]
        self.assertEqual(delivery["kind"], "local_audit")
        self.assertEqual(delivery["status"], "delivered")
        self.assertEqual(delivery["delivered_at"], "2026-05-27T06:04:00Z")
        self.assertEqual(delivery["job_id"], job["job_id"])
        self.assertEqual(delivery["job_run_id"], running["job_run_id"])
        self.assertEqual(delivery["run_ref"], {"kind": "graph_run", "run_id": "run_curator_1"})
        self.assertEqual(delivery["target"], {"kind": "local_audit", "label": "Curator report", "token": "[redacted]"})

    def test_unsupported_delivery_target_is_skipped_in_audit_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "能力库整理",
                        "template_id": "buddy_capability_curator",
                        "schedule_kind": "manual",
                        "delivery_target": {"kind": "slack", "channel": "ops"},
                    },
                    now="2026-05-27T00:00:00Z",
                )
                completed = store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_curator_1",
                    trigger_reason="manual",
                    status="completed",
                    started_at="2026-05-27T06:00:00Z",
                    now="2026-05-27T06:04:00Z",
                )

        delivery = completed["metadata"]["delivery_result"]
        self.assertEqual(delivery["kind"], "slack")
        self.assertEqual(delivery["status"], "skipped")
        self.assertEqual(delivery["reason"], "unsupported_delivery_target")

    def test_external_delivery_target_records_permission_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                job = store.create_scheduled_graph_job(
                    {
                        "name": "能力库整理",
                        "template_id": "buddy_capability_curator",
                        "schedule_kind": "manual",
                        "delivery_target": {
                            "kind": "webhook",
                            "url": "https://example.invalid/scheduler-hook",
                            "authorization": "Bearer secret-token",
                        },
                    },
                    now="2026-05-27T00:00:00Z",
                )
                completed = store.record_scheduled_graph_job_run(
                    job["job_id"],
                    run_id="run_curator_1",
                    trigger_reason="manual",
                    status="completed",
                    started_at="2026-05-27T06:00:00Z",
                    now="2026-05-27T06:04:00Z",
                )

        delivery = completed["metadata"]["delivery_result"]
        self.assertEqual(delivery["kind"], "webhook")
        self.assertEqual(delivery["status"], "skipped")
        self.assertEqual(delivery["reason"], "external_delivery_requires_approval")
        self.assertTrue(delivery["approval_required"])
        self.assertEqual(delivery["required_permissions"], ["external_delivery"])
        self.assertEqual(delivery["permission_profile"]["permission_tier"], "risky")
        self.assertEqual(delivery["permission_profile"]["risky_permissions"], ["external_delivery"])
        self.assertEqual(delivery["target"]["url"], "https://example.invalid/scheduler-hook")
        self.assertEqual(delivery["target"]["authorization"], "[redacted]")
        self.assertNotIn("secret-token", str(delivery))

    def test_create_job_rejects_unknown_template(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            db_path = data_dir / "toograph.db"
            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
            ):
                database.initialize_storage()

                with self.assertRaisesRegex(ValueError, "template_id"):
                    store.create_scheduled_graph_job(
                        {
                            "name": "不存在",
                            "template_id": "missing_template",
                            "schedule_kind": "manual",
                        }
                    )


if __name__ == "__main__":
    unittest.main()

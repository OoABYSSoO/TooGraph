from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app, startup
from app.core.runtime.run_recovery import mark_interrupted_active_runs


class RunStartupRecoveryTests(unittest.TestCase):
    def test_app_uses_lifespan_instead_of_deprecated_startup_event_handler(self) -> None:
        self.assertEqual(app.router.on_startup, [])

    def test_startup_marks_interrupted_active_runs_after_storage_initialization(self) -> None:
        calls: list[str] = []

        with (
            patch("app.main.initialize_storage", lambda: calls.append("initialize_storage")),
            patch("app.main.initialize_buddy_home", lambda: calls.append("initialize_buddy_home")),
            patch("app.main.mark_interrupted_active_runs", lambda: calls.append("mark_interrupted_active_runs")),
        ):
            startup()

        self.assertEqual(calls, ["initialize_storage", "initialize_buddy_home", "mark_interrupted_active_runs"])

    def test_mark_interrupted_active_runs_fails_active_runs_and_current_node(self) -> None:
        active_run = {
            "run_id": "run_active",
            "status": "running",
            "current_node_id": "agent_a",
            "graph_snapshot": {
                "nodes": {
                    "agent_a": {"kind": "agent"},
                },
            },
            "node_status_map": {
                "agent_a": "running",
                "agent_b": "idle",
            },
            "node_executions": [],
            "errors": [],
            "warnings": [],
            "completed_at": None,
            "lifecycle": {"updated_at": "old"},
        }
        paused_run = {
            "run_id": "run_paused",
            "status": "paused",
            "current_node_id": "human_review",
            "node_status_map": {"human_review": "paused"},
            "errors": [],
            "warnings": [],
        }
        completed_run = {
            "run_id": "run_completed",
            "status": "completed",
            "current_node_id": None,
            "node_status_map": {},
            "errors": [],
            "warnings": [],
        }
        saved_runs: list[dict] = []

        interrupted_count = mark_interrupted_active_runs(
            list_runs_func=lambda: [active_run, paused_run, completed_run],
            save_run_func=saved_runs.append,
            now_func=lambda: "2026-05-04T11:30:00+00:00",
        )

        self.assertEqual(interrupted_count, 1)
        self.assertEqual(saved_runs, [active_run])
        self.assertEqual(active_run["status"], "failed")
        self.assertEqual(active_run["completed_at"], "2026-05-04T11:30:00+00:00")
        self.assertEqual(active_run["lifecycle"]["updated_at"], "2026-05-04T11:30:00+00:00")
        self.assertEqual(active_run["node_status_map"]["agent_a"], "failed")
        self.assertEqual(active_run["node_status_map"]["agent_b"], "idle")
        self.assertIn("backend service restarted", active_run["errors"][0])
        self.assertEqual(active_run["warnings"], ["Run was interrupted because the backend service restarted before it completed."])
        self.assertEqual(
            active_run["node_executions"],
            [
                {
                    "node_id": "agent_a",
                    "node_type": "agent",
                    "status": "failed",
                    "started_at": None,
                    "finished_at": "2026-05-04T11:30:00+00:00",
                    "duration_ms": 0,
                    "input_summary": "",
                    "output_summary": "",
                    "artifacts": {},
                    "warnings": [],
                    "errors": ["Run was interrupted because the backend service restarted before it completed."],
                }
            ],
        )
        self.assertEqual(paused_run["status"], "paused")
        self.assertEqual(completed_run["status"], "completed")

    def test_mark_interrupted_active_runs_handles_queued_runs_without_current_node(self) -> None:
        queued_run = {
            "run_id": "run_queued",
            "status": "queued",
            "current_node_id": None,
            "node_status_map": {"agent": "idle"},
            "node_executions": [],
            "errors": [],
            "warnings": [],
            "completed_at": None,
            "lifecycle": {"updated_at": "old"},
        }
        saved_runs: list[dict] = []

        interrupted_count = mark_interrupted_active_runs(
            list_runs_func=lambda: [queued_run],
            save_run_func=saved_runs.append,
            now_func=lambda: "2026-05-04T11:30:00+00:00",
        )

        self.assertEqual(interrupted_count, 1)
        self.assertEqual(saved_runs, [queued_run])
        self.assertEqual(queued_run["status"], "failed")
        self.assertEqual(queued_run["node_status_map"], {"agent": "idle"})
        self.assertEqual(queued_run["node_executions"], [])


if __name__ == "__main__":
    unittest.main()

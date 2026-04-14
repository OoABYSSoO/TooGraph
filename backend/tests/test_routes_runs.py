from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


def _run_summary(run_id: str, *, internal: bool = False) -> dict:
    return {
        "run_id": run_id,
        "graph_id": None,
        "graph_name": "伙伴后台复盘" if internal else "伙伴自主循环",
        "status": "completed",
        "started_at": "2026-05-11T07:28:47Z",
        "completed_at": "2026-05-11T07:29:05Z",
        "duration_ms": 18445,
        "runtime_backend": "langgraph",
        "metadata": {"internal": True, "role": "buddy_background_review"} if internal else {"origin": "buddy"},
        "lifecycle": {},
        "checkpoint_metadata": {},
        "graph_snapshot": {},
    }


def _paused_run(run_id: str = "run_paused", status: str = "awaiting_human") -> dict:
    return {
        "run_id": run_id,
        "graph_id": "graph_1",
        "graph_name": "伙伴自主循环",
        "status": status,
        "started_at": "2026-05-11T07:28:47Z",
        "completed_at": None,
        "duration_ms": None,
        "runtime_backend": "langgraph",
        "current_node_id": "human_review",
        "metadata": {
            "origin": "buddy",
            "pending_permission_approval": {"skill_key": "write_file"},
            "pending_permission_approval_resume_payload": {"answer": "ok"},
            "pending_subgraph_breakpoint": {"node_id": "inner_review"},
            "pending_subgraph_resume_payload": {"draft": "hello"},
        },
        "lifecycle": {
            "updated_at": "2026-05-11T07:28:47Z",
            "paused_at": "2026-05-11T07:28:50Z",
            "pause_reason": "permission_approval",
            "resume_count": 0,
        },
        "checkpoint_metadata": {"available": True, "thread_id": run_id, "checkpoint_id": "checkpoint_1"},
        "node_status_map": {"human_review": "paused"},
        "graph_snapshot": {},
        "errors": [],
        "warnings": [],
    }


class RunRouteTests(unittest.TestCase):
    def test_run_list_hides_internal_runs_by_default(self) -> None:
        with patch("app.api.routes_runs.list_runs", return_value=[_run_summary("run_internal", internal=True), _run_summary("run_visible")]):
            with TestClient(app) as client:
                response = client.get("/api/runs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([run["run_id"] for run in response.json()], ["run_visible"])

    def test_run_list_can_include_internal_runs_explicitly(self) -> None:
        with patch("app.api.routes_runs.list_runs", return_value=[_run_summary("run_internal", internal=True), _run_summary("run_visible")]):
            with TestClient(app) as client:
                response = client.get("/api/runs", params={"include_internal": "true"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([run["run_id"] for run in response.json()], ["run_internal", "run_visible"])

    def test_cancel_run_marks_paused_run_cancelled_and_clears_pending_resume_metadata(self) -> None:
        run = _paused_run()
        with (
            patch("app.api.routes_runs.load_run", return_value=run),
            patch("app.api.routes_runs.save_run") as save_run,
            patch("app.api.routes_runs.publish_run_event") as publish_run_event,
        ):
            with TestClient(app) as client:
                response = client.post("/api/runs/run_paused/cancel", json={"reason": "用户取消"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"run_id": "run_paused", "status": "cancelled"})
        saved_run = save_run.call_args.args[0]
        self.assertEqual(saved_run["status"], "cancelled")
        self.assertIsNotNone(saved_run["completed_at"])
        self.assertTrue(saved_run["metadata"]["cancelled"])
        self.assertEqual(saved_run["metadata"]["cancellation_reason"], "用户取消")
        self.assertNotIn("pending_permission_approval", saved_run["metadata"])
        self.assertNotIn("pending_permission_approval_resume_payload", saved_run["metadata"])
        self.assertNotIn("pending_subgraph_breakpoint", saved_run["metadata"])
        self.assertNotIn("pending_subgraph_resume_payload", saved_run["metadata"])
        publish_run_event.assert_called_once_with("run_paused", "run.cancelled", {"status": "cancelled", "reason": "用户取消"})

    def test_cancel_run_rejects_terminal_runs(self) -> None:
        with (
            patch("app.api.routes_runs.load_run", return_value=_paused_run(status="completed")),
            patch("app.api.routes_runs.save_run") as save_run,
        ):
            with TestClient(app) as client:
                response = client.post("/api/runs/run_paused/cancel", json={"reason": "用户取消"})

        self.assertEqual(response.status_code, 409)
        save_run.assert_not_called()


if __name__ == "__main__":
    unittest.main()

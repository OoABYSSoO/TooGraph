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


if __name__ == "__main__":
    unittest.main()

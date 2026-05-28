from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.main import app


def _template_payload(template_id: str) -> dict[str, object]:
    return {
        "template_id": template_id,
        "label": "Scheduler Test",
        "description": "Scheduler route test template.",
        "default_graph_name": "Scheduler Test Graph",
        "state_schema": {
            "request": {
                "name": "Request",
                "description": "",
                "type": "text",
                "value": "",
                "color": "#2563eb",
            }
        },
        "nodes": {
            "request_input": {
                "kind": "input",
                "name": "Request",
                "description": "",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [],
                "writes": [{"state": "request", "mode": "replace"}],
                "config": {},
            }
        },
        "edges": [],
        "conditional_edges": [],
        "metadata": {},
    }


class SchedulerRouteTests(unittest.TestCase):
    def test_create_list_and_run_job_through_api(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            data_dir = root / "data"
            db_path = data_dir / "toograph.db"
            official_dir = root / "official"
            user_dir = root / "user"
            template_dir = official_dir / "scheduler_test_template"
            template_dir.mkdir(parents=True)
            user_dir.mkdir()
            (template_dir / "template.json").write_text(
                json.dumps(_template_payload("scheduler_test_template")),
                encoding="utf-8",
            )
            completed_runs: list[str] = []

            def complete_immediately(_graph: object, run_state: dict) -> None:
                run_state["status"] = "completed"
                completed_runs.append(str(run_state.get("run_id") or ""))

            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
                patch("app.templates.loader.TEMPLATE_SETTINGS_PATH", root / "settings.json", create=True),
                patch("app.scheduler.runner._run_scheduled_graph_worker", complete_immediately),
                TestClient(app) as client,
            ):
                database.initialize_storage()
                create_response = client.post(
                    "/api/scheduler/jobs",
                    json={
                        "name": "测试调度",
                        "template_id": "scheduler_test_template",
                        "input_bindings": {"request": "整理能力库"},
                        "schedule_kind": "manual",
                        "retry_policy": {"max_attempts": 2, "delay_seconds": 120},
                    },
                )
                list_response = client.get("/api/scheduler/jobs")
                run_response = client.post(f"/api/scheduler/jobs/{create_response.json()['job_id']}/run")
                runs_response = client.get(f"/api/scheduler/jobs/{create_response.json()['job_id']}/runs")
                run_detail_response = client.get(f"/api/runs/{run_response.json()['run_id']}")

        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(run_response.status_code, 200)
        self.assertEqual(runs_response.status_code, 200)
        self.assertEqual(run_detail_response.status_code, 200)
        self.assertEqual([item["job_id"] for item in list_response.json()], [create_response.json()["job_id"]])
        self.assertEqual(create_response.json()["retry_policy"], {"max_attempts": 2, "delay_seconds": 120, "backoff_multiplier": 1.0})
        self.assertEqual(run_response.json()["job_run"]["trigger_reason"], "manual")
        self.assertEqual(run_response.json()["job_run"]["run_id"], run_response.json()["run_id"])
        self.assertEqual(runs_response.json()[0]["run_id"], run_response.json()["run_id"])
        self.assertEqual(completed_runs, [run_response.json()["run_id"]])
        run_detail = run_detail_response.json()
        self.assertEqual(run_detail["template_id"], "scheduler_test_template")
        self.assertEqual(run_detail["metadata"]["scheduled_graph_job"]["job_id"], create_response.json()["job_id"])
        self.assertEqual(run_detail["graph_snapshot"]["state_schema"]["request"]["value"], "整理能力库")

    def test_approve_delivery_route_executes_scheduler_delivery(self) -> None:
        with (
            patch(
                "app.api.routes_scheduler.store.load_scheduled_graph_job_run",
                return_value={"job_id": "sched_webhook", "job_run_id": "schedrun_webhook"},
            ),
            patch(
                "app.api.routes_scheduler.delivery.execute_approved_scheduled_delivery",
                return_value={"kind": "webhook", "status": "delivered"},
            ) as execute_delivery,
            TestClient(app) as client,
        ):
            response = client.post(
                "/api/scheduler/jobs/sched_webhook/runs/schedrun_webhook/delivery/approve",
                json={"approved_by": "scheduler-test", "reason": "人工批准"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"kind": "webhook", "status": "delivered"})
        execute_delivery.assert_called_once_with(
            "schedrun_webhook",
            approval={"decision": "approved", "approved_by": "scheduler-test", "reason": "人工批准"},
        )


if __name__ == "__main__":
    unittest.main()

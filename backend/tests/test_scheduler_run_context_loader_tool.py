from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
TOOL_DIR = REPO_ROOT / "tool" / "official" / "scheduler_run_context_loader"

sys.path.insert(0, str(BACKEND_ROOT))

from app.core.storage import database
from app.core.storage.run_store import save_run
from app.scheduler import store


def _template_record() -> dict[str, object]:
    return {
        "template_id": "scheduler_eval_template",
        "label": "Scheduler Eval Template",
        "status": "active",
    }


def _load_tool_module():
    script_path = TOOL_DIR / "run.py"
    spec = importlib.util.spec_from_file_location("scheduler_run_context_loader_tool", script_path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load scheduler_run_context_loader tool module.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SchedulerRunContextLoaderToolTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self._data_dir = Path(self._temp_dir.name) / "data"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", self._data_dir),
            patch("app.core.storage.database.DB_PATH", self._data_dir / "toograph.db"),
            patch("app.scheduler.store.load_template_record", return_value=_template_record()),
            patch.dict("os.environ", {"TOOGRAPH_REPO_ROOT": str(REPO_ROOT)}),
        ]
        for patcher in self._patchers:
            patcher.start()
        database.initialize_storage()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._temp_dir.cleanup()

    def test_catalog_exposes_scheduler_run_context_loader_tool(self) -> None:
        from app.graph_tools.definitions import list_tool_catalog
        from app.graph_tools.registry import get_tool_registry

        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog.get("scheduler_run_context_loader")

        self.assertIsNotNone(definition)
        self.assertEqual(definition.name, "Scheduler Run Context Loader")
        self.assertIn("scheduled graph job", definition.description)
        self.assertIn("scheduler_run_context_loader", get_tool_registry(include_disabled=True).keys())

    def test_loader_outputs_retry_delivery_report_with_redacted_target(self) -> None:
        module = _load_tool_module()
        job = store.create_scheduled_graph_job(
            {
                "job_id": "sched_eval_retry_delivery",
                "name": "Scheduler retry delivery",
                "template_id": "scheduler_eval_template",
                "schedule_kind": "interval",
                "schedule_expr": "PT6H",
                "retry_policy": {"max_attempts": 3, "delay_seconds": 300},
                "delivery_target": {
                    "kind": "local_audit",
                    "label": "Scheduler eval",
                    "token": "secret-token",
                },
            },
            now="2026-05-27T00:00:00Z",
        )
        job_run = store.record_scheduled_graph_job_run(
            job["job_id"],
            job_run_id="schedrun_eval_retry_delivery_1",
            run_id="run_eval_scheduler_failed_1",
            trigger_reason="schedule",
            status="failed",
            error="provider timeout",
            started_at="2026-05-27T06:00:00Z",
            completed_at="2026-05-27T06:05:00Z",
            now="2026-05-27T06:05:00Z",
        )

        result = module.scheduler_run_context_loader(
            {
                "job_id": job["job_id"],
                "job_run_id": job_run["job_run_id"],
            }
        )
        report = result["scheduler_run_report"]

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(report["job_id"], "sched_eval_retry_delivery")
        self.assertEqual(report["job_run_id"], "schedrun_eval_retry_delivery_1")
        self.assertEqual(report["run_id"], "run_eval_scheduler_failed_1")
        self.assertEqual(report["retry_decision"]["action"], "scheduled")
        self.assertEqual(report["scheduler_retry_pending"]["next_attempt_number"], 2)
        self.assertEqual(report["delivery_result"]["status"], "delivered")
        self.assertEqual(report["delivery_result"]["target"]["token"], "[redacted]")
        self.assertNotIn("secret-token", str(report))

    def test_loader_outputs_external_delivery_permission_boundary(self) -> None:
        module = _load_tool_module()
        job = store.create_scheduled_graph_job(
            {
                "job_id": "sched_eval_webhook_delivery",
                "name": "Scheduler webhook delivery",
                "template_id": "scheduler_eval_template",
                "schedule_kind": "manual",
                "delivery_target": {
                    "kind": "webhook",
                    "url": "https://example.invalid/scheduler-hook",
                    "authorization": "Bearer secret-token",
                },
            },
            now="2026-05-27T00:00:00Z",
        )
        job_run = store.record_scheduled_graph_job_run(
            job["job_id"],
            job_run_id="schedrun_eval_webhook_delivery_1",
            run_id="run_eval_scheduler_webhook_1",
            trigger_reason="manual",
            status="completed",
            started_at="2026-05-27T06:00:00Z",
            completed_at="2026-05-27T06:05:00Z",
            now="2026-05-27T06:05:00Z",
        )

        result = module.scheduler_run_context_loader(
            {
                "job_id": job["job_id"],
                "job_run_id": job_run["job_run_id"],
            }
        )
        report = result["scheduler_run_report"]
        delivery = report["delivery_result"]

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(delivery["kind"], "webhook")
        self.assertEqual(delivery["status"], "skipped")
        self.assertEqual(delivery["reason"], "external_delivery_requires_approval")
        self.assertTrue(delivery["approval_required"])
        self.assertEqual(delivery["required_permissions"], ["external_delivery"])
        self.assertEqual(delivery["permission_profile"]["permission_tier"], "risky")
        self.assertEqual(delivery["target"]["authorization"], "[redacted]")
        self.assertNotIn("secret-token", str(report))

    def test_loader_outputs_graph_run_permission_policy(self) -> None:
        module = _load_tool_module()
        policy = {
            "allowed_permission_tiers": ["none", "guarded", "external", "risky"],
            "approval_required_permission_tiers": ["risky"],
        }
        job = store.create_scheduled_graph_job(
            {
                "job_id": "sched_eval_permission",
                "name": "Scheduler permission boundary",
                "template_id": "scheduler_eval_template",
                "schedule_kind": "manual",
            },
            now="2026-05-27T00:00:00Z",
        )
        store.record_scheduled_graph_job_run(
            job["job_id"],
            job_run_id="schedrun_eval_permission_1",
            run_id="run_eval_scheduler_permission_1",
            trigger_reason="manual",
            status="awaiting_human",
            started_at="2026-05-27T06:00:00Z",
            now="2026-05-27T06:00:00Z",
        )
        save_run(
            {
                "run_id": "run_eval_scheduler_permission_1",
                "root_run_id": "run_eval_scheduler_permission_1",
                "graph_id": "scheduler_permission_graph",
                "graph_name": "Scheduler permission graph",
                "status": "awaiting_human",
                "runtime_backend": "eval_fixture",
                "metadata": {
                    "graph_permission_mode": "ask_first",
                    "capability_permission_policy": policy,
                    "scheduled_graph_permission_policy_source": "scheduler_default",
                    "pending_permission_approval": {
                        "kind": "capability_permission_approval",
                        "capability_key": "local_workspace_executor",
                        "permissions": ["file_write"],
                    },
                },
                "state_values": {},
                "graph_snapshot": {},
                "state_snapshot": {},
                "node_status_map": {},
                "started_at": "2026-05-27T06:00:00Z",
            }
        )

        result = module.scheduler_run_context_loader(
            {
                "job_id": job["job_id"],
                "job_run_id": "schedrun_eval_permission_1",
            }
        )
        report = result["scheduler_run_report"]

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(report["graph_run_status"], "awaiting_human")
        self.assertEqual(report["graph_permission_mode"], "ask_first")
        self.assertEqual(report["permission_policy"], policy)
        self.assertEqual(report["scheduled_graph_permission_policy_source"], "scheduler_default")
        self.assertEqual(report["pending_permission_approval"]["permissions"], ["file_write"])


if __name__ == "__main__":
    unittest.main()

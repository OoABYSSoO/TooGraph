from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.scheduler import runner, store


def _template_payload(template_id: str) -> dict[str, object]:
    return {
        "template_id": template_id,
        "label": "Scheduler Permission Test",
        "description": "Scheduler permission policy test template.",
        "default_graph_name": "Scheduler Permission Graph",
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


class SchedulerPermissionPolicyTests(unittest.TestCase):
    def test_scheduled_graph_snapshot_uses_ask_first_permission_policy(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            data_dir = root / "data"
            db_path = data_dir / "toograph.db"
            official_dir = root / "official"
            user_dir = root / "user"
            template_dir = official_dir / "scheduler_permission_template"
            template_dir.mkdir(parents=True)
            user_dir.mkdir()
            (template_dir / "template.json").write_text(
                json.dumps(_template_payload("scheduler_permission_template")),
                encoding="utf-8",
            )

            with (
                patch("app.core.storage.database.DATA_DIR", data_dir),
                patch("app.core.storage.database.DB_PATH", db_path),
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
                patch("app.templates.loader.TEMPLATE_SETTINGS_PATH", root / "settings.json", create=True),
            ):
                database.initialize_storage()
                job = store.create_scheduled_graph_job(
                    {
                        "name": "权限边界测试",
                        "template_id": "scheduler_permission_template",
                        "schedule_kind": "manual",
                    }
                )
                graph = runner.build_scheduled_graph_document(
                    job,
                    job_run_id="schedrun_permission",
                    trigger_reason="schedule",
                    requested_by="scheduler",
                )

        self.assertEqual(graph.metadata["graph_permission_mode"], "ask_first")
        self.assertEqual(
            graph.metadata["capability_permission_policy"],
            {
                "allowed_permission_tiers": ["none", "guarded", "external", "risky"],
                "approval_required_permission_tiers": ["risky"],
            },
        )
        self.assertEqual(graph.metadata["scheduled_graph_permission_policy_source"], "scheduler_default")


if __name__ == "__main__":
    unittest.main()

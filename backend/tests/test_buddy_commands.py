from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store
from app.main import app


class BuddyCommandRouteTests(unittest.TestCase):
    def test_profile_update_command_records_command_and_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "profile.update",
                            "payload": {"name": "Tutu"},
                            "run_id": "run_review_1",
                            "change_reason": "Manual profile update.",
                        },
                    )
                    commands_response = client.get("/api/buddy/commands")
                    revisions_response = client.get(
                        "/api/buddy/revisions",
                        params={"target_type": "profile", "target_id": "profile"},
                    )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["result"]["name"], "Tutu")
        self.assertEqual(body["command"]["action"], "profile.update")
        self.assertEqual(body["command"]["status"], "succeeded")
        self.assertEqual(body["command"]["target_type"], "profile")
        self.assertEqual(body["command"]["target_id"], "profile")
        self.assertEqual(body["command"]["run_id"], "run_review_1")
        self.assertTrue(body["command"]["command_id"].startswith("cmd_"))
        self.assertTrue(body["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(body["revision"]["revision_id"], body["command"]["revision_id"])
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json()[-1]["changed_by"], "buddy_command")
        self.assertEqual(commands_response.status_code, 200)
        self.assertEqual(commands_response.json()[-1]["command_id"], body["command"]["command_id"])

    def test_memory_document_update_command_records_file_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                with TestClient(app) as client:
                    update_response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "memory_document.update",
                            "payload": {"content": "# MEMORY.md - Long-Term Memory\n\n- Keep replies short.\n"},
                            "run_id": "run_memory_1",
                            "change_reason": "Manual memory document update.",
                        },
                    )
                    revisions_response = client.get(
                        "/api/buddy/revisions",
                        params={"target_type": "home_file", "target_id": "MEMORY.md"},
                    )
                    memory_text = (buddy_home / "MEMORY.md").read_text(encoding="utf-8")

        self.assertEqual(update_response.status_code, 200)
        body = update_response.json()
        self.assertEqual(body["command"]["action"], "memory_document.update")
        self.assertEqual(body["command"]["target_type"], "home_file")
        self.assertEqual(body["command"]["target_id"], "MEMORY.md")
        self.assertEqual(body["command"]["run_id"], "run_memory_1")
        self.assertEqual(body["result"]["path"], "MEMORY.md")
        self.assertIn("Keep replies short", memory_text)
        self.assertTrue(body["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json()[-1]["target_id"], "MEMORY.md")

    def test_graph_patch_draft_is_rejected_in_favor_of_editor_command_flow(self) -> None:
        patch_payload = {
            "graph_id": "graph_buddy_loop",
            "graph_name": "伙伴对话循环",
            "summary": "增加记忆写入前的确认节点。",
            "rationale": "让伙伴先提出图修改建议，再由用户审批。",
            "patch": [
                {
                    "op": "add",
                    "path": "/nodes/confirm_memory_write",
                    "value": {"type": "approval", "label": "确认记忆写入"},
                }
            ],
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "graph_patch.draft",
                            "payload": patch_payload,
                            "change_reason": "Buddy suggested a graph patch.",
                        },
                    )
                    commands_response = client.get("/api/buddy/commands")

        self.assertEqual(response.status_code, 422)
        self.assertIn("Unsupported buddy command action", response.json()["detail"])
        self.assertEqual(commands_response.status_code, 200)
        self.assertEqual(commands_response.json(), [])

    def test_run_template_binding_update_command_records_command_and_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"), patch.object(
                store, "_ensure_run_template_can_be_bound", lambda _template_id: None
            ):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "run_template_binding.update",
                            "payload": {
                                "template_id": "custom_loop",
                                "input_bindings": {
                                    "input_prompt": "current_message",
                                    "input_context": "page_context",
                                },
                            },
                            "run_id": "run_binding_1",
                            "change_reason": "Manual binding update.",
                        },
                    )
                    revisions_response = client.get(
                        "/api/buddy/revisions",
                        params={"target_type": "run_template_binding", "target_id": "run_template_binding"},
                    )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["result"]["template_id"], "custom_loop")
        self.assertEqual(body["result"]["input_bindings"]["input_prompt"], "current_message")
        self.assertEqual(body["command"]["action"], "run_template_binding.update")
        self.assertEqual(body["command"]["target_type"], "run_template_binding")
        self.assertEqual(body["command"]["target_id"], "run_template_binding")
        self.assertEqual(body["command"]["run_id"], "run_binding_1")
        self.assertTrue(body["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(body["revision"]["revision_id"], body["command"]["revision_id"])
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json()[-1]["previous_value"]["template_id"], "buddy_autonomous_loop")

    def test_report_create_command_records_file_report_and_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "report.create",
                            "payload": {
                                "title": "能力复盘",
                                "summary": "本轮能力调用成功。",
                                "content": "能力调用过程和结果已经进入运行详情。",
                                "source": {"run_id": "run_report_1"},
                            },
                            "run_id": "run_report_1",
                            "change_reason": "Buddy generated a review report.",
                        },
                    )
                    revisions_response = client.get("/api/buddy/revisions", params={"target_type": "report"})
                    response_body = response.json()
                    report_exists = (buddy_home / response_body["result"]["path"]).exists() if response.status_code == 200 else False

        self.assertEqual(response.status_code, 200)
        body = response_body
        self.assertEqual(body["command"]["action"], "report.create")
        self.assertEqual(body["command"]["target_type"], "report")
        self.assertEqual(body["command"]["run_id"], "run_report_1")
        self.assertTrue(body["command"]["target_id"].startswith("report_"))
        self.assertTrue(body["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(body["result"]["path"], f"reports/{body['command']['target_id']}.md")
        self.assertTrue(report_exists)
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json()[-1]["target_type"], "report")

    def test_capability_usage_stats_update_command_records_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "capability_usage_stats.update",
                            "payload": {
                                "capability": {"kind": "skill", "key": "web_search", "name": "联网搜索"},
                                "success": True,
                                "run_id": "run_stats_1",
                                "summary": "能力调用成功。",
                            },
                            "run_id": "run_stats_1",
                            "change_reason": "Buddy updated capability usage stats.",
                        },
                    )
                    revisions_response = client.get(
                        "/api/buddy/revisions",
                        params={"target_type": "capability_usage_stats"},
                    )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["command"]["action"], "capability_usage_stats.update")
        self.assertEqual(body["command"]["target_type"], "capability_usage_stats")
        self.assertEqual(body["command"]["target_id"], "capability_usage_stats")
        self.assertEqual(body["result"]["capabilities"]["skill:web_search"]["use_count"], 1)
        self.assertTrue(body["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json()[-1]["target_id"], "capability_usage_stats")

    def test_command_rejects_unsupported_action(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={"action": "graph.delete", "payload": {"graph_id": "graph_1"}},
                    )

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()

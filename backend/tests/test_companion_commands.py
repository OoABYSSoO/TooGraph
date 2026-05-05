from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.companion import store
from app.main import app


class CompanionCommandRouteTests(unittest.TestCase):
    def test_profile_update_command_records_command_and_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/companion/commands",
                        json={
                            "action": "profile.update",
                            "payload": {"name": "Tutu"},
                            "change_reason": "Manual profile update.",
                        },
                    )
                    commands_response = client.get("/api/companion/commands")
                    revisions_response = client.get(
                        "/api/companion/revisions",
                        params={"target_type": "profile", "target_id": "profile"},
                    )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["result"]["name"], "Tutu")
        self.assertEqual(body["command"]["action"], "profile.update")
        self.assertEqual(body["command"]["status"], "succeeded")
        self.assertEqual(body["command"]["target_type"], "profile")
        self.assertEqual(body["command"]["target_id"], "profile")
        self.assertIsNone(body["command"]["run_id"])
        self.assertTrue(body["command"]["command_id"].startswith("cmd_"))
        self.assertTrue(body["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(body["revision"]["revision_id"], body["command"]["revision_id"])
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json()[-1]["changed_by"], "companion_command")
        self.assertEqual(commands_response.status_code, 200)
        self.assertEqual(commands_response.json()[-1]["command_id"], body["command"]["command_id"])

    def test_memory_delete_command_soft_deletes_and_reports_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                with TestClient(app) as client:
                    created_response = client.post(
                        "/api/companion/commands",
                        json={
                            "action": "memory.create",
                            "payload": {"type": "preference", "title": "Reply style", "content": "Keep replies short."},
                            "change_reason": "Manual memory create.",
                        },
                    )
                    memory_id = created_response.json()["result"]["id"]
                    delete_response = client.post(
                        "/api/companion/commands",
                        json={
                            "action": "memory.delete",
                            "target_id": memory_id,
                            "change_reason": "Manual memory delete.",
                        },
                    )
                    enabled_memories = client.get("/api/companion/memories").json()

        self.assertEqual(delete_response.status_code, 200)
        body = delete_response.json()
        self.assertEqual(body["command"]["action"], "memory.delete")
        self.assertEqual(body["command"]["target_type"], "memory")
        self.assertEqual(body["command"]["target_id"], memory_id)
        self.assertTrue(body["result"]["deleted"])
        self.assertTrue(body["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(enabled_memories, [])

    def test_graph_patch_draft_records_approval_command_without_revision(self) -> None:
        patch_payload = {
            "graph_id": "graph_pet_loop",
            "graph_name": "桌宠对话循环",
            "summary": "增加记忆写入前的确认节点。",
            "rationale": "让桌宠先提出图修改建议，再由用户审批。",
            "patch": [
                {
                    "op": "add",
                    "path": "/nodes/confirm_memory_write",
                    "value": {"type": "approval", "label": "确认记忆写入"},
                }
            ],
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/companion/commands",
                        json={
                            "action": "graph_patch.draft",
                            "payload": patch_payload,
                            "change_reason": "Companion suggested a graph patch.",
                        },
                    )
                    commands_response = client.get("/api/companion/commands")
                    revisions_response = client.get("/api/companion/revisions")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["command"]["action"], "graph_patch.draft")
        self.assertEqual(body["command"]["kind"], "companion.graph_patch_draft")
        self.assertEqual(body["command"]["status"], "awaiting_approval")
        self.assertEqual(body["command"]["target_type"], "graph")
        self.assertEqual(body["command"]["target_id"], "graph_pet_loop")
        self.assertIsNone(body["command"]["revision_id"])
        self.assertIsNone(body["command"]["run_id"])
        self.assertIsNone(body["command"]["completed_at"])
        self.assertIsNone(body["revision"])
        self.assertEqual(body["result"]["draft_id"], body["command"]["command_id"])
        self.assertEqual(body["result"]["graph_id"], "graph_pet_loop")
        self.assertEqual(body["result"]["patch"], patch_payload["patch"])
        self.assertEqual(commands_response.status_code, 200)
        self.assertEqual(commands_response.json()[-1]["status"], "awaiting_approval")
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json(), [])

    def test_graph_patch_draft_rejects_empty_patch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/companion/commands",
                        json={
                            "action": "graph_patch.draft",
                            "payload": {"graph_id": "graph_pet_loop", "patch": []},
                        },
                    )

        self.assertEqual(response.status_code, 422)

    def test_command_rejects_unsupported_action(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/companion/commands",
                        json={"action": "graph.delete", "payload": {"graph_id": "graph_1"}},
                    )

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()

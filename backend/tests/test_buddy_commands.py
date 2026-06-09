from __future__ import annotations

import sys
import tempfile
import unittest
import sqlite3
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store
from app.core.storage import database
from app.main import app


class BuddyCommandRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self._data_dir = Path(self._temp_dir.name) / "data"
        self._buddy_home_dir = Path(self._temp_dir.name) / "buddy_home"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", self._data_dir),
            patch("app.core.storage.database.DB_PATH", self._data_dir / "toograph.db"),
            patch.object(store, "BUDDY_HOME_DIR", self._buddy_home_dir),
        ]
        for patcher in self._patchers:
            patcher.start()
        database.initialize_storage()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._temp_dir.cleanup()

    def test_buddy_identity_update_command_records_command_and_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "buddy_identity.update",
                            "payload": {"name": "Tutu"},
                            "run_id": "run_review_1",
                            "change_reason": "Manual buddy identity update.",
                        },
                    )
                    commands_response = client.get("/api/buddy/commands")
                    revisions_response = client.get(
                        "/api/buddy/revisions",
                        params={"target_type": "buddy_identity", "target_id": "buddy_identity"},
                    )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["result"]["name"], "Tutu")
        self.assertEqual(body["command"]["action"], "buddy_identity.update")
        self.assertEqual(body["command"]["status"], "succeeded")
        self.assertEqual(body["command"]["target_type"], "buddy_identity")
        self.assertEqual(body["command"]["target_id"], "buddy_identity")
        self.assertEqual(body["command"]["run_id"], "run_review_1")
        self.assertTrue(body["command"]["command_id"].startswith("cmd_"))
        self.assertTrue(body["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(body["revision"]["revision_id"], body["command"]["revision_id"])
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json()[-1]["changed_by"], "buddy_command")
        self.assertEqual(commands_response.status_code, 200)
        self.assertEqual(commands_response.json()[-1]["command_id"], body["command"]["command_id"])

    def test_user_context_update_command_records_user_md_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "user_context.update",
                            "payload": {"content": "# USER.md - 关于你的协作者\n\n- 用户偏好直接中文回复。\n"},
                            "run_id": "run_user_context_1",
                            "change_reason": "Manual user context update.",
                        },
                    )
                    revisions_response = client.get(
                        "/api/buddy/revisions",
                        params={"target_type": "home_file", "target_id": "USER.md"},
                    )
                    user_text = (buddy_home / "USER.md").read_text(encoding="utf-8")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["command"]["action"], "user_context.update")
        self.assertEqual(body["command"]["target_type"], "home_file")
        self.assertEqual(body["command"]["target_id"], "USER.md")
        self.assertEqual(body["result"]["path"], "USER.md")
        self.assertIn("用户偏好直接中文回复", user_text)
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json()[-1]["target_id"], "USER.md")

    def test_memory_document_update_command_records_file_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                with TestClient(app) as client:
                    update_response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "memory_document.update",
                            "payload": {"content": "# MEMORY.md - 长期记忆\n\n- 保持回复简短。\n"},
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
        self.assertIn("保持回复简短", memory_text)
        self.assertTrue(body["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json()[-1]["target_id"], "MEMORY.md")

    def test_policy_update_command_is_rejected_as_legacy_design(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "policy.update",
                            "payload": {"communication_preferences": ["先给结论。"]},
                            "run_id": "run_policy_legacy",
                            "change_reason": "旧 policy 写回。",
                        },
                    )
                    commands_response = client.get("/api/buddy/commands")

        self.assertEqual(response.status_code, 422)
        self.assertIn("Unsupported buddy command action", response.json()["detail"])
        self.assertEqual(commands_response.status_code, 200)
        self.assertEqual(commands_response.json(), [])
        self.assertFalse((buddy_home / "policy.json").exists())

    def test_memory_entry_create_command_records_command_memory_revision_and_retrieval_projection(self) -> None:
        with TestClient(app) as client:
            response = client.post(
                "/api/buddy/commands",
                json={
                    "action": "memory_entry.create",
                    "payload": {
                        "scope_kind": "buddy_session",
                        "scope_id": "session_1",
                        "layer": "long_term",
                        "memory_type": "preference",
                        "title": "上下文偏好",
                        "content": "用户希望长期文件稳定注入，结构化记忆服务召回。",
                        "confidence": 0.9,
                        "salience": 0.8,
                        "sources": [{"source_kind": "graph_run", "source_id": "run_memory_entry_1"}],
                    },
                    "run_id": "run_memory_entry_1",
                    "change_reason": "自主复盘沉淀结构化记忆。",
                },
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        with closing(sqlite3.connect(database.DB_PATH)) as connection:
            retrieval_document_count = connection.execute(
                "SELECT COUNT(*) FROM retrieval_documents WHERE source_kind = 'memory_entry'"
            ).fetchone()[0]
            retrieval_chunk_count = connection.execute(
                "SELECT COUNT(*) FROM retrieval_chunks WHERE source_kind = 'memory_entry'"
            ).fetchone()[0]
        self.assertEqual(body["command"]["action"], "memory_entry.create")
        self.assertEqual(body["command"]["target_type"], "memory_entry")
        self.assertEqual(body["command"]["run_id"], "run_memory_entry_1")
        self.assertTrue(body["command"]["revision_id"].startswith("memrev_"))
        self.assertEqual(body["revision"]["revision_id"], body["command"]["revision_id"])
        self.assertEqual(body["result"]["content"], "用户希望长期文件稳定注入，结构化记忆服务召回。")
        self.assertEqual(body["result"]["retrieval_projection"]["status"], "succeeded")
        self.assertEqual(retrieval_document_count, 1)
        self.assertEqual(retrieval_chunk_count, 1)

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
                                    "input_context": "session_summary",
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
        self.assertEqual(body["result"]["input_bindings"]["input_context"], "session_summary")
        self.assertEqual(body["command"]["action"], "run_template_binding.update")
        self.assertEqual(body["command"]["target_type"], "run_template_binding")
        self.assertEqual(body["command"]["target_id"], "run_template_binding")
        self.assertEqual(body["command"]["run_id"], "run_binding_1")
        self.assertTrue(body["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(body["revision"]["revision_id"], body["command"]["revision_id"])
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json()[-1]["previous_value"]["template_id"], "buddy_autonomous_loop")

    def test_memory_review_template_binding_update_command_is_rejected_as_legacy_route(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "memory_review_template_binding.update",
                            "payload": {
                                "template_id": "custom_memory_review",
                                "input_bindings": {
                                    "input_source_run_id": "source_run_id",
                                    "input_current_session_id": "current_session_id",
                                    "input_user_message": "user_message",
                                    "input_public_response": "public_response",
                                    "input_buddy_context": "buddy_home_context",
                                },
                            },
                            "run_id": "run_memory_review_binding_1",
                            "change_reason": "Manual memory review binding update.",
                        },
                    )
                    commands_response = client.get("/api/buddy/commands")

        self.assertEqual(response.status_code, 422)
        self.assertIn("Unsupported buddy command action", response.json()["detail"])
        self.assertEqual(commands_response.status_code, 200)
        self.assertEqual(commands_response.json(), [])

    def test_report_create_command_is_rejected_as_legacy_buddy_home_design(self) -> None:
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
                    commands_response = client.get("/api/buddy/commands")

        self.assertEqual(response.status_code, 422)
        self.assertIn("Unsupported buddy command action", response.json()["detail"])
        self.assertFalse((buddy_home / "reports").exists())
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(revisions_response.json(), [])
        self.assertEqual(commands_response.status_code, 200)
        self.assertEqual(commands_response.json(), [])

    def test_capability_usage_stats_update_command_records_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "capability_usage_stats.update",
                            "payload": {
                                "capability": {"kind": "action", "key": "web_search", "name": "联网搜索"},
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
        self.assertEqual(body["result"]["capabilities"]["action:web_search"]["use_count"], 1)
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

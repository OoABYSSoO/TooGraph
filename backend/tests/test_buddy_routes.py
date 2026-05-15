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


class BuddyRouteTests(unittest.TestCase):
    def test_profile_roundtrip_creates_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    get_response = client.get("/api/buddy/profile")
                    put_response = client.put(
                        "/api/buddy/profile",
                        json={"name": "小石墨", "change_reason": "用户重命名"},
                    )
                    revisions_response = client.get("/api/buddy/revisions", params={"target_type": "profile"})

        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(put_response.status_code, 200)
        self.assertEqual(put_response.json()["name"], "小石墨")
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(len(revisions_response.json()), 1)

    def test_memory_document_update_and_restore(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                with TestClient(app) as client:
                    initial_response = client.get("/api/buddy/memory-document")
                    update_response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "memory_document.update",
                            "payload": {"content": "# MEMORY.md - Long-Term Memory\n\n- 喜欢简短回答。\n"},
                            "change_reason": "用户直接编辑 MEMORY.md。",
                        },
                    )
                    current_response = client.get("/api/buddy/memory-document")
                    revisions = client.get(
                        "/api/buddy/revisions",
                        params={"target_type": "home_file", "target_id": "MEMORY.md"},
                    ).json()
                    restore_response = client.post(f"/api/buddy/revisions/{revisions[-1]['revision_id']}/restore")
                    restored_response = client.get("/api/buddy/memory-document")

        self.assertEqual(initial_response.status_code, 200)
        self.assertIn("No durable memories yet.", initial_response.json()["content"])
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["command"]["action"], "memory_document.update")
        self.assertIn("喜欢简短回答", current_response.json()["content"])
        self.assertEqual(restore_response.status_code, 200)
        self.assertIn("No durable memories yet.", restored_response.json()["content"])

    def test_chat_session_message_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    created_response = client.post("/api/buddy/sessions", json={})
                    session = created_response.json()
                    user_response = client.post(
                        f"/api/buddy/sessions/{session['session_id']}/messages",
                        json={"role": "user", "content": "你好"},
                    )
                    assistant_response = client.post(
                        f"/api/buddy/sessions/{session['session_id']}/messages",
                        json={
                            "role": "assistant",
                            "content": "我在。",
                            "include_in_context": False,
                            "run_id": "run_1",
                        },
                    )
                    trace_response = client.post(
                        f"/api/buddy/sessions/{session['session_id']}/messages",
                        json={
                            "role": "assistant",
                            "content": "",
                            "include_in_context": False,
                            "run_id": "run_1",
                            "metadata": {
                                "kind": "output_trace",
                                "outputTrace": {"segmentId": "segment_1"},
                            },
                        },
                    )
                    sessions_response = client.get("/api/buddy/sessions")
                    messages_response = client.get(f"/api/buddy/sessions/{session['session_id']}/messages")
                    delete_response = client.delete(f"/api/buddy/sessions/{session['session_id']}")
                    sessions_after_delete_response = client.get("/api/buddy/sessions")

        self.assertEqual(created_response.status_code, 200)
        self.assertEqual(user_response.status_code, 200)
        self.assertEqual(assistant_response.status_code, 200)
        self.assertEqual(trace_response.status_code, 200)
        self.assertEqual(sessions_response.status_code, 200)
        self.assertEqual(sessions_response.json()[0]["title"], "你好")
        self.assertEqual(sessions_response.json()[0]["message_count"], 3)
        self.assertEqual(messages_response.status_code, 200)
        self.assertEqual([message["role"] for message in messages_response.json()], ["user", "assistant", "assistant"])
        self.assertFalse(messages_response.json()[1]["include_in_context"])
        self.assertEqual(messages_response.json()[2]["metadata"]["kind"], "output_trace")
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.json()["deleted"])
        self.assertEqual(sessions_after_delete_response.json(), [])

    def test_run_template_binding_default_save_and_restore(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"), patch.object(
                store, "_ensure_run_template_can_be_bound", lambda _template_id: None
            ):
                with TestClient(app) as client:
                    default_response = client.get("/api/buddy/run-template-binding")
                    save_response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "run_template_binding.update",
                            "payload": {
                                "template_id": "custom_loop",
                                "input_bindings": {
                                    "input_prompt": "current_message",
                                    "input_history": "conversation_history",
                                },
                            },
                            "change_reason": "用户更新伙伴运行模板绑定。",
                        },
                    )
                    saved_response = client.get("/api/buddy/run-template-binding")
                    revisions = client.get(
                        "/api/buddy/revisions",
                        params={"target_type": "run_template_binding"},
                    ).json()
                    restore_response = client.post(f"/api/buddy/revisions/{revisions[-1]['revision_id']}/restore")
                    restored_response = client.get("/api/buddy/run-template-binding")

        self.assertEqual(default_response.status_code, 200)
        self.assertEqual(default_response.json()["template_id"], "buddy_autonomous_loop")
        self.assertEqual(default_response.json()["input_bindings"]["input_user_message"], "current_message")
        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(save_response.json()["result"]["template_id"], "custom_loop")
        self.assertEqual(saved_response.json()["template_id"], "custom_loop")
        self.assertEqual(len(revisions), 1)
        self.assertEqual(restore_response.status_code, 200)
        self.assertEqual(restored_response.json()["template_id"], "buddy_autonomous_loop")

    def test_run_template_binding_rejects_missing_current_message(self) -> None:
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
                                "input_bindings": {"input_history": "conversation_history"},
                            },
                        },
                    )

        self.assertEqual(response.status_code, 422)
        self.assertIn("current_message", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()

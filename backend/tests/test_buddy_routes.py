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

    def test_memory_delete_and_restore(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    created = client.post(
                        "/api/buddy/memories",
                        json={"type": "preference", "title": "偏好", "content": "喜欢简短回答。"},
                    ).json()
                    delete_response = client.delete(f"/api/buddy/memories/{created['id']}")
                    enabled_memories = client.get("/api/buddy/memories").json()
                    revisions = client.get(
                        "/api/buddy/revisions",
                        params={"target_type": "memory", "target_id": created["id"]},
                    ).json()
                    restore_response = client.post(f"/api/buddy/revisions/{revisions[-1]['revision_id']}/restore")

        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(enabled_memories, [])
        self.assertEqual(restore_response.status_code, 200)
        self.assertFalse(restore_response.json()["current_value"]["deleted"])

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
                    sessions_response = client.get("/api/buddy/sessions")
                    messages_response = client.get(f"/api/buddy/sessions/{session['session_id']}/messages")
                    delete_response = client.delete(f"/api/buddy/sessions/{session['session_id']}")
                    sessions_after_delete_response = client.get("/api/buddy/sessions")

        self.assertEqual(created_response.status_code, 200)
        self.assertEqual(user_response.status_code, 200)
        self.assertEqual(assistant_response.status_code, 200)
        self.assertEqual(sessions_response.status_code, 200)
        self.assertEqual(sessions_response.json()[0]["title"], "你好")
        self.assertEqual(sessions_response.json()[0]["message_count"], 2)
        self.assertEqual(messages_response.status_code, 200)
        self.assertEqual([message["role"] for message in messages_response.json()], ["user", "assistant"])
        self.assertFalse(messages_response.json()[1]["include_in_context"])
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.json()["deleted"])
        self.assertEqual(sessions_after_delete_response.json(), [])


if __name__ == "__main__":
    unittest.main()

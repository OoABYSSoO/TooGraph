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


class CompanionRouteTests(unittest.TestCase):
    def test_profile_roundtrip_creates_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                with TestClient(app) as client:
                    get_response = client.get("/api/companion/profile")
                    put_response = client.put(
                        "/api/companion/profile",
                        json={"name": "小石墨", "change_reason": "用户重命名"},
                    )
                    revisions_response = client.get("/api/companion/revisions", params={"target_type": "profile"})

        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(put_response.status_code, 200)
        self.assertEqual(put_response.json()["name"], "小石墨")
        self.assertEqual(revisions_response.status_code, 200)
        self.assertEqual(len(revisions_response.json()), 1)

    def test_memory_delete_and_restore(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                with TestClient(app) as client:
                    created = client.post(
                        "/api/companion/memories",
                        json={"type": "preference", "title": "偏好", "content": "喜欢简短回答。"},
                    ).json()
                    delete_response = client.delete(f"/api/companion/memories/{created['id']}")
                    enabled_memories = client.get("/api/companion/memories").json()
                    revisions = client.get(
                        "/api/companion/revisions",
                        params={"target_type": "memory", "target_id": created["id"]},
                    ).json()
                    restore_response = client.post(f"/api/companion/revisions/{revisions[-1]['revision_id']}/restore")

        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(enabled_memories, [])
        self.assertEqual(restore_response.status_code, 200)
        self.assertFalse(restore_response.json()["current_value"]["deleted"])

    def test_memory_curator_endpoint_remembers_stable_preference(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                with TestClient(app) as client:
                    curate_response = client.post(
                        "/api/companion/memories/curate-turn",
                        json={"user_message": "以后回答我先给结论。", "assistant_reply": "明白。"},
                    )
                    memories_response = client.get("/api/companion/memories")

        self.assertEqual(curate_response.status_code, 200)
        self.assertFalse(curate_response.json()["skipped"])
        self.assertEqual(len(memories_response.json()), 1)


if __name__ == "__main__":
    unittest.main()

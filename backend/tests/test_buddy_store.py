from __future__ import annotations

import sys
import tempfile
import unittest
import json
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store


class BuddyStoreTests(unittest.TestCase):
    def test_defaults_load_when_files_do_not_exist(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                self.assertEqual(store.load_profile()["name"], "GraphiteUI Buddy")
                self.assertEqual(store.load_policy()["graph_permission_mode"], "advisory")
                self.assertEqual(store.list_memories(), [])
                self.assertIn("content", store.load_session_summary())

    def test_buddy_home_defaults_are_created_on_first_read(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                profile = store.load_profile()

            self.assertEqual(profile["name"], "GraphiteUI Buddy")
            expected_files = [
                "manifest.json",
                "profile.json",
                "policy.json",
                "memories.json",
                "session_summary.json",
                "revisions.json",
                "commands.json",
                "usage/capabilities.json",
                "evolution/review_queue.jsonl",
                "evolution/decisions.jsonl",
            ]
            for relative_path in expected_files:
                self.assertTrue((buddy_home / relative_path).exists(), relative_path)

            manifest = json.loads((buddy_home / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["home"], "buddy_home")
            self.assertIn("profile.json", manifest["files"])
            summary = json.loads((buddy_home / "session_summary.json").read_text(encoding="utf-8"))
            self.assertTrue(summary["content"])

    def test_profile_update_creates_revision_with_previous_and_next_values(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                updated = store.save_profile({"name": "小石墨"}, changed_by="user", change_reason="测试更新")
                revisions = store.list_revisions(target_type="profile", target_id="profile")

        self.assertEqual(updated["name"], "小石墨")
        self.assertEqual(len(revisions), 1)
        self.assertEqual(revisions[0]["target_type"], "profile")
        self.assertEqual(revisions[0]["operation"], "update")
        self.assertEqual(revisions[0]["previous_value"]["name"], "GraphiteUI Buddy")
        self.assertEqual(revisions[0]["next_value"]["name"], "小石墨")

    def test_memory_delete_is_soft_delete_and_restore_creates_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                memory = store.create_memory(
                    {
                        "type": "preference",
                        "title": "回答偏好",
                        "content": "用户喜欢先给结论。",
                    },
                    changed_by="memory_curator",
                    change_reason="自动记忆整理",
                )
                store.delete_memory(memory["id"], changed_by="user", change_reason="用户删除误记")
                self.assertEqual(store.list_memories(), [])
                deleted_items = store.list_memories(include_deleted=True)
                self.assertTrue(deleted_items[0]["deleted"])
                delete_revisions = store.list_revisions(target_type="memory", target_id=memory["id"])
                restored = store.restore_revision(delete_revisions[-1]["revision_id"], changed_by="user", change_reason="恢复测试")

        self.assertEqual(restored["target_type"], "memory")
        self.assertEqual(restored["current_value"]["deleted"], False)


if __name__ == "__main__":
    unittest.main()

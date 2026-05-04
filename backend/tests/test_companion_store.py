from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.companion import store


class CompanionStoreTests(unittest.TestCase):
    def test_defaults_load_when_files_do_not_exist(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                self.assertEqual(store.load_profile()["name"], "GraphiteUI Companion")
                self.assertEqual(store.load_policy()["graph_permission_mode"], "advisory")
                self.assertEqual(store.list_memories(), [])
                self.assertIn("content", store.load_session_summary())

    def test_profile_update_creates_revision_with_previous_and_next_values(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                updated = store.save_profile({"name": "小石墨"}, changed_by="user", change_reason="测试更新")
                revisions = store.list_revisions(target_type="profile", target_id="profile")

        self.assertEqual(updated["name"], "小石墨")
        self.assertEqual(len(revisions), 1)
        self.assertEqual(revisions[0]["target_type"], "profile")
        self.assertEqual(revisions[0]["operation"], "update")
        self.assertEqual(revisions[0]["previous_value"]["name"], "GraphiteUI Companion")
        self.assertEqual(revisions[0]["next_value"]["name"], "小石墨")

    def test_memory_delete_is_soft_delete_and_restore_creates_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
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

    def test_curator_skips_transient_and_base64_content(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                result = store.curate_memory_from_turn(
                    user_message="临时下载这个视频 data:video/mp4;base64,AAAA",
                    assistant_reply="已经下载。",
                    changed_by="memory_curator",
                )
                self.assertEqual(result["created"], [])
                self.assertEqual(store.list_memories(), [])

    def test_curator_remembers_stable_preference(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "COMPANION_DATA_DIR", Path(temp_dir)):
                result = store.curate_memory_from_turn(
                    user_message="以后回答我都先给结论，再给细节。",
                    assistant_reply="明白。",
                    changed_by="memory_curator",
                )
                memories = store.list_memories()

        self.assertEqual(len(memories), 1)
        self.assertIn("先给结论", memories[0]["content"])
        self.assertEqual(result["created"][0]["id"], memories[0]["id"])


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import sys
import tempfile
import unittest
import json
import sqlite3
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store


class BuddyStoreTests(unittest.TestCase):
    def test_defaults_load_when_files_do_not_exist(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                self.assertEqual(store.load_profile()["name"], "GraphiteUI Buddy")
                self.assertEqual(store.load_policy()["graph_permission_mode"], "ask_first")
                self.assertEqual(store.list_memories(), [])
                self.assertIn("content", store.load_session_summary())

    def test_buddy_home_defaults_are_created_on_first_read(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                profile = store.load_profile()

            self.assertEqual(profile["name"], "GraphiteUI Buddy")
            expected_files = [
                "AGENTS.md",
                "SOUL.md",
                "USER.md",
                "MEMORY.md",
                "policy.json",
                "buddy.db",
            ]
            for relative_path in expected_files:
                self.assertTrue((buddy_home / relative_path).exists(), relative_path)

            self.assertTrue((buddy_home / "reports").is_dir())
            for obsolete_path in [
                "manifest.json",
                "profile.json",
                "memories.json",
                "session_summary.json",
                "commands.json",
                "revisions.json",
                "TOOLS.md",
            ]:
                self.assertFalse((buddy_home / obsolete_path).exists(), obsolete_path)

            soul = (buddy_home / "SOUL.md").read_text(encoding="utf-8")
            agents = (buddy_home / "AGENTS.md").read_text(encoding="utf-8")
            user = (buddy_home / "USER.md").read_text(encoding="utf-8")
            memory = (buddy_home / "MEMORY.md").read_text(encoding="utf-8")
            self.assertIn("# SOUL.md - GraphiteUI Buddy", soul)
            self.assertIn("图模板", agents)
            self.assertIn("# USER.md - About Your Human", user)
            self.assertIn("# MEMORY.md - Long-Term Memory", memory)
            self.assertTrue(json.loads((buddy_home / "policy.json").read_text(encoding="utf-8"))["behavior_boundaries"])

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

    def test_chat_sessions_persist_messages_and_soft_delete(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                session = store.create_chat_session({}, changed_by="user", change_reason="测试创建会话")
                user_message = store.append_chat_message(
                    session["session_id"],
                    {"role": "user", "content": "帮我看看当前图的结构"},
                    changed_by="user",
                    change_reason="测试追加用户消息",
                )
                assistant_message = store.append_chat_message(
                    session["session_id"],
                    {
                        "role": "assistant",
                        "content": "当前图结构正常。",
                        "include_in_context": False,
                        "run_id": "run_1",
                    },
                    changed_by="buddy",
                    change_reason="测试追加伙伴消息",
                )
                sessions = store.list_chat_sessions()
                messages = store.list_chat_messages(session["session_id"])
                deleted = store.delete_chat_session(
                    session["session_id"],
                    changed_by="user",
                    change_reason="测试删除会话",
                )
                visible_after_delete = store.list_chat_sessions()
                all_after_delete = store.list_chat_sessions(include_deleted=True)

        self.assertEqual(user_message["role"], "user")
        self.assertEqual(assistant_message["run_id"], "run_1")
        self.assertFalse(assistant_message["include_in_context"])
        self.assertEqual(sessions[0]["title"], "帮我看看当前图的结构")
        self.assertEqual(sessions[0]["message_count"], 2)
        self.assertEqual(sessions[0]["last_message_preview"], "当前图结构正常。")
        self.assertEqual([message["role"] for message in messages], ["user", "assistant"])
        self.assertTrue(deleted["deleted"])
        self.assertEqual(visible_after_delete, [])
        self.assertEqual(all_after_delete[0]["session_id"], session["session_id"])

    def test_chat_messages_order_by_client_order_when_replies_are_persisted_later(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                session = store.create_chat_session({}, changed_by="user", change_reason="测试创建会话")
                store.append_chat_message(
                    session["session_id"],
                    {"role": "user", "content": "第一句", "client_order": 0},
                    changed_by="user",
                    change_reason="测试追加用户消息",
                )
                store.append_chat_message(
                    session["session_id"],
                    {"role": "user", "content": "第二句", "client_order": 2},
                    changed_by="user",
                    change_reason="测试追加用户消息",
                )
                store.append_chat_message(
                    session["session_id"],
                    {"role": "assistant", "content": "第一句回复", "client_order": 1},
                    changed_by="buddy",
                    change_reason="测试追加伙伴消息",
                )

                messages = store.list_chat_messages(session["session_id"])

        self.assertEqual(
            [(message["role"], message["content"], message["client_order"]) for message in messages],
            [
                ("user", "第一句", 0),
                ("assistant", "第一句回复", 1),
                ("user", "第二句", 2),
            ],
        )

    def test_buddy_database_migrates_legacy_messages_before_client_order_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            buddy_home.mkdir()
            db_path = buddy_home / "buddy.db"
            with closing(sqlite3.connect(db_path)) as connection:
                connection.executescript(
                    """
                    CREATE TABLE buddy_sessions (
                        session_id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        archived INTEGER NOT NULL DEFAULT 0,
                        deleted INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE buddy_messages (
                        message_id TEXT PRIMARY KEY,
                        session_id TEXT NOT NULL,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        include_in_context INTEGER NOT NULL DEFAULT 1,
                        run_id TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY(session_id) REFERENCES buddy_sessions(session_id)
                    );
                    """
                )
                connection.execute(
                    """
                    INSERT INTO buddy_sessions
                        (session_id, title, archived, deleted, created_at, updated_at)
                    VALUES (?, ?, 0, 0, ?, ?)
                    """,
                    ("session_1", "旧会话", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
                )
                connection.execute(
                    """
                    INSERT INTO buddy_messages
                        (message_id, session_id, role, content, include_in_context, run_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 1, NULL, ?, ?)
                    """,
                    (
                        "msg_1",
                        "session_1",
                        "user",
                        "旧消息",
                        "2026-01-01T00:00:01Z",
                        "2026-01-01T00:00:01Z",
                    ),
                )
                connection.commit()

            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                store.initialize_buddy_home()
                messages = store.list_chat_messages("session_1")

        self.assertEqual(messages[0]["client_order"], 0)
        self.assertEqual(messages[0]["content"], "旧消息")


if __name__ == "__main__":
    unittest.main()

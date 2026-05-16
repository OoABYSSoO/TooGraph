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
                self.assertEqual(store.load_profile()["name"], "TooGraph Buddy")
                self.assertEqual(store.load_policy()["graph_permission_mode"], "ask_first")
                self.assertIn("# MEMORY.md", store.load_memory_document()["content"])
                self.assertIn("content", store.load_session_summary())

    def test_buddy_home_defaults_are_created_on_first_read(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                profile = store.load_profile()

            self.assertEqual(profile["name"], "TooGraph Buddy")
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
            self.assertIn("# SOUL.md - TooGraph Buddy", soul)
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
        self.assertEqual(revisions[0]["previous_value"]["name"], "TooGraph Buddy")
        self.assertEqual(revisions[0]["next_value"]["name"], "小石墨")

    def test_memory_document_update_writes_memory_md_and_restore_creates_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                updated = store.save_memory_document(
                    {"content": "# MEMORY.md - Long-Term Memory\n\n- 用户喜欢先给结论。\n"},
                    changed_by="memory_curator",
                    change_reason="自动记忆整理",
                )
                document_text = (buddy_home / "MEMORY.md").read_text(encoding="utf-8")
                revisions = store.list_revisions(target_type="home_file", target_id="MEMORY.md")
                restored = store.restore_revision(revisions[-1]["revision_id"], changed_by="user", change_reason="恢复测试")
                restored_text = (buddy_home / "MEMORY.md").read_text(encoding="utf-8")

        self.assertEqual(updated["path"], "MEMORY.md")
        self.assertIn("用户喜欢先给结论", document_text)
        self.assertEqual(revisions[0]["previous_value"]["path"], "MEMORY.md")
        self.assertIn("No durable memories yet.", revisions[0]["previous_value"]["content"])
        self.assertEqual(restored["target_type"], "home_file")
        self.assertEqual(restored["target_id"], "MEMORY.md")
        self.assertIn("No durable memories yet.", restored_text)

    def test_buddy_database_uses_message_fts_without_buddy_memories_table(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                store.initialize_buddy_home()
            with closing(sqlite3.connect(buddy_home / "buddy.db")) as connection:
                table_names = {
                    str(row[0])
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual table')"
                    ).fetchall()
                }

        self.assertNotIn("buddy_memories", table_names)
        self.assertIn("buddy_messages_fts", table_names)
        self.assertIn("buddy_messages_fts_trigram", table_names)

    def test_buddy_database_includes_session_lineage_columns(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                store.initialize_buddy_home()
            with closing(sqlite3.connect(buddy_home / "buddy.db")) as connection:
                session_columns = {
                    str(row[1])
                    for row in connection.execute("PRAGMA table_info(buddy_sessions)").fetchall()
                }

        self.assertIn("parent_session_id", session_columns)
        self.assertIn("source", session_columns)
        self.assertIn("ended_at", session_columns)
        self.assertIn("end_reason", session_columns)

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

    def test_chat_messages_persist_display_metadata_for_trace_records(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                session = store.create_chat_session({}, changed_by="user", change_reason="测试创建会话")
                trace_metadata = {
                    "kind": "output_trace",
                    "outputTrace": {
                        "segmentId": "segment_1",
                        "boundaryNodeId": "llm_1",
                        "boundaryLabel": "回复",
                    },
                }
                trace_message = store.append_chat_message(
                    session["session_id"],
                    {
                        "role": "assistant",
                        "content": "",
                        "client_order": 1,
                        "include_in_context": False,
                        "run_id": "run_1",
                        "metadata": trace_metadata,
                    },
                    changed_by="buddy",
                    change_reason="测试追加运行胶囊",
                )
                messages = store.list_chat_messages(session["session_id"])

        self.assertEqual(trace_message["metadata"], trace_metadata)
        self.assertEqual(messages[0]["metadata"], trace_metadata)
        self.assertEqual(messages[0]["content"], "")
        self.assertFalse(messages[0]["include_in_context"])

    def test_recall_chat_messages_discovers_real_message_windows(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                session = store.create_chat_session({}, changed_by="user", change_reason="测试创建会话")
                store.append_chat_message(
                    session["session_id"],
                    {"role": "user", "content": "我们决定 MEMORY.md 是唯一长期记忆权威。", "client_order": 0},
                    changed_by="user",
                    change_reason="测试追加用户消息",
                )
                store.append_chat_message(
                    session["session_id"],
                    {"role": "assistant", "content": "我会删除平台候选记忆流程。", "client_order": 1},
                    changed_by="buddy",
                    change_reason="测试追加伙伴消息",
                )
                result = store.recall_chat_messages(
                    mode="discover",
                    query="候选记忆",
                    limit=5,
                    window=1,
                )

        self.assertEqual(result["kind"], "buddy_session_recall")
        self.assertEqual(result["mode"], "discover")
        self.assertEqual(result["query"], "候选记忆")
        self.assertEqual(result["hit_count"], 1)
        self.assertEqual(result["sessions"][0]["session_id"], session["session_id"])
        self.assertEqual(
            [message["content"] for message in result["sessions"][0]["messages"]],
            [
                "我们决定 MEMORY.md 是唯一长期记忆权威。",
                "我会删除平台候选记忆流程。",
            ],
        )

    def test_recall_chat_messages_discover_returns_hermes_style_bookends(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                session = store.create_chat_session({"title": "长会话"}, changed_by="user", change_reason="测试创建会话")
                for index, content in enumerate(
                    [
                        "开头目标：讨论 Buddy 记忆。",
                        "开头约束：不要恢复平台 memories。",
                        "中间铺垫：先确认 MEMORY.md 权威。",
                        "命中前文：检索需要真实消息。",
                        "关键命中：记忆落盘模板图要看齐 Hermes。",
                        "命中后文：写入必须走 revision。",
                        "后续细节：输出 diff summary。",
                        "结尾结论：使用 buddy_home_writer。",
                        "结尾行动：用户通过历史恢复。",
                    ]
                ):
                    store.append_chat_message(
                        session["session_id"],
                        {
                            "role": "user" if index % 2 == 0 else "assistant",
                            "content": content,
                            "client_order": index,
                        },
                        changed_by="tester",
                        change_reason="构造长会话",
                    )

                result = store.recall_chat_messages(
                    mode="discover",
                    query="记忆落盘",
                    limit=3,
                    window=1,
                    bookend=2,
                )

        entry = result["sessions"][0]
        self.assertEqual(entry["session_id"], session["session_id"])
        self.assertIn("记忆落盘", entry["snippet"])
        self.assertEqual(entry["matched_role"], "user")
        self.assertEqual([item["content"] for item in entry["bookend_start"]], [
            "开头目标：讨论 Buddy 记忆。",
            "开头约束：不要恢复平台 memories。",
        ])
        self.assertEqual([item["content"] for item in entry["messages"]], [
            "命中前文：检索需要真实消息。",
            "关键命中：记忆落盘模板图要看齐 Hermes。",
            "命中后文：写入必须走 revision。",
        ])
        self.assertEqual([item["content"] for item in entry["bookend_end"]], [
            "结尾结论：使用 buddy_home_writer。",
            "结尾行动：用户通过历史恢复。",
        ])
        self.assertEqual(entry["messages_before"], 1)
        self.assertEqual(entry["messages_after"], 1)

    def test_recall_chat_messages_discovers_multiple_sessions_after_wide_hit_search(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                noisy_session = store.create_chat_session({"title": "多命中"}, changed_by="user", change_reason="测试创建会话")
                for index in range(4):
                    store.append_chat_message(
                        noisy_session["session_id"],
                        {"role": "user", "content": f"重复主题 记忆落盘 第 {index} 次", "client_order": index},
                        changed_by="tester",
                        change_reason="构造重复命中",
                    )
                second_session = store.create_chat_session({"title": "另一个会话"}, changed_by="user", change_reason="测试创建会话")
                store.append_chat_message(
                    second_session["session_id"],
                    {"role": "assistant", "content": "另一个会话也讨论记忆落盘。", "client_order": 0},
                    changed_by="tester",
                    change_reason="构造第二会话",
                )

                result = store.recall_chat_messages(
                    mode="discover",
                    query="记忆落盘",
                    limit=2,
                    window=0,
                )

        self.assertEqual(result["session_count"], 2)
        self.assertEqual(
            {entry["session_id"] for entry in result["sessions"]},
            {noisy_session["session_id"], second_session["session_id"]},
        )

    def test_recall_chat_messages_supports_short_cjk_or_query(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                graph_session = store.create_chat_session({"title": "图"}, changed_by="user", change_reason="测试创建会话")
                store.append_chat_message(
                    graph_session["session_id"],
                    {"role": "user", "content": "图模板负责记忆落盘。", "client_order": 0},
                    changed_by="tester",
                    change_reason="构造图命中",
                )
                memory_session = store.create_chat_session({"title": "记忆"}, changed_by="user", change_reason="测试创建会话")
                store.append_chat_message(
                    memory_session["session_id"],
                    {"role": "assistant", "content": "记忆必须保持可恢复。", "client_order": 0},
                    changed_by="tester",
                    change_reason="构造记忆命中",
                )

                result = store.recall_chat_messages(
                    mode="discover",
                    query="图 OR 记忆",
                    limit=5,
                    window=0,
                )

        self.assertEqual(
            {entry["session_id"] for entry in result["sessions"]},
            {graph_session["session_id"], memory_session["session_id"]},
        )

    def test_recall_chat_messages_browse_projects_compressed_lineage_to_live_tip(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                root_session = store.create_chat_session(
                    {"title": "压缩前会话"},
                    changed_by="user",
                    change_reason="测试创建根会话",
                )
                store.append_chat_message(
                    root_session["session_id"],
                    {"role": "user", "content": "根会话中的旧记忆。", "client_order": 0},
                    changed_by="tester",
                    change_reason="构造根会话消息",
                )
                store.update_chat_session(
                    root_session["session_id"],
                    {
                        "ended_at": "2000-01-01T00:00:00Z",
                        "end_reason": "compression",
                    },
                    changed_by="system",
                    change_reason="测试会话压缩",
                )
                live_session = store.create_chat_session(
                    {
                        "title": "压缩后会话",
                        "parent_session_id": root_session["session_id"],
                    },
                    changed_by="system",
                    change_reason="测试创建压缩后续会话",
                )
                store.append_chat_message(
                    live_session["session_id"],
                    {"role": "assistant", "content": "压缩后的 live tip。", "client_order": 0},
                    changed_by="tester",
                    change_reason="构造后续会话消息",
                )
                tool_session = store.create_chat_session(
                    {"title": "工具子会话", "source": "tool"},
                    changed_by="system",
                    change_reason="测试创建工具会话",
                )
                store.append_chat_message(
                    tool_session["session_id"],
                    {"role": "assistant", "content": "工具子会话不应出现在浏览结果。", "client_order": 0},
                    changed_by="tester",
                    change_reason="构造工具消息",
                )

                result = store.recall_chat_messages(mode="browse", limit=10)

        self.assertEqual(result["session_count"], 1)
        entry = result["sessions"][0]
        self.assertEqual(entry["session_id"], live_session["session_id"])
        self.assertEqual(entry["lineage_root_session_id"], root_session["session_id"])
        self.assertEqual(entry["parent_session_id"], root_session["session_id"])
        self.assertEqual(entry["messages"], [])
        self.assertEqual(entry["hit_message_ids"], [])

    def test_recall_chat_messages_scroll_returns_anchor_window_and_boundaries(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                session = store.create_chat_session({"title": "滚动"}, changed_by="user", change_reason="测试创建会话")
                messages = []
                for index in range(5):
                    messages.append(
                        store.append_chat_message(
                            session["session_id"],
                            {"role": "user", "content": f"第 {index} 条消息", "client_order": index},
                            changed_by="tester",
                            change_reason="构造滚动窗口",
                        )
                    )

                result = store.recall_chat_messages(
                    mode="scroll",
                    session_id=session["session_id"],
                    anchor_message_id=messages[2]["message_id"],
                    window=1,
                )

        entry = result["sessions"][0]
        self.assertEqual([item["content"] for item in entry["messages"]], ["第 1 条消息", "第 2 条消息", "第 3 条消息"])
        self.assertEqual(entry["messages_before"], 1)
        self.assertEqual(entry["messages_after"], 1)
        self.assertTrue(entry["has_more_before"])
        self.assertTrue(entry["has_more_after"])

    def test_recall_chat_messages_scroll_rebinds_anchor_inside_same_lineage(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                root_session = store.create_chat_session(
                    {"title": "压缩根会话"},
                    changed_by="user",
                    change_reason="测试创建根会话",
                )
                store.update_chat_session(
                    root_session["session_id"],
                    {
                        "ended_at": "2000-01-01T00:00:00Z",
                        "end_reason": "compression",
                    },
                    changed_by="system",
                    change_reason="测试会话压缩",
                )
                child_session = store.create_chat_session(
                    {
                        "title": "压缩后续会话",
                        "parent_session_id": root_session["session_id"],
                    },
                    changed_by="system",
                    change_reason="测试创建后续会话",
                )
                anchor = store.append_chat_message(
                    child_session["session_id"],
                    {"role": "assistant", "content": "锚点实际在后续会话。", "client_order": 0},
                    changed_by="tester",
                    change_reason="构造后续锚点",
                )

                result = store.recall_chat_messages(
                    mode="scroll",
                    session_id=root_session["session_id"],
                    anchor_message_id=anchor["message_id"],
                    window=0,
                )

        entry = result["sessions"][0]
        self.assertEqual(entry["session_id"], child_session["session_id"])
        self.assertEqual(entry["lineage_root_session_id"], root_session["session_id"])
        self.assertEqual([item["message_id"] for item in entry["messages"]], [anchor["message_id"]])

    def test_recall_chat_messages_discover_excludes_current_lineage(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                current_root = store.create_chat_session(
                    {"title": "当前根会话"},
                    changed_by="user",
                    change_reason="测试创建当前根会话",
                )
                store.update_chat_session(
                    current_root["session_id"],
                    {
                        "ended_at": "2000-01-01T00:00:00Z",
                        "end_reason": "compression",
                    },
                    changed_by="system",
                    change_reason="测试当前会话压缩",
                )
                current_child = store.create_chat_session(
                    {
                        "title": "当前后续会话",
                        "parent_session_id": current_root["session_id"],
                    },
                    changed_by="system",
                    change_reason="测试创建当前后续会话",
                )
                store.append_chat_message(
                    current_child["session_id"],
                    {"role": "user", "content": "当前谱系里的 recall-lineage-topic。", "client_order": 0},
                    changed_by="tester",
                    change_reason="构造当前谱系命中",
                )
                historical_session = store.create_chat_session(
                    {"title": "历史会话"},
                    changed_by="user",
                    change_reason="测试创建历史会话",
                )
                store.append_chat_message(
                    historical_session["session_id"],
                    {"role": "assistant", "content": "历史会话里的 recall-lineage-topic。", "client_order": 0},
                    changed_by="tester",
                    change_reason="构造历史命中",
                )

                result = store.recall_chat_messages(
                    mode="discover",
                    query="recall-lineage-topic",
                    limit=5,
                    window=0,
                    current_session_id=current_child["session_id"],
                )

        self.assertEqual(
            {entry["session_id"] for entry in result["sessions"]},
            {historical_session["session_id"]},
        )

    def test_run_template_binding_rejects_templates_with_breakpoint_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            buddy_home = root / "buddy_home"
            official_dir = root / "official"
            user_dir = root / "user"
            user_template_dir = user_dir / "paused_loop"
            official_dir.mkdir()
            user_template_dir.mkdir(parents=True)
            (user_template_dir / "template.json").write_text(
                json.dumps(
                    {
                        "template_id": "paused_loop",
                        "label": "Paused Loop",
                        "description": "Has a breakpoint.",
                        "default_graph_name": "Paused Loop",
                        "state_schema": {},
                        "nodes": {},
                        "edges": [],
                        "conditional_edges": [],
                        "metadata": {"interrupt_after": ["review"]},
                    }
                ),
                encoding="utf-8",
            )

            with (
                patch.object(store, "BUDDY_HOME_DIR", buddy_home),
                patch("app.templates.loader.OFFICIAL_TEMPLATES_ROOT", official_dir),
                patch("app.templates.loader.USER_TEMPLATES_ROOT", user_dir),
                patch("app.templates.loader.TEMPLATE_SETTINGS_PATH", root / "settings.json", create=True),
            ):
                with self.assertRaisesRegex(ValueError, "breakpoint"):
                    store.save_run_template_binding(
                        {
                            "template_id": "paused_loop",
                            "input_bindings": {"input_user_message": "current_message"},
                        },
                        changed_by="user",
                        change_reason="测试拒绝断点模板绑定",
                    )

    def test_memory_review_template_binding_defaults_and_revision_restore(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"), patch.object(
                store, "_ensure_memory_review_template_can_be_bound", lambda _template_id: None
            ):
                default_binding = store.load_memory_review_template_binding()
                updated = store.save_memory_review_template_binding(
                    {
                        "template_id": "custom_memory_review",
                        "input_bindings": {
                            "input_source_run_id": "source_run_id",
                            "input_current_session_id": "current_session_id",
                            "input_user_message": "user_message",
                            "input_final_reply": "final_reply",
                            "input_buddy_context": "buddy_home_context",
                        },
                    },
                    changed_by="user",
                    change_reason="测试更新记忆复盘绑定",
                )
                revisions = store.list_revisions(
                    target_type="memory_review_template_binding",
                    target_id="memory_review_template_binding",
                )
                restored = store.restore_revision(
                    revisions[-1]["revision_id"],
                    changed_by="user",
                    change_reason="测试恢复记忆复盘绑定",
                )
                loaded = store.load_memory_review_template_binding()

        self.assertEqual(default_binding["template_id"], "buddy_autonomous_review")
        self.assertEqual(default_binding["input_bindings"]["input_current_session_id"], "current_session_id")
        self.assertEqual(updated["template_id"], "custom_memory_review")
        self.assertEqual(len(revisions), 1)
        self.assertEqual(revisions[0]["previous_value"]["template_id"], "buddy_autonomous_review")
        self.assertEqual(restored["target_type"], "memory_review_template_binding")
        self.assertEqual(restored["target_id"], "memory_review_template_binding")
        self.assertEqual(loaded["template_id"], "buddy_autonomous_review")

    def test_memory_review_template_binding_rejects_internal_state_sources(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"), patch.object(
                store, "_ensure_memory_review_template_can_be_bound", lambda _template_id: None
            ):
                with self.assertRaisesRegex(ValueError, "Unsupported Buddy memory review input source"):
                    store.save_memory_review_template_binding(
                        {
                            "template_id": "buddy_autonomous_review",
                            "input_bindings": {
                                "input_source_run_id": "source_run_id",
                                "input_current_session_id": "current_session_id",
                                "input_user_message": "user_message",
                                "input_final_reply": "final_reply",
                                "input_buddy_context": "buddy_home_context",
                                "input_memory_update_plan": "memory_update_plan",
                            },
                        },
                        changed_by="user",
                        change_reason="测试拒绝内部状态绑定",
                    )

    def test_report_create_writes_markdown_file_and_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                report = store.create_report(
                    {
                        "kind": "autonomous_review",
                        "title": "能力使用复盘",
                        "summary": "本轮联网搜索能力有效。",
                        "content": "用户要求查资料，伙伴选择 web_search 并产出最终回复。",
                        "source": {"run_id": "run_review_report"},
                    },
                    changed_by="buddy_command",
                    change_reason="自主复盘生成报告。",
                )
                revisions = store.list_revisions(target_type="report", target_id=report["id"])
                report_path = buddy_home / report["path"]
                report_exists = report_path.exists()
                report_text = report_path.read_text(encoding="utf-8")

        self.assertTrue(report["id"].startswith("report_"))
        self.assertEqual(report["path"], f"reports/{report['id']}.md")
        self.assertTrue(report_exists)
        self.assertIn("# 能力使用复盘", report_text)
        self.assertEqual(len(revisions), 1)
        self.assertEqual(revisions[0]["operation"], "create")
        self.assertEqual(revisions[0]["next_value"]["summary"], "本轮联网搜索能力有效。")

    def test_report_create_revision_restore_removes_created_report_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home = Path(temp_dir) / "buddy_home"
            with patch.object(store, "BUDDY_HOME_DIR", buddy_home):
                report = store.create_report(
                    {"title": "临时报告", "content": "这是一份可撤销的报告。"},
                    changed_by="buddy_command",
                    change_reason="自主复盘生成报告。",
                )
                revision = store.list_revisions(target_type="report", target_id=report["id"])[0]
                restored = store.restore_revision(
                    revision["revision_id"],
                    changed_by="user",
                    change_reason="用户恢复报告创建前状态。",
                )
                report_exists = (buddy_home / report["path"]).exists()

        self.assertEqual(restored["target_type"], "report")
        self.assertEqual(restored["target_id"], report["id"])
        self.assertEqual(restored["current_value"], {})
        self.assertFalse(report_exists)

    def test_capability_usage_stats_update_accumulates_counts_and_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                stats = store.update_capability_usage_stats(
                    {
                        "entries": [
                            {
                                "capability": {"kind": "action", "key": "web_search", "name": "联网搜索"},
                                "success": True,
                                "run_id": "run_capability_1",
                                "summary": "用于查找资料。",
                                "duration_ms": 1250,
                            },
                            {
                                "capability": {"kind": "action", "key": "web_search", "name": "联网搜索"},
                                "success": False,
                                "run_id": "run_capability_2",
                                "summary": "外部搜索失败。",
                            },
                        ]
                    },
                    changed_by="buddy_command",
                    change_reason="自主复盘更新能力使用统计。",
                )
                revisions = store.list_revisions(target_type="capability_usage_stats", target_id="capability_usage_stats")
                loaded = store.load_capability_usage_stats()

        web_search = stats["capabilities"]["action:web_search"]
        self.assertEqual(web_search["use_count"], 2)
        self.assertEqual(web_search["success_count"], 1)
        self.assertEqual(web_search["failure_count"], 1)
        self.assertEqual(web_search["recent_runs"][0]["run_id"], "run_capability_2")
        self.assertEqual(loaded["capabilities"]["action:web_search"]["use_count"], 2)
        self.assertEqual(len(revisions), 1)
        self.assertEqual(revisions[0]["next_value"]["capabilities"]["action:web_search"]["last_summary"], "外部搜索失败。")

    def test_capability_usage_stats_restore_returns_previous_value(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                store.update_capability_usage_stats(
                    {
                        "capability": {"kind": "subgraph", "key": "advanced_web_research_loop", "name": "高级联网搜索"},
                        "success": True,
                        "run_id": "run_capability_restore",
                    },
                    changed_by="buddy_command",
                    change_reason="自主复盘更新能力使用统计。",
                )
                revision = store.list_revisions(
                    target_type="capability_usage_stats",
                    target_id="capability_usage_stats",
                )[0]
                restored = store.restore_revision(
                    revision["revision_id"],
                    changed_by="user",
                    change_reason="用户恢复能力统计。",
                )
                loaded = store.load_capability_usage_stats()

        self.assertEqual(restored["target_type"], "capability_usage_stats")
        self.assertEqual(restored["target_id"], "capability_usage_stats")
        self.assertEqual(loaded["capabilities"], {})

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
        self.assertEqual(messages[0]["metadata"], {})


if __name__ == "__main__":
    unittest.main()

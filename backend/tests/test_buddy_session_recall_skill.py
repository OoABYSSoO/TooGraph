from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store
from app.core.schemas.skills import SkillLlmNodeEligibility, SkillSourceScope
from app.skills.definitions import _parse_native_skill_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
SESSION_RECALL_SKILL_DIR = REPO_ROOT / "action" / "official" / "buddy_session_recall"


def _load_skill_module():
    spec = importlib.util.spec_from_file_location(
        "test_buddy_session_recall_after_llm",
        SESSION_RECALL_SKILL_DIR / "after_llm.py",
    )
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load buddy_session_recall skill script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BuddySessionRecallSkillTests(unittest.TestCase):
    def test_manifest_exposes_browse_discover_scroll_contract(self) -> None:
        definition = _parse_native_skill_manifest(
            SESSION_RECALL_SKILL_DIR / "action.json",
            SkillSourceScope.OFFICIAL,
        ).definition

        self.assertEqual(definition.skill_key, "buddy_session_recall")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, ["buddy_session_read"])
        self.assertEqual([field.key for field in definition.state_input_schema], ["recall_request"])
        self.assertEqual(
            [field.key for field in definition.llm_output_schema],
            [
                "mode",
                "query",
                "session_id",
                "anchor_message_id",
                "direction",
                "limit",
                "window",
                "bookend",
                "sort",
                "role_filter",
                "current_session_id",
            ],
        )
        self.assertEqual(
            [field.key for field in definition.state_output_schema],
            ["success", "session_recall_context", "sessions", "result"],
        )

    def test_discover_returns_real_buddy_messages_from_db(self) -> None:
        recall = _load_skill_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                session = store.create_chat_session({}, changed_by="user", change_reason="测试创建会话")
                store.append_chat_message(
                    session["session_id"],
                    {"role": "user", "content": "今天讨论 Buddy 记忆方案。", "client_order": 0},
                    changed_by="user",
                    change_reason="测试追加用户消息",
                )
                store.append_chat_message(
                    session["session_id"],
                    {"role": "assistant", "content": "会话召回使用 buddy.db 的 FTS。", "client_order": 1},
                    changed_by="buddy",
                    change_reason="测试追加伙伴消息",
                )

                result = recall.buddy_session_recall(mode="discover", query="buddy.db", limit=5, window=1, bookend=1)

        self.assertEqual(result["success"], True)
        self.assertEqual(result["session_recall_context"]["kind"], "buddy_session_recall")
        self.assertEqual(result["session_recall_context"]["mode"], "discover")
        self.assertEqual(result["sessions"][0]["session_id"], session["session_id"])
        self.assertIn("buddy.db", result["sessions"][0]["snippet"])
        self.assertEqual(
            [message["content"] for message in result["sessions"][0]["messages"]],
            [
                "今天讨论 Buddy 记忆方案。",
                "会话召回使用 buddy.db 的 FTS。",
            ],
        )
        self.assertIn("1 session", result["result"])

    def test_discover_excludes_current_session_lineage_when_requested(self) -> None:
        recall = _load_skill_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                current_session = store.create_chat_session(
                    {"title": "当前会话"},
                    changed_by="user",
                    change_reason="测试创建当前会话",
                )
                store.append_chat_message(
                    current_session["session_id"],
                    {"role": "user", "content": "当前会话提到 session-search-alignment。", "client_order": 0},
                    changed_by="user",
                    change_reason="测试追加当前消息",
                )
                recalled_session = store.create_chat_session(
                    {"title": "历史会话"},
                    changed_by="user",
                    change_reason="测试创建历史会话",
                )
                store.append_chat_message(
                    recalled_session["session_id"],
                    {"role": "assistant", "content": "历史会话也提到 session-search-alignment。", "client_order": 0},
                    changed_by="buddy",
                    change_reason="测试追加历史消息",
                )

                result = recall.buddy_session_recall(
                    mode="discover",
                    query="session-search-alignment",
                    limit=5,
                    current_session_id=current_session["session_id"],
                )

        self.assertEqual(result["success"], True)
        self.assertEqual(
            {entry["session_id"] for entry in result["sessions"]},
            {recalled_session["session_id"]},
        )


if __name__ == "__main__":
    unittest.main()

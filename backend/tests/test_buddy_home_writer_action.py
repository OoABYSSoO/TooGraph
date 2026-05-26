from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.actions import ActionLlmNodeEligibility, ActionSourceScope
from app.actions.definitions import _parse_native_action_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
WRITER_ACTION_DIR = REPO_ROOT / "action" / "official" / "buddy_home_writer"
WRITER_MANIFEST_PATH = WRITER_ACTION_DIR / "action.json"
WRITER_AFTER_LLM_PATH = WRITER_ACTION_DIR / "after_llm.py"


def _run_writer(payload: dict[str, object], *, buddy_home_dir: Path) -> dict[str, object]:
    data_dir = buddy_home_dir.parent / "data"
    completed = subprocess.run(
        [sys.executable, str(WRITER_AFTER_LLM_PATH)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=WRITER_ACTION_DIR,
        env={
            **os.environ,
            "TOOGRAPH_REPO_ROOT": str(REPO_ROOT),
            "TOOGRAPH_DATA_DIR": str(data_dir),
            "TOOGRAPH_BUDDY_HOME_DIR": str(buddy_home_dir),
        },
        check=True,
    )
    parsed = json.loads(completed.stdout)
    assert isinstance(parsed, dict)
    return parsed


class BuddyHomeWriterActionTests(unittest.TestCase):
    def test_manifest_exposes_internal_buddy_home_writer_contract(self) -> None:
        definition = _parse_native_action_manifest(WRITER_MANIFEST_PATH, ActionSourceScope.OFFICIAL).definition
        manifest = json.loads(WRITER_MANIFEST_PATH.read_text(encoding="utf-8"))

        self.assertEqual(definition.action_key, "buddy_home_writer")
        self.assertEqual(definition.llm_node_eligibility, ActionLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, ["buddy_home_write"])
        self.assertEqual(manifest["metadata"], {"internal": True})
        self.assertNotIn("你已绑定", manifest["llmInstruction"])
        self.assertNotIn("不要", manifest["llmInstruction"])
        self.assertNotIn("不得", manifest["llmInstruction"])
        self.assertEqual([field.key for field in definition.state_input_schema], ["autonomous_review"])
        self.assertEqual([field.key for field in definition.llm_output_schema], ["commands", "run_id"])
        self.assertEqual(definition.llm_output_schema[0].value_type, "json_array")
        self.assertEqual(
            [field.key for field in definition.state_output_schema],
            ["success", "result", "applied_commands", "skipped_commands", "revisions"],
        )

    def test_writer_applies_memory_document_command_with_revision_and_run_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home_dir = Path(temp_dir) / "buddy_home"
            result = _run_writer(
                {
                    "run_id": "run_review_1",
                    "commands": [
                        {
                            "action": "memory_document.update",
                            "payload": {
                                "content": "# MEMORY.md - Long-Term Memory\n\n- 用户希望先给结论。\n",
                            },
                            "change_reason": "自主复盘识别到稳定回复偏好。",
                        }
                    ],
                },
                buddy_home_dir=buddy_home_dir,
            )
            memory_text = (buddy_home_dir / "MEMORY.md").read_text(encoding="utf-8")

        self.assertEqual(result["success"], True)
        self.assertEqual(len(result["applied_commands"]), 1)
        applied = result["applied_commands"][0]
        self.assertEqual(applied["command"]["action"], "memory_document.update")
        self.assertEqual(applied["command"]["run_id"], "run_review_1")
        self.assertEqual(applied["command"]["target_type"], "home_file")
        self.assertEqual(applied["command"]["target_id"], "MEMORY.md")
        self.assertTrue(applied["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(result["revisions"][0]["revision_id"], applied["command"]["revision_id"])
        self.assertEqual(result["activity_events"][0]["kind"], "buddy_home_write")
        self.assertIn("Applied 1 Buddy Home command", result["result"])
        self.assertIn("用户希望先给结论", memory_text)

    def test_writer_applies_user_context_command_with_revision_and_run_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home_dir = Path(temp_dir) / "buddy_home"
            result = _run_writer(
                {
                    "run_id": "run_user_context_1",
                    "commands": [
                        {
                            "action": "user_context.update",
                            "payload": {"content": "# USER.md - About Your Human\n\n- 用户偏好直接中文回复。\n"},
                            "change_reason": "自主复盘更新 USER.md。",
                        }
                    ],
                },
                buddy_home_dir=buddy_home_dir,
            )
            user_text = (buddy_home_dir / "USER.md").read_text(encoding="utf-8")

        self.assertEqual(result["success"], True)
        applied = result["applied_commands"][0]
        self.assertEqual(applied["command"]["action"], "user_context.update")
        self.assertEqual(applied["command"]["run_id"], "run_user_context_1")
        self.assertEqual(applied["command"]["target_type"], "home_file")
        self.assertEqual(applied["command"]["target_id"], "USER.md")
        self.assertIn("用户偏好直接中文回复", user_text)

    def test_writer_accepts_planned_buddy_identity_command_items_and_hoists_change_reason(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home_dir = Path(temp_dir) / "buddy_home"
            result = _run_writer(
                {
                    "run_id": "run_review_identity",
                    "commands": {
                        "items": [
                            {
                                "type": "buddy_identity.update",
                                "payload": {
                                    "display_preferences": {"display_name": "图图"},
                                    "change_reason": "用户明确要求以后称呼伙伴为图图。",
                                },
                            }
                        ]
                    },
                },
                buddy_home_dir=buddy_home_dir,
            )

        self.assertEqual(result["success"], True)
        applied = result["applied_commands"][0]
        self.assertEqual(applied["command"]["action"], "buddy_identity.update")
        self.assertEqual(applied["command"]["run_id"], "run_review_identity")
        self.assertEqual(applied["command"]["change_reason"], "用户明确要求以后称呼伙伴为图图。")
        self.assertEqual(applied["command"]["payload"]["display_preferences"]["display_name"], "图图")
        self.assertNotIn("change_reason", applied["command"]["payload"])
        self.assertEqual(applied["result"]["display_preferences"]["display_name"], "图图")
        self.assertTrue(applied["command"]["revision_id"].startswith("rev_"))

    def test_writer_maps_rename_display_name_to_visible_buddy_identity_name(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home_dir = Path(temp_dir) / "buddy_home"
            result = _run_writer(
                {
                    "run_id": "run_review_identity_rename",
                    "commands": [
                        {
                            "action": "buddy_identity.update",
                            "payload": {
                                "display_preferences": {"display_name": "\u56fe\u56fe"},
                            },
                            "change_reason": "\u7528\u6237\u660e\u786e\u8981\u6c42\u4f19\u4f34\u4ee5\u540e\u5c31\u53eb\u56fe\u56fe\u3002",
                        }
                    ],
                },
                buddy_home_dir=buddy_home_dir,
            )

        self.assertEqual(result["success"], True)
        applied = result["applied_commands"][0]
        self.assertEqual(applied["command"]["payload"]["name"], "\u56fe\u56fe")
        self.assertEqual(applied["command"]["payload"]["display_preferences"]["display_name"], "\u56fe\u56fe")
        self.assertEqual(applied["result"]["name"], "\u56fe\u56fe")
        self.assertEqual(applied["result"]["display_preferences"]["display_name"], "\u56fe\u56fe")

    def test_writer_skips_policy_update_commands_as_legacy_design(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home_dir = Path(temp_dir) / "buddy_home"
            result = _run_writer(
                {
                    "run_id": "run_review_policy",
                    "commands": [
                        {
                            "action": "policy.update",
                            "payload": {"communication_preferences": ["默认先给结论。"]},
                            "change_reason": "旧 policy 写回。",
                        }
                    ],
                },
                buddy_home_dir=buddy_home_dir,
            )
            policy_path = buddy_home_dir / "policy.json"

        self.assertEqual(result["success"], False)
        self.assertEqual(result["applied_commands"], [])
        self.assertEqual(result["skipped_commands"][0]["action"], "policy.update")
        self.assertEqual(result["skipped_commands"][0]["error_type"], "unsupported_action")
        event_detail = result["activity_events"][0]["detail"]
        self.assertEqual(event_detail["applied_commands"], [])
        self.assertEqual(event_detail["skipped_commands"], result["skipped_commands"])
        self.assertFalse(policy_path.exists())

    def test_writer_skips_report_create_commands_as_legacy_buddy_home_design(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home_dir = Path(temp_dir) / "buddy_home"
            result = _run_writer(
                {
                    "run_id": "run_review_report",
                    "commands": [
                        {
                            "action": "report.create",
                            "payload": {
                                "kind": "autonomous_review",
                                "title": "运行复盘报告",
                                "summary": "这次运行沉淀为一份报告。",
                                "content": "报告正文只保存精炼结论，不保存完整日志。",
                                "source": {"run_id": "run_review_report"},
                            },
                            "change_reason": "自主复盘生成报告。",
                        }
                    ],
                },
                buddy_home_dir=buddy_home_dir,
            )

        self.assertEqual(result["success"], False)
        self.assertEqual(result["applied_commands"], [])
        self.assertEqual(result["skipped_commands"][0]["action"], "report.create")
        self.assertEqual(result["skipped_commands"][0]["error_type"], "unsupported_action")
        self.assertEqual(result["activity_events"][0]["kind"], "buddy_home_write")
        self.assertFalse((buddy_home_dir / "reports").exists())

    def test_writer_applies_capability_usage_stats_updates(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result = _run_writer(
                {
                    "run_id": "run_review_stats",
                    "commands": [
                        {
                            "action": "capability_usage_stats.update",
                            "payload": {
                                "entries": [
                                    {
                                        "capability": {
                                            "kind": "subgraph",
                                            "key": "advanced_web_research_loop",
                                            "name": "高级联网搜索",
                                        },
                                        "success": True,
                                        "run_id": "run_review_stats",
                                        "summary": "用于完成资料查询。",
                                    }
                                ]
                            },
                            "change_reason": "自主复盘更新能力使用统计。",
                        }
                    ],
                },
                buddy_home_dir=Path(temp_dir) / "buddy_home",
            )

        self.assertEqual(result["success"], True)
        applied = result["applied_commands"][0]
        self.assertEqual(applied["command"]["action"], "capability_usage_stats.update")
        self.assertEqual(applied["command"]["target_type"], "capability_usage_stats")
        self.assertEqual(applied["result"]["capabilities"]["subgraph:advanced_web_research_loop"]["use_count"], 1)


if __name__ == "__main__":
    unittest.main()

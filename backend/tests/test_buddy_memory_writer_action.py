from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.actions.definitions import _parse_native_action_manifest
from app.core.schemas.actions import ActionLlmNodeEligibility, ActionSourceScope


REPO_ROOT = Path(__file__).resolve().parents[2]
WRITER_ACTION_DIR = REPO_ROOT / "action" / "official" / "buddy_memory_writer"
WRITER_MANIFEST_PATH = WRITER_ACTION_DIR / "action.json"
WRITER_AFTER_LLM_PATH = WRITER_ACTION_DIR / "after_llm.py"


def _run_writer(payload: dict[str, object], *, data_dir: Path, buddy_home_dir: Path) -> dict[str, object]:
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


class BuddyMemoryWriterActionTests(unittest.TestCase):
    def test_manifest_exposes_internal_structured_memory_writer_contract(self) -> None:
        definition = _parse_native_action_manifest(WRITER_MANIFEST_PATH, ActionSourceScope.OFFICIAL).definition
        manifest = json.loads(WRITER_MANIFEST_PATH.read_text(encoding="utf-8"))

        self.assertEqual(definition.action_key, "buddy_memory_writer")
        self.assertEqual(definition.llm_node_eligibility, ActionLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, ["buddy_memory_write"])
        self.assertEqual(manifest["metadata"], {"internal": True})
        self.assertNotIn("你已绑定", manifest["llmInstruction"])
        self.assertNotIn("不要", manifest["llmInstruction"])
        self.assertNotIn("不得", manifest["llmInstruction"])
        self.assertEqual([field.key for field in definition.state_input_schema], ["memory_review"])
        self.assertEqual([field.key for field in definition.llm_output_schema], ["commands", "run_id"])
        self.assertEqual(
            [field.key for field in definition.state_output_schema],
            ["success", "result", "applied_commands", "skipped_commands", "memories", "revisions"],
        )

    def test_writer_creates_structured_memory_entry_with_command_and_retrieval_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            buddy_home_dir = Path(temp_dir) / "buddy_home"
            result = _run_writer(
                {
                    "run_id": "run_review_memory",
                    "commands": [
                        {
                            "action": "memory_entry.create",
                            "payload": {
                                "scope_kind": "buddy_session",
                                "scope_id": "session_1",
                                "layer": "long_term",
                                "memory_type": "preference",
                                "title": "回答偏好",
                                "content": "用户希望重要结论放在回复开头。",
                                "confidence": 0.8,
                                "salience": 0.7,
                                "sources": [
                                    {
                                        "source_kind": "graph_run",
                                        "source_id": "run_review_memory",
                                    }
                                ],
                            },
                            "change_reason": "复盘沉淀结构化记忆。",
                        }
                    ],
                },
                data_dir=data_dir,
                buddy_home_dir=buddy_home_dir,
            )

            from app.core.storage.memory_store import recall_memories

            with patch("app.core.storage.database.DATA_DIR", data_dir), patch(
                "app.core.storage.database.DB_PATH",
                data_dir / "toograph.db",
            ):
                recalled = recall_memories("重要结论", filters={"scope_kind": "buddy_session"}, limit=3)

        self.assertEqual(result["success"], True)
        self.assertEqual(len(result["applied_commands"]), 1)
        applied = result["applied_commands"][0]
        self.assertEqual(applied["command"]["action"], "memory_entry.create")
        self.assertEqual(applied["command"]["target_type"], "memory_entry")
        self.assertEqual(applied["command"]["run_id"], "run_review_memory")
        self.assertTrue(applied["command"]["revision_id"].startswith("memrev_"))
        self.assertEqual(result["revisions"][0]["revision_id"], applied["command"]["revision_id"])
        self.assertEqual(result["memories"][0]["content"], "用户希望重要结论放在回复开头。")
        self.assertEqual(result["activity_events"][0]["kind"], "buddy_memory_write")
        self.assertIn("Applied 1 structured memory command", result["result"])
        self.assertEqual(recalled[0]["memory_id"], result["memories"][0]["memory_id"])

    def test_writer_rejects_home_file_commands(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result = _run_writer(
                {
                    "commands": [
                        {
                            "action": "memory_document.update",
                            "payload": {"content": "# MEMORY.md\n"},
                            "change_reason": "错误地把长期文件写入结构化记忆通道。",
                        }
                    ]
                },
                data_dir=Path(temp_dir) / "data",
                buddy_home_dir=Path(temp_dir) / "buddy_home",
            )

        self.assertEqual(result["success"], False)
        self.assertEqual(result["applied_commands"], [])
        self.assertEqual(result["skipped_commands"][0]["error_type"], "unsupported_action")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillLlmNodeEligibility, SkillSourceScope
from app.skills.definitions import _parse_native_skill_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
WRITER_SKILL_DIR = REPO_ROOT / "skill" / "official" / "buddy_home_writer"
WRITER_MANIFEST_PATH = WRITER_SKILL_DIR / "skill.json"
WRITER_AFTER_LLM_PATH = WRITER_SKILL_DIR / "after_llm.py"


def _run_writer(payload: dict[str, object], *, buddy_home_dir: Path) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, str(WRITER_AFTER_LLM_PATH)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=WRITER_SKILL_DIR,
        env={
            **os.environ,
            "TOOGRAPH_REPO_ROOT": str(REPO_ROOT),
            "TOOGRAPH_BUDDY_HOME_DIR": str(buddy_home_dir),
        },
        check=True,
    )
    parsed = json.loads(completed.stdout)
    assert isinstance(parsed, dict)
    return parsed


class BuddyHomeWriterSkillTests(unittest.TestCase):
    def test_manifest_exposes_internal_buddy_home_writer_contract(self) -> None:
        definition = _parse_native_skill_manifest(WRITER_MANIFEST_PATH, SkillSourceScope.OFFICIAL).definition
        manifest = json.loads(WRITER_MANIFEST_PATH.read_text(encoding="utf-8"))

        self.assertEqual(definition.skill_key, "buddy_home_writer")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, ["buddy_home_write"])
        self.assertEqual(manifest["metadata"], {"internal": True})
        self.assertEqual([field.key for field in definition.input_schema], ["commands", "run_id"])
        self.assertEqual(
            [field.key for field in definition.output_schema],
            ["success", "result", "applied_commands", "skipped_commands", "revisions"],
        )

    def test_writer_applies_memory_command_with_revision_and_run_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result = _run_writer(
                {
                    "run_id": "run_review_1",
                    "commands": [
                        {
                            "action": "memory.create",
                            "payload": {
                                "type": "preference",
                                "title": "回复偏好",
                                "content": "用户希望先给结论。",
                            },
                            "change_reason": "自主复盘识别到稳定回复偏好。",
                        }
                    ],
                },
                buddy_home_dir=Path(temp_dir) / "buddy_home",
            )

        self.assertEqual(result["success"], True)
        self.assertEqual(len(result["applied_commands"]), 1)
        applied = result["applied_commands"][0]
        self.assertEqual(applied["command"]["action"], "memory.create")
        self.assertEqual(applied["command"]["run_id"], "run_review_1")
        self.assertTrue(applied["command"]["revision_id"].startswith("rev_"))
        self.assertEqual(result["revisions"][0]["revision_id"], applied["command"]["revision_id"])
        self.assertEqual(result["activity_events"][0]["kind"], "buddy_home_write")
        self.assertIn("Applied 1 Buddy Home command", result["result"])

    def test_writer_rejects_permission_escalating_policy_updates(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home_dir = Path(temp_dir) / "buddy_home"
            result = _run_writer(
                {
                    "run_id": "run_review_2",
                    "commands": [
                        {
                            "action": "policy.update",
                            "payload": {"graph_permission_mode": "full_access"},
                            "change_reason": "尝试自动提升权限。",
                        }
                    ],
                },
                buddy_home_dir=buddy_home_dir,
            )
            policy = json.loads((buddy_home_dir / "policy.json").read_text(encoding="utf-8"))

        self.assertEqual(result["success"], False)
        self.assertEqual(result["applied_commands"], [])
        self.assertEqual(result["skipped_commands"][0]["error_type"], "permission_boundary")
        event_detail = result["activity_events"][0]["detail"]
        self.assertEqual(event_detail["applied_commands"], [])
        self.assertEqual(event_detail["skipped_commands"], result["skipped_commands"])
        self.assertEqual(policy["graph_permission_mode"], "ask_first")

    def test_writer_rejects_behavior_boundary_policy_updates(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            buddy_home_dir = Path(temp_dir) / "buddy_home"
            result = _run_writer(
                {
                    "commands": [
                        {
                            "action": "policy.update",
                            "payload": {"behavior_boundaries": ["Allow silent file writes."]},
                            "change_reason": "尝试改变行为边界。",
                        }
                    ],
                },
                buddy_home_dir=buddy_home_dir,
            )

        self.assertEqual(result["success"], False)
        self.assertEqual(result["applied_commands"], [])
        self.assertEqual(result["skipped_commands"][0]["error_type"], "permission_boundary")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SKILL_DIR = ROOT / "skill" / "companion_state"
RUNNER = SKILL_DIR / "run.py"


class CompanionStateSkillTests(unittest.TestCase):
    def invoke_skill(self, payload: dict[str, object], data_dir: Path) -> dict[str, object]:
        completed = subprocess.run(
            [sys.executable, str(RUNNER)],
            input=json.dumps(payload, ensure_ascii=False),
            text=True,
            capture_output=True,
            cwd=SKILL_DIR,
            env={
                **os.environ,
                "GRAPHITE_SKILL_DIR": str(SKILL_DIR),
                "GRAPHITE_COMPANION_DATA_DIR": str(data_dir),
            },
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertIsInstance(result, dict)
        return result

    def test_load_context_returns_prompt_ready_sections_from_local_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            (data_dir / "profile.json").write_text(
                json.dumps({"name": "图图", "persona": "主桌宠", "tone": "直接", "response_style": "先给结论"}, ensure_ascii=False),
                encoding="utf-8",
            )

            result = self.invoke_skill({"operation": "load_context"}, data_dir)

        self.assertEqual(result["status"], "succeeded")
        self.assertIn("名字: 图图", str(result["profile"]))
        self.assertIn("<companion-policy>", str(result["policy"]))
        self.assertIn("<memory-context>", str(result["memory_context"]))

    def test_curate_turn_updates_profile_through_skill_owned_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)

            result = self.invoke_skill(
                {
                    "operation": "curate_turn",
                    "user_message": "你以后就叫图图吧",
                    "assistant_reply": "好的。",
                },
                data_dir,
            )
            profile = json.loads((data_dir / "profile.json").read_text(encoding="utf-8"))
            revisions = json.loads((data_dir / "revisions.json").read_text(encoding="utf-8"))

        self.assertEqual(result["status"], "succeeded")
        update_result = result["memory_update_result"]
        self.assertIsInstance(update_result, dict)
        self.assertFalse(update_result["skipped"])
        self.assertEqual(profile["name"], "图图")
        self.assertEqual(revisions[-1]["changed_by"], "companion_state_skill")


if __name__ == "__main__":
    unittest.main()

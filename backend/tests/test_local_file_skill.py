from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SKILL_DIR = ROOT / "skill" / "local_file"
RUNNER = SKILL_DIR / "run.py"


class LocalFileSkillTests(unittest.TestCase):
    def invoke_skill(self, payload: dict[str, object], repo_root: Path) -> dict[str, object]:
        completed = subprocess.run(
            [sys.executable, str(RUNNER)],
            input=json.dumps(payload, ensure_ascii=False),
            text=True,
            capture_output=True,
            cwd=ROOT,
            env={
                **os.environ,
                "GRAPHITE_SKILL_DIR": str(SKILL_DIR),
                "GRAPHITE_REPO_ROOT": str(repo_root),
            },
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertIsInstance(result, dict)
        return result

    def test_read_json_returns_default_and_prompt_section_when_file_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)

            result = self.invoke_skill(
                {
                    "operation": "read_json",
                    "path": "backend/data/companion/profile.json",
                    "default_value": {"name": "GraphiteUI Companion"},
                    "section_tag": "companion-profile",
                },
                repo_root,
            )

        self.assertEqual(result["status"], "succeeded")
        self.assertFalse(result["exists"])
        self.assertEqual(result["json_content"], {"name": "GraphiteUI Companion"})
        self.assertIn("<companion-profile>", str(result["prompt_section"]))
        self.assertIn("GraphiteUI Companion", str(result["prompt_section"]))

    def test_write_json_creates_revision_before_replacing_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            data_dir = repo_root / "backend" / "data" / "companion"
            data_dir.mkdir(parents=True)
            profile_path = data_dir / "profile.json"
            revisions_path = data_dir / "revisions.json"
            profile_path.write_text(json.dumps({"name": "旧名"}, ensure_ascii=False), encoding="utf-8")

            result = self.invoke_skill(
                {
                    "operation": "write_json",
                    "path": "backend/data/companion/profile.json",
                    "content": {"name": "图图"},
                    "revision_path": "backend/data/companion/revisions.json",
                    "revision_target_type": "profile",
                    "revision_target_id": "profile",
                    "changed_by": "companion_chat_loop_template",
                    "change_reason": "测试写回。",
                },
                repo_root,
            )
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
            revisions = json.loads(revisions_path.read_text(encoding="utf-8"))

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(profile["name"], "图图")
        self.assertEqual(revisions[-1]["previous_value"], {"name": "旧名"})
        self.assertEqual(revisions[-1]["next_value"], {"name": "图图"})
        self.assertEqual(revisions[-1]["changed_by"], "companion_chat_loop_template")
        self.assertEqual(result["write_result"]["revision_id"], revisions[-1]["revision_id"])

    def test_read_json_filters_prompt_array_without_changing_raw_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            data_dir = repo_root / "backend" / "data" / "companion"
            data_dir.mkdir(parents=True)
            memories = [
                {"title": "保留", "content": "用户喜欢短回答", "enabled": True, "deleted": False},
                {"title": "禁用", "content": "不应注入", "enabled": False, "deleted": False},
                {"title": "删除", "content": "也不应注入", "enabled": True, "deleted": True},
            ]
            (data_dir / "memories.json").write_text(json.dumps(memories, ensure_ascii=False), encoding="utf-8")

            result = self.invoke_skill(
                {
                    "operation": "read_json",
                    "path": "backend/data/companion/memories.json",
                    "section_tag": "memory-context",
                    "prompt_array_filter": {"enabled": True, "deleted": False},
                    "max_prompt_items": 10,
                },
                repo_root,
            )

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["json_content"], memories)
        self.assertEqual(result["prompt_json_content"], [memories[0]])
        self.assertIn("用户喜欢短回答", str(result["prompt_section"]))
        self.assertNotIn("不应注入", str(result["prompt_section"]))
        self.assertNotIn("也不应注入", str(result["prompt_section"]))

    def test_write_json_skips_revision_when_content_is_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            data_dir = repo_root / "backend" / "data" / "companion"
            data_dir.mkdir(parents=True)
            profile_path = data_dir / "profile.json"
            revisions_path = data_dir / "revisions.json"
            profile_path.write_text(json.dumps({"name": "图图"}, ensure_ascii=False), encoding="utf-8")

            result = self.invoke_skill(
                {
                    "operation": "write_json",
                    "path": "backend/data/companion/profile.json",
                    "content": {"name": "图图"},
                    "revision_path": "backend/data/companion/revisions.json",
                    "skip_if_unchanged": True,
                },
                repo_root,
            )
            profile = json.loads(profile_path.read_text(encoding="utf-8"))

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(profile, {"name": "图图"})
        self.assertFalse(revisions_path.exists())
        self.assertTrue(result["write_result"]["skipped"])
        self.assertFalse(result["write_result"]["changed"])
        self.assertIsNone(result["write_result"]["revision_id"])

    def test_rejects_paths_outside_allowlist_and_settings_dir(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)

            traversal = self.invoke_skill(
                {"operation": "read_json", "path": "../secret.json"},
                repo_root,
            )
            settings = self.invoke_skill(
                {
                    "operation": "write_json",
                    "path": "backend/data/settings/private.json",
                    "content": {},
                },
                repo_root,
            )

        self.assertEqual(traversal["status"], "failed")
        self.assertIn("Path", str(traversal["error"]))
        self.assertEqual(settings["status"], "failed")
        self.assertIn("allowlist", str(settings["error"]))

    def test_default_allowlist_includes_graph_memory_data_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)

            result = self.invoke_skill(
                {
                    "operation": "write_json",
                    "path": "backend/data/graph_memory/session.json",
                    "content": {"ok": True},
                },
                repo_root,
            )

        self.assertEqual(result["status"], "succeeded")


if __name__ == "__main__":
    unittest.main()

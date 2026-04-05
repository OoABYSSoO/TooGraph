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

from app.core.schemas.skills import SkillLlmNodeEligibility, SkillSourceScope
from app.skills.definitions import _parse_native_skill_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
READER_SKILL_DIR = REPO_ROOT / "skill" / "buddy_home_context_reader"
READER_MANIFEST_PATH = READER_SKILL_DIR / "skill.json"
READER_AFTER_LLM_PATH = READER_SKILL_DIR / "after_llm.py"


def _run_skill_script(script_path: Path, payload: dict[str, object], *, repo_root: Path) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, str(script_path)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=script_path.parent,
        env={**os.environ, "GRAPHITE_REPO_ROOT": str(repo_root)},
        check=True,
    )
    parsed = json.loads(completed.stdout)
    assert isinstance(parsed, dict)
    return parsed


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


class BuddyHomeContextReaderSkillTests(unittest.TestCase):
    def test_manifest_exposes_single_context_pack_output(self) -> None:
        definition = _parse_native_skill_manifest(READER_MANIFEST_PATH, SkillSourceScope.OFFICIAL).definition

        self.assertEqual(definition.skill_key, "buddy_home_context_reader")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.llm_node_blockers, [])
        self.assertEqual(definition.permissions, ["file_read"])
        self.assertFalse(definition.capability_policy.default.selectable)
        self.assertFalse(definition.capability_policy.default.requires_approval)
        self.assertEqual(definition.input_schema, [])
        self.assertEqual([field.key for field in definition.output_schema], ["context_pack"])

    def test_reader_returns_compact_buddy_home_context_pack(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            buddy_root = repo_root / "buddy_home"
            (buddy_root).mkdir(parents=True, exist_ok=True)
            (buddy_root / "SOUL.md").write_text(
                """---
name: GraphiteUI Buddy
display_name: Buddy
language: zh-CN
tone: 简短直接
response_style: 先给结论
---

# SOUL.md - GraphiteUI Buddy

## Persona

全局伙伴。
""",
                encoding="utf-8",
            )
            (buddy_root / "USER.md").write_text(
                "# USER.md - About Your Human\n\n用户喜欢先给结论。\n",
                encoding="utf-8",
            )
            (buddy_root / "AGENTS.md").write_text(
                "# AGENTS.md - Buddy Workspace\n\n所有副作用都通过图模板和技能执行。\n",
                encoding="utf-8",
            )
            (buddy_root / "MEMORY.md").write_text(
                "# MEMORY.md - Long-Term Memory\n\n- 用户喜欢先给结论。\n",
                encoding="utf-8",
            )
            _write_json(
                buddy_root / "policy.json",
                {
                    "graph_permission_mode": "advisory",
                    "behavior_boundaries": ["不能越权"],
                },
            )
            from app.buddy import store

            with patch.object(store, "BUDDY_HOME_DIR", buddy_root):
                memory = store.create_memory(
                    {
                        "type": "preference",
                        "title": "表达偏好",
                        "content": "用户喜欢先给结论。",
                        "confidence": 0.9,
                    },
                    changed_by="test",
                    change_reason="seed",
                )
                store.update_memory(memory["id"], {"updated_at": "2026-05-09T00:00:00Z"}, changed_by="test", change_reason="stamp")
                deleted = store.create_memory(
                    {
                        "title": "旧记忆",
                        "content": "不应出现",
                        "enabled": False,
                        "deleted": True,
                    },
                    changed_by="test",
                    change_reason="seed",
                )
                store.delete_memory(deleted["id"], changed_by="test", change_reason="delete")
                store.save_session_summary(
                    {"content": "正在设计 Buddy 主循环。"},
                    changed_by="test",
                    change_reason="seed",
                )

            result = _run_skill_script(READER_AFTER_LLM_PATH, {}, repo_root=repo_root)

        self.assertEqual(set(result), {"context_pack"})
        context_pack = result["context_pack"]
        self.assertIsInstance(context_pack, dict)
        self.assertEqual(context_pack["profile"]["name"], "GraphiteUI Buddy")
        self.assertEqual(context_pack["policy"]["graph_permission_mode"], "advisory")
        self.assertEqual(context_pack["session_summary"]["content"], "正在设计 Buddy 主循环。")
        self.assertIn("所有副作用都通过图模板和技能执行", context_pack["home_instructions"])
        self.assertIn("用户喜欢先给结论", context_pack["user_profile"])
        self.assertIn("Long-Term Memory", context_pack["memory_markdown"])
        self.assertEqual(len(context_pack["memories"]), 1)
        self.assertIn("用户喜欢先给结论。", context_pack["memories"][0]["content"])
        self.assertEqual(context_pack["meta"]["memory_count"], 2)
        self.assertEqual(context_pack["meta"]["included_memory_count"], 1)
        self.assertEqual(context_pack["meta"]["warnings"], [])

    def test_reader_uses_defaults_when_buddy_home_files_are_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            result = _run_skill_script(READER_AFTER_LLM_PATH, {}, repo_root=repo_root)

            context_pack = result["context_pack"]
            self.assertEqual(context_pack["profile"]["name"], "GraphiteUI Buddy")
            self.assertEqual(context_pack["policy"]["graph_permission_mode"], "advisory")
            self.assertEqual(context_pack["memories"], [])
            self.assertEqual(context_pack["session_summary"]["content"], "当前对话尚未形成摘要。")
            self.assertTrue((repo_root / "buddy_home" / "SOUL.md").is_file())
            self.assertTrue((repo_root / "buddy_home" / "AGENTS.md").is_file())
            self.assertTrue((repo_root / "buddy_home" / "USER.md").is_file())
            self.assertTrue((repo_root / "buddy_home" / "MEMORY.md").is_file())
            self.assertTrue((repo_root / "buddy_home" / "buddy.db").is_file())
            self.assertFalse((repo_root / "buddy_home" / "TOOLS.md").exists())


if __name__ == "__main__":
    unittest.main()

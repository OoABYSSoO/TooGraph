from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillLlmNodeEligibility, SkillSourceScope
from app.skills.definitions import _parse_native_skill_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
BUILDER_SKILL_DIR = REPO_ROOT / "skill" / "graphiteUI_skill_builder"
BUILDER_MANIFEST_PATH = BUILDER_SKILL_DIR / "skill.json"
BUILDER_BEFORE_LLM_PATH = BUILDER_SKILL_DIR / "before_llm.py"
BUILDER_AFTER_LLM_PATH = BUILDER_SKILL_DIR / "after_llm.py"


def _run_skill_script(script_path: Path, payload: dict[str, object]) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, str(script_path)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=script_path.parent,
        check=True,
    )
    parsed = json.loads(completed.stdout)
    assert isinstance(parsed, dict)
    return parsed


class GraphiteUiSkillBuilderSkillTests(unittest.TestCase):
    def test_manifest_exposes_only_file_content_outputs(self) -> None:
        definition = _parse_native_skill_manifest(BUILDER_MANIFEST_PATH, SkillSourceScope.OFFICIAL).definition

        self.assertEqual(definition.skill_key, "graphiteUI_skill_builder")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.llm_node_blockers, [])
        self.assertEqual(definition.permissions, ["file_read"])
        self.assertEqual(
            [field.key for field in definition.input_schema],
            ["skill_key", "skill_json", "skill_md", "before_llm_py", "after_llm_py", "requirements_txt"],
        )
        self.assertEqual(
            [field.key for field in definition.output_schema],
            ["skill_key", "skill_json", "skill_md", "before_llm_py", "after_llm_py", "requirements_txt"],
        )

    def test_before_llm_injects_current_skill_authoring_guide_boundaries(self) -> None:
        payload = _run_skill_script(BUILDER_BEFORE_LLM_PATH, {"graph_state": {"requirement": "Create a skill."}})

        context = str(payload.get("context") or "")
        self.assertIn("GraphiteUI Skill 编写指南", context)
        self.assertIn("skill.json", context)
        self.assertIn("SKILL.md", context)
        self.assertIn("requirements.txt", context)
        self.assertIn("before_llm.py", context)
        self.assertIn("after_llm.py", context)
        self.assertIn("不直接写图 state", context)

    def test_after_llm_returns_exactly_the_skill_identity_and_file_content_fields(self) -> None:
        skill_json = {
            "schemaVersion": "graphite.skill/v1",
            "skillKey": "tone_rewriter",
            "name": "Tone Rewriter",
            "description": "当用户需要改写文本语气时选择此技能。",
            "llmInstruction": "Rewrite the text.",
            "outputSchema": [{"key": "rewritten_text", "name": "Rewritten Text", "valueType": "markdown"}],
        }
        payload = _run_skill_script(
            BUILDER_AFTER_LLM_PATH,
            {
                "skill_key": "tone_rewriter",
                "skill_json": json.dumps(skill_json),
                "skill_md": "```markdown\n# Tone Rewriter\n\nRewrites text.\n```",
                "before_llm_py": "",
                "after_llm_py": "```python\nprint('{}')\n```",
                "requirements_txt": "```text\npytest>=8,<9\n```",
                "ignored": "do not leak",
            },
        )

        self.assertEqual(
            set(payload),
            {"skill_key", "skill_json", "skill_md", "before_llm_py", "after_llm_py", "requirements_txt"},
        )
        self.assertEqual(payload["skill_key"], "tone_rewriter")
        self.assertEqual(payload["skill_json"], skill_json)
        self.assertEqual(payload["skill_md"], "# Tone Rewriter\n\nRewrites text.")
        self.assertEqual(payload["before_llm_py"], "")
        self.assertEqual(payload["after_llm_py"], "print('{}')")
        self.assertEqual(payload["requirements_txt"], "pytest>=8,<9")

    def test_after_llm_derives_skill_key_from_skill_json_when_missing(self) -> None:
        payload = _run_skill_script(
            BUILDER_AFTER_LLM_PATH,
            {
                "skill_json": {"skillKey": "json_only_skill"},
                "skill_md": "# Json Only Skill",
                "before_llm_py": "",
                "after_llm_py": "",
                "requirements_txt": "",
            },
        )

        self.assertEqual(payload["skill_key"], "json_only_skill")


if __name__ == "__main__":
    unittest.main()

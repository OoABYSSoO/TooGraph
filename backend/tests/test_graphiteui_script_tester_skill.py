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
SCRIPT_TESTER_SKILL_DIR = REPO_ROOT / "skill" / "graphiteUI_script_tester"
SCRIPT_TESTER_MANIFEST_PATH = SCRIPT_TESTER_SKILL_DIR / "skill.json"
SCRIPT_TESTER_BEFORE_LLM_PATH = SCRIPT_TESTER_SKILL_DIR / "before_llm.py"
SCRIPT_TESTER_AFTER_LLM_PATH = SCRIPT_TESTER_SKILL_DIR / "after_llm.py"


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


class GraphiteUiScriptTesterSkillTests(unittest.TestCase):
    def test_manifest_exposes_script_testing_contract(self) -> None:
        definition = _parse_native_skill_manifest(SCRIPT_TESTER_MANIFEST_PATH, SkillSourceScope.OFFICIAL).definition

        self.assertEqual(definition.skill_key, "graphiteUI_script_tester")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.llm_node_blockers, [])
        self.assertEqual(definition.permissions, ["file_write", "subprocess"])
        self.assertTrue(definition.capability_policy.default.requires_approval)
        self.assertEqual(
            [field.key for field in definition.input_schema],
            ["files", "command"],
        )
        self.assertEqual(
            [field.key for field in definition.output_schema],
            ["success", "result"],
        )
        requirements = (SCRIPT_TESTER_SKILL_DIR / "requirements.txt").read_text(encoding="utf-8")
        self.assertIn("pytest", requirements)

    def test_before_llm_injects_system_and_test_authoring_context(self) -> None:
        payload = _run_skill_script(SCRIPT_TESTER_BEFORE_LLM_PATH, {"graph_state": {"script_source": "def add(a, b): return a + b"}})

        context = str(payload.get("context") or "")
        self.assertIn("System context", context)
        self.assertIn("Python executable", context)
        self.assertIn("Available test commands", context)
        self.assertIn("pytest", context)
        self.assertIn("deterministic", context)
        self.assertIn("files", context)
        self.assertIn("command", context)

    def test_after_llm_runs_generated_test_command_successfully(self) -> None:
        payload = _run_skill_script(
            SCRIPT_TESTER_AFTER_LLM_PATH,
            {
                "files": [
                    {"path": "calculator.py", "content": "def add(a, b):\n    return a + b\n"},
                    {
                        "path": "test_calculator.py",
                        "content": "from calculator import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n",
                    },
                ],
                "command": ["python", "-m", "pytest", "-q", "test_calculator.py"],
            },
        )

        self.assertIs(payload["success"], True)
        self.assertIn("1 passed", str(payload["result"]).lower())
        self.assertIn("python -m pytest -q test_calculator.py", str(payload["result"]))

    def test_after_llm_runs_non_python_allowed_script_tests(self) -> None:
        payload = _run_skill_script(
            SCRIPT_TESTER_AFTER_LLM_PATH,
            {
                "files": [
                    {"path": "greet.sh", "content": "printf '%s' hello\n"},
                    {
                        "path": "test_greet.sh",
                        "content": "set -eu\noutput=\"$(sh greet.sh)\"\n[ \"$output\" = \"hello\" ]\n",
                    },
                ],
                "command": ["sh", "test_greet.sh"],
            },
        )

        self.assertIs(payload["success"], True)
        self.assertIn("sh test_greet.sh", str(payload["result"]))

    def test_after_llm_returns_failure_details_for_failing_tests(self) -> None:
        payload = _run_skill_script(
            SCRIPT_TESTER_AFTER_LLM_PATH,
            {
                "files": [
                    {"path": "calculator.py", "content": "def add(a, b):\n    return a - b\n"},
                    {
                        "path": "test_calculator.py",
                        "content": "from calculator import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n",
                    },
                ],
                "command": ["python", "-m", "pytest", "-q", "test_calculator.py"],
            },
        )

        self.assertIs(payload["success"], False)
        self.assertIn("test_add", str(payload["result"]))
        self.assertIn("assert", str(payload["result"]))

    def test_after_llm_rejects_unsupported_commands(self) -> None:
        payload = _run_skill_script(
            SCRIPT_TESTER_AFTER_LLM_PATH,
            {
                "files": [{"path": "test_example.py", "content": "def test_ok():\n    assert True\n"}],
                "command": ["curl", "https://example.com"],
            },
        )

        self.assertIs(payload["success"], False)
        self.assertIn("not allowed", str(payload["result"]))


if __name__ == "__main__":
    unittest.main()

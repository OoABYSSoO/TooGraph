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
            ["script_filename", "script_source", "test_filename", "test_source"],
        )
        self.assertEqual(
            [field.key for field in definition.output_schema],
            ["status", "summary", "test_source", "stdout", "stderr", "exit_code", "errors"],
        )
        requirements = (SCRIPT_TESTER_SKILL_DIR / "requirements.txt").read_text(encoding="utf-8")
        self.assertIn("pytest", requirements)

    def test_before_llm_injects_pytest_authoring_guidance(self) -> None:
        payload = _run_skill_script(SCRIPT_TESTER_BEFORE_LLM_PATH, {"graph_state": {"script_source": "def add(a, b): return a + b"}})

        context = str(payload.get("context") or "")
        self.assertIn("pytest", context)
        self.assertIn("deterministic", context)
        self.assertIn("script_filename", context)
        self.assertIn("test_source", context)

    def test_after_llm_runs_generated_pytest_successfully(self) -> None:
        payload = _run_skill_script(
            SCRIPT_TESTER_AFTER_LLM_PATH,
            {
                "script_filename": "calculator.py",
                "script_source": "def add(a, b):\n    return a + b\n",
                "test_filename": "test_calculator.py",
                "test_source": "from calculator import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n",
            },
        )

        self.assertEqual(payload["status"], "succeeded")
        self.assertEqual(payload["exit_code"], 0)
        self.assertEqual(payload["errors"], [])
        self.assertIn("1 passed", str(payload["stdout"]).lower())
        self.assertIn("test_add", str(payload["test_source"]))

    def test_after_llm_returns_failure_details_for_failing_tests(self) -> None:
        payload = _run_skill_script(
            SCRIPT_TESTER_AFTER_LLM_PATH,
            {
                "script_filename": "calculator.py",
                "script_source": "def add(a, b):\n    return a - b\n",
                "test_filename": "test_calculator.py",
                "test_source": "from calculator import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n",
            },
        )

        self.assertEqual(payload["status"], "failed")
        self.assertNotEqual(payload["exit_code"], 0)
        self.assertTrue(payload["errors"])
        combined_output = f"{payload['stdout']}\n{payload['stderr']}"
        self.assertIn("test_add", combined_output)
        self.assertIn("assert", combined_output)


if __name__ == "__main__":
    unittest.main()

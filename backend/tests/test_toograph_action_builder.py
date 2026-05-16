from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.actions import ActionLlmNodeEligibility, ActionSourceScope
from app.actions.definitions import _parse_native_action_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
BUILDER_ACTION_DIR = REPO_ROOT / "action" / "official" / "toograph_action_builder"
BUILDER_MANIFEST_PATH = BUILDER_ACTION_DIR / "action.json"
BUILDER_BEFORE_LLM_PATH = BUILDER_ACTION_DIR / "before_llm.py"
BUILDER_AFTER_LLM_PATH = BUILDER_ACTION_DIR / "after_llm.py"


def _run_action_script(script_path: Path, payload: dict[str, object]) -> dict[str, object]:
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


class TooGraphActionBuilderTests(unittest.TestCase):
    def test_manifest_exposes_only_file_content_outputs(self) -> None:
        definition = _parse_native_action_manifest(BUILDER_MANIFEST_PATH, ActionSourceScope.OFFICIAL).definition

        self.assertEqual(definition.action_key, "toograph_action_builder")
        self.assertEqual(definition.llm_node_eligibility, ActionLlmNodeEligibility.READY)
        self.assertEqual(definition.llm_node_blockers, [])
        self.assertEqual(definition.permissions, ["file_read"])
        self.assertEqual([field.key for field in definition.state_input_schema], ["confirmed_action_requirement"])
        self.assertEqual(
            [field.key for field in definition.llm_output_schema],
            ["action_key", "action_json", "action_md", "before_llm_py", "after_llm_py", "requirements_txt"],
        )
        self.assertEqual(
            [field.key for field in definition.state_output_schema],
            ["action_key", "action_json", "action_md", "before_llm_py", "after_llm_py", "requirements_txt"],
        )

    def test_before_llm_injects_current_action_authoring_guide_boundaries(self) -> None:
        payload = _run_action_script(BUILDER_BEFORE_LLM_PATH, {"graph_state": {"requirement": "Create a action."}})

        context = str(payload.get("context") or "")
        self.assertIn("TooGraph Action 编写指南", context)
        self.assertIn("action.json", context)
        self.assertIn("ACTION.md", context)
        self.assertIn("requirements.txt", context)
        self.assertIn("before_llm.py", context)
        self.assertIn("after_llm.py", context)
        self.assertIn("不直接写图 state", context)

    def test_after_llm_returns_exactly_the_action_identity_and_file_content_fields(self) -> None:
        action_json = {
            "schemaVersion": "toograph.action/v1",
            "actionKey": "tone_rewriter",
            "name": "Tone Rewriter",
            "description": "当用户需要改写文本语气时选择此Action。",
            "llmInstruction": "Rewrite the text.",
            "stateOutputSchema": [{"key": "rewritten_text", "name": "Rewritten Text", "valueType": "markdown"}],
        }
        payload = _run_action_script(
            BUILDER_AFTER_LLM_PATH,
            {
                "action_key": "tone_rewriter",
                "action_json": json.dumps(action_json),
                "action_md": "```markdown\n# Tone Rewriter\n\nRewrites text.\n```",
                "before_llm_py": "",
                "after_llm_py": "```python\nprint('{}')\n```",
                "requirements_txt": "```text\npytest>=8,<9\n```",
                "ignored": "do not leak",
            },
        )

        self.assertEqual(
            set(payload),
            {"action_key", "action_json", "action_md", "before_llm_py", "after_llm_py", "requirements_txt"},
        )
        self.assertEqual(payload["action_key"], "tone_rewriter")
        self.assertEqual(payload["action_json"], action_json)
        self.assertEqual(payload["action_md"], "# Tone Rewriter\n\nRewrites text.")
        self.assertEqual(payload["before_llm_py"], "")
        self.assertEqual(payload["after_llm_py"], "print('{}')")
        self.assertEqual(payload["requirements_txt"], "pytest>=8,<9")

    def test_after_llm_derives_action_key_from_action_json_when_missing(self) -> None:
        payload = _run_action_script(
            BUILDER_AFTER_LLM_PATH,
            {
                "action_json": {"actionKey": "json_only_action"},
                "action_md": "# Json Only Action",
                "before_llm_py": "",
                "after_llm_py": "",
                "requirements_txt": "",
            },
        )

        self.assertEqual(payload["action_key"], "json_only_action")

    def test_after_llm_strips_local_settings_and_legacy_policy_fields_from_action_json(self) -> None:
        payload = _run_action_script(
            BUILDER_AFTER_LLM_PATH,
            {
                "action_key": "safe_generated_action",
                "action_json": {
                    "schemaVersion": "toograph.action/v1",
                    "actionKey": "safe_generated_action",
                    "name": "Safe Generated Action",
                    "description": "Generate safe output.",
                    "enabled": True,
                    "hidden": False,
                    "selectable": True,
                    "requiresApproval": True,
                    "capabilityPolicy": {
                        "default": {"selectable": True, "requiresApproval": True},
                    },
                    "targets": ["buddy"],
                    "executionTargets": ["default"],
                    "runPolicies": {},
                    "stateInputSchema": [
                        {"key": "source_text", "name": "Source Text", "valueType": "text", "required": True},
                    ],
                    "llmOutputSchema": [
                        {"key": "tone", "name": "Tone", "valueType": "text", "required": True},
                    ],
                    "stateOutputSchema": [
                        {"key": "rewritten", "name": "Rewritten", "valueType": "markdown", "required": True},
                    ],
                },
                "action_md": "# Safe Generated Action",
                "before_llm_py": "",
                "after_llm_py": "",
                "requirements_txt": "",
            },
        )

        self.assertEqual(
            payload["action_json"],
            {
                "schemaVersion": "toograph.action/v1",
                "actionKey": "safe_generated_action",
                "name": "Safe Generated Action",
                "description": "Generate safe output.",
                "stateInputSchema": [
                    {"key": "source_text", "name": "Source Text", "valueType": "text"},
                ],
                "llmOutputSchema": [
                    {"key": "tone", "name": "Tone", "valueType": "text"},
                ],
                "stateOutputSchema": [
                    {"key": "rewritten", "name": "Rewritten", "valueType": "markdown"},
                ],
            },
        )


if __name__ == "__main__":
    unittest.main()

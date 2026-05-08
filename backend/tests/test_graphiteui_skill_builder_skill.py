from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import textwrap
import unittest
from unittest.mock import patch


BUILDER_RUN_PATH = Path(__file__).resolve().parents[2] / "skill" / "graphiteUI_skill_builder" / "run.py"


def _load_builder_module():
    spec = importlib.util.spec_from_file_location("graphiteui_skill_builder_test", BUILDER_RUN_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load graphiteUI_skill_builder skill script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _manifest(skill_key: str = "custom_echo") -> str:
    return json.dumps(
        {
            "schemaVersion": "graphite.skill/v1",
            "skillKey": skill_key,
            "name": "Custom Echo",
            "description": "Echoes a text input.",
            "llmInstruction": "Use this skill only when the user needs an echo.",
            "version": "1.0.0",
            "capabilityPolicy": {
                "default": {"selectable": True, "requiresApproval": False},
                "origins": {"companion": {"selectable": False, "requiresApproval": True}},
            },
            "permissions": ["file_read"],
            "inputSchema": [
                {
                    "key": "text",
                    "name": "Text",
                    "valueType": "text",
                    "required": True,
                    "description": "Text to echo.",
                }
            ],
            "outputSchema": [
                {
                    "key": "status",
                    "name": "Status",
                    "valueType": "text",
                    "required": True,
                    "description": "Execution status.",
                },
                {
                    "key": "echo",
                    "name": "Echo",
                    "valueType": "text",
                    "required": True,
                    "description": "Echoed text.",
                },
            ],
            "runtime": {"type": "python", "entrypoint": "run.py", "timeoutSeconds": 10},
            "health": {"type": "none"},
            "configured": True,
            "healthy": True,
        },
        ensure_ascii=False,
    )


def _files(skill_key: str = "custom_echo") -> dict[str, str]:
    return {
        "skill.json": _manifest(skill_key),
        "SKILL.md": "---\nname: custom_echo\ndescription: Use when testing generated skill packages.\n---\n\n# Custom Echo\n",
        "run.py": textwrap.dedent(
            """
            from __future__ import annotations

            import json
            import sys

            payload = json.loads(sys.stdin.read() or "{}")
            print(json.dumps({"status": "succeeded", "echo": payload.get("text", "")}))
            """
        ).strip()
        + "\n",
    }


class GraphiteUISkillBuilderSkillTests(unittest.TestCase):
    def test_write_skill_package_writes_user_skill_and_runs_smoke_test(self) -> None:
        builder = _load_builder_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                write_result = builder.graphiteui_skill_builder(
                    action="write_skill_package",
                    skill_key="custom_echo",
                    files=_files(),
                    smoke_input={"text": "hello"},
                )

        self.assertEqual(write_result["status"], "succeeded")
        self.assertEqual(write_result["skill_key"], "custom_echo")
        self.assertEqual(write_result["skill_path"], "backend/data/skills/user/custom_echo")
        self.assertIn("backend/data/skills/user/custom_echo/skill.json", write_result["changed_paths"])
        self.assertEqual(write_result["smoke_test"]["status"], "succeeded")
        self.assertEqual(write_result["smoke_test"]["parsed_output"]["echo"], "hello")
        self.assertEqual(write_result["validation"]["errors"], [])

    def test_write_skill_package_rejects_official_skill_key_collision(self) -> None:
        builder = _load_builder_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            (repo_root / "skill/web_search").mkdir(parents=True)
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = builder.graphiteui_skill_builder(
                    action="write_skill_package",
                    skill_key="web_search",
                    files=_files("web_search"),
                )

        self.assertEqual(result["status"], "failed")
        self.assertIn("official Skill", " ".join(result["errors"]))

    def test_write_skill_package_rejects_legacy_agent_instruction_manifest(self) -> None:
        builder = _load_builder_module()
        manifest = json.loads(_manifest())
        manifest.pop("llmInstruction")
        manifest["agentInstruction"] = "Old field."
        broken_files = {
            **_files(),
            "skill.json": json.dumps(manifest),
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = builder.graphiteui_skill_builder(
                    action="write_skill_package",
                    skill_key="custom_echo",
                    files=broken_files,
                )

        self.assertEqual(result["status"], "failed")
        self.assertIn("agentInstruction", " ".join(result["errors"]))
        self.assertIn("llmInstruction", " ".join(result["errors"]))

    def test_apply_patch_creates_revision_and_rollback_restores_previous_files(self) -> None:
        builder = _load_builder_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                first = builder.graphiteui_skill_builder(
                    action="write_skill_package",
                    skill_key="custom_echo",
                    files=_files(),
                )
                patched = builder.graphiteui_skill_builder(
                    action="apply_skill_patch",
                    skill_key="custom_echo",
                    files={"SKILL.md": "# Patched\n"},
                )
                rollback = builder.graphiteui_skill_builder(
                    action="rollback_skill_revision",
                    skill_key="custom_echo",
                    revision_id=patched["revision_id"],
                )

            skill_md = repo_root / "backend/data/skills/user/custom_echo/SKILL.md"
            restored_skill_md = skill_md.read_text(encoding="utf-8")

        self.assertEqual(first["status"], "succeeded")
        self.assertEqual(patched["status"], "succeeded")
        self.assertTrue(patched["revision_id"])
        self.assertEqual(rollback["status"], "succeeded")
        self.assertIn("Custom Echo", restored_skill_md)

    def test_run_skill_smoke_test_reports_output_schema_errors_for_failed_generated_skill(self) -> None:
        builder = _load_builder_module()
        broken_files = {
            **_files(),
            "run.py": "import json\nprint(json.dumps({'status': 'succeeded'}))\n",
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                builder.graphiteui_skill_builder(
                    action="write_skill_package",
                    skill_key="custom_echo",
                    files=broken_files,
                )
                result = builder.graphiteui_skill_builder(
                    action="run_skill_smoke_test",
                    skill_key="custom_echo",
                    smoke_input={"text": "hello"},
                )

        self.assertEqual(result["status"], "failed")
        self.assertIn("missing required output", " ".join(result["errors"]))


if __name__ == "__main__":
    unittest.main()

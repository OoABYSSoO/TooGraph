from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillLlmNodeEligibility, SkillSourceScope
from app.skills.definitions import _parse_native_skill_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
SKILL_DIR = REPO_ROOT / "skill" / "official" / "toograph_skill_package_reader"


def _load_skill_module():
    spec = importlib.util.spec_from_file_location("test_toograph_skill_package_reader_after_llm", SKILL_DIR / "after_llm.py")
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load toograph_skill_package_reader script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ToographSkillPackageReaderSkillTests(unittest.TestCase):
    def test_manifest_exposes_read_only_skill_package_contract(self) -> None:
        definition = _parse_native_skill_manifest(SKILL_DIR / "skill.json", SkillSourceScope.OFFICIAL).definition

        self.assertEqual(definition.skill_key, "toograph_skill_package_reader")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, ["skill_read"])
        self.assertEqual([field.key for field in definition.state_input_schema], ["target_skill_key"])
        self.assertEqual([field.key for field in definition.llm_output_schema], ["skill_key", "source_scope"])
        self.assertEqual([field.key for field in definition.state_output_schema], ["success", "skill_package", "result"])

    def test_reader_returns_existing_official_skill_files_without_runtime_artifacts(self) -> None:
        reader = _load_skill_module()

        result = reader.toograph_skill_package_reader(skill_key="memory_recall")

        self.assertEqual(result["success"], True)
        package = result["skill_package"]
        self.assertEqual(package["skill_key"], "memory_recall")
        self.assertEqual(package["source_scope"], "official")
        self.assertIn("skill.json", package["files"])
        self.assertIn("SKILL.md", package["files"])
        self.assertIn("after_llm.py", package["files"])
        self.assertNotIn("__pycache__", "\n".join(package["files"]))
        self.assertIn("memory_recall", package["files"]["skill.json"])
        self.assertIn("Read", result["result"])

    def test_reader_rejects_path_traversal_skill_keys(self) -> None:
        reader = _load_skill_module()

        result = reader.toograph_skill_package_reader(skill_key="../memory_recall")

        self.assertEqual(result["success"], False)
        self.assertEqual(result["skill_package"], {})
        self.assertIn("Invalid skill_key", result["result"])


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.actions import ActionLlmNodeEligibility, ActionSourceScope
from app.actions.definitions import _parse_native_action_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
ACTION_DIR = REPO_ROOT / "action" / "official" / "toograph_action_package_reader"


def _load_action_module():
    spec = importlib.util.spec_from_file_location("test_toograph_action_package_reader_after_llm", ACTION_DIR / "after_llm.py")
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load toograph_action_package_reader script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ToographActionPackageReaderTests(unittest.TestCase):
    def test_manifest_exposes_read_only_action_package_contract(self) -> None:
        definition = _parse_native_action_manifest(ACTION_DIR / "action.json", ActionSourceScope.OFFICIAL).definition

        self.assertEqual(definition.action_key, "toograph_action_package_reader")
        self.assertEqual(definition.llm_node_eligibility, ActionLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, ["action_read"])
        self.assertEqual([field.key for field in definition.state_input_schema], ["target_action_key"])
        self.assertEqual([field.key for field in definition.llm_output_schema], ["action_key", "source_scope"])
        self.assertEqual([field.key for field in definition.state_output_schema], ["success", "action_package", "result"])

    def test_reader_returns_existing_official_action_files_without_runtime_artifacts(self) -> None:
        reader = _load_action_module()

        result = reader.toograph_action_package_reader(action_key="buddy_session_recall")

        self.assertEqual(result["success"], True)
        package = result["action_package"]
        self.assertEqual(package["action_key"], "buddy_session_recall")
        self.assertEqual(package["source_scope"], "official")
        self.assertIn("action.json", package["files"])
        self.assertIn("ACTION.md", package["files"])
        self.assertIn("after_llm.py", package["files"])
        self.assertNotIn("__pycache__", "\n".join(package["files"]))
        self.assertIn("buddy_session_recall", package["files"]["action.json"])
        self.assertIn("Read", result["result"])

    def test_reader_rejects_path_traversal_action_keys(self) -> None:
        reader = _load_action_module()

        result = reader.toograph_action_package_reader(action_key="../buddy_session_recall")

        self.assertEqual(result["success"], False)
        self.assertEqual(result["action_package"], {})
        self.assertIn("Invalid action_key", result["result"])


if __name__ == "__main__":
    unittest.main()

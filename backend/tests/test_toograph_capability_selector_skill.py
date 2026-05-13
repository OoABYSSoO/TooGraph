from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import unittest


SELECTOR_SKILL_DIR = Path(__file__).resolve().parents[2] / "skill" / "official" / "toograph_capability_selector"
SELECTOR_AFTER_LLM_PATH = SELECTOR_SKILL_DIR / "after_llm.py"
FIXED_PAGE_OPERATION_CAPABILITY = {
    "kind": "subgraph",
    "key": "toograph_page_operation_workflow",
}


def _load_selector_module(path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Could not load {path}.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TooGraphCapabilitySelectorSkillTests(unittest.TestCase):
    def test_manifest_declares_only_fixed_capability_and_found_outputs(self) -> None:
        manifest = json.loads((SELECTOR_SKILL_DIR / "skill.json").read_text(encoding="utf-8"))

        self.assertEqual(manifest["skillKey"], "toograph_capability_selector")
        self.assertEqual(manifest["timeoutSeconds"], 30)
        self.assertEqual(manifest.get("stateInputSchema", []), [])
        self.assertEqual(manifest.get("llmOutputSchema", []), [])
        self.assertEqual(
            [field["key"] for field in manifest["stateOutputSchema"]],
            ["capability", "found"],
        )
        self.assertNotIn("audit", [field["key"] for field in manifest["stateOutputSchema"]])
        self.assertNotIn("selection_reason", json.dumps(manifest, ensure_ascii=False))
        self.assertNotIn("rejected_candidates", json.dumps(manifest, ensure_ascii=False))

    def test_selector_package_removes_catalog_and_pre_llm_complexity(self) -> None:
        self.assertFalse((SELECTOR_SKILL_DIR / "before_llm.py").exists())
        self.assertFalse((SELECTOR_SKILL_DIR / "capability_catalog.py").exists())

    def test_after_llm_always_returns_fixed_page_operation_capability(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_fixed_test")

        for payload in (
            {},
            {"capability": {"kind": "skill", "key": "web_search"}},
            {"capability": {"kind": "none"}, "requirement": "研究资料"},
        ):
            with self.subTest(payload=payload):
                result = selector.toograph_capability_selector(**payload)

            self.assertEqual(set(result), {"capability", "found"})
            self.assertTrue(result["found"])
            self.assertEqual(result["capability"], FIXED_PAGE_OPERATION_CAPABILITY)


if __name__ == "__main__":
    unittest.main()

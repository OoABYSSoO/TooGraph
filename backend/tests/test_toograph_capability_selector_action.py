from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import unittest


SELECTOR_ACTION_DIR = Path(__file__).resolve().parents[2] / "action" / "official" / "toograph_capability_selector"
SELECTOR_BEFORE_LLM_PATH = SELECTOR_ACTION_DIR / "before_llm.py"
SELECTOR_AFTER_LLM_PATH = SELECTOR_ACTION_DIR / "after_llm.py"
def _load_selector_module(path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Could not load {path}.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TooGraphCapabilitySelectorActionTests(unittest.TestCase):
    def test_manifest_declares_requirement_input_llm_selection_and_capability_outputs(self) -> None:
        manifest = json.loads((SELECTOR_ACTION_DIR / "action.json").read_text(encoding="utf-8"))

        self.assertEqual(manifest["actionKey"], "toograph_capability_selector")
        self.assertEqual(manifest["timeoutSeconds"], 30)
        self.assertEqual(
            [field["key"] for field in manifest.get("stateInputSchema", [])],
            ["requirement"],
        )
        self.assertEqual(
            [field["key"] for field in manifest.get("llmOutputSchema", [])],
            ["capability"],
        )
        self.assertEqual(
            [field["key"] for field in manifest["stateOutputSchema"]],
            ["capability", "found"],
        )
        self.assertNotIn("audit", [field["key"] for field in manifest["stateOutputSchema"]])

    def test_before_llm_publishes_enabled_capability_key_description_context(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "toograph_capability_selector_before_test")

        result = selector.toograph_capability_selector_before_llm(
            runtime_context={"origin": "buddy"},
        )

        context = result["context"]
        self.assertIn("Available TooGraph capabilities:", context)
        self.assertIn("Subgraphs:", context)
        self.assertIn("Actions:", context)
        self.assertIn("Tools:", context)
        self.assertIn("advanced_web_research_loop", context)
        self.assertIn("web_search", context)
        self.assertIn("video_segmenter", context)
        self.assertIn("description:", context)
        self.assertNotIn("Invocation origin:", context)
        self.assertNotIn("Selection rules:", context)
        self.assertNotIn("kind:", context)
        self.assertNotIn("name:", context)
        self.assertNotIn("inputs:", context)
        self.assertNotIn("outputs:", context)
        self.assertNotIn("permissions:", context)
        self.assertNotIn("source:", context)
        self.assertNotIn("Counts:", context)
        allowed_prefixes = (
            "Available TooGraph capabilities:",
            "Subgraphs:",
            "Actions:",
            "Tools:",
            "- key:",
            "  description:",
        )
        for line in context.splitlines():
            if line:
                self.assertTrue(line.startswith(allowed_prefixes), line)

    def test_capability_catalog_does_not_offer_selector_itself(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "toograph_capability_selector_before_self_test")

        catalog = selector.discover_capability_catalog()

        action_keys = [item["key"] for item in catalog["actions"]]
        self.assertNotIn("toograph_capability_selector", action_keys)
        for section in ("subgraphs", "actions", "tools"):
            for item in catalog[section]:
                self.assertEqual(set(item), {"kind", "key", "description"})

    def test_after_llm_validates_and_normalizes_selected_capability(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_validate_test")

        result = selector.toograph_capability_selector(
            capability={
                "kind": "subgraph",
                "key": "advanced_web_research_loop",
                "confidence": 0.82,
                "reason": "需要联网调研。",
            }
        )

        self.assertEqual(result["capability"]["kind"], "subgraph")
        self.assertEqual(result["capability"]["key"], "advanced_web_research_loop")
        self.assertNotIn("name", result["capability"])
        self.assertIn("description", result["capability"])
        self.assertEqual(result["capability"]["confidence"], 0.82)
        self.assertEqual(result["capability"]["reason"], "需要联网调研。")
        self.assertTrue(result["found"])

    def test_after_llm_returns_none_when_selected_capability_is_disabled_or_unknown(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_unknown_test")

        result = selector.toograph_capability_selector(
            capability={"kind": "subgraph", "key": "not_enabled_template", "reason": "LLM guessed."}
        )

        self.assertEqual(result["capability"]["kind"], "none")
        self.assertIn("not_enabled_template", result["capability"]["reason"])
        self.assertFalse(result["found"])

    def test_after_llm_returns_none_when_llm_selects_none(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_none_test")

        result = selector.toograph_capability_selector(
            capability={"kind": "none", "reason": "没有合适能力。"},
        )

        self.assertEqual(result["capability"]["kind"], "none")
        self.assertEqual(result["capability"]["reason"], "没有合适能力。")
        self.assertFalse(result["found"])


if __name__ == "__main__":
    unittest.main()

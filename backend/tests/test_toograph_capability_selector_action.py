from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
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
    def test_manifest_declares_current_requirement_hint_llm_selection_and_capability_outputs(self) -> None:
        manifest = json.loads((SELECTOR_ACTION_DIR / "action.json").read_text(encoding="utf-8"))

        self.assertEqual(manifest["actionKey"], "toograph_capability_selector")
        self.assertEqual(manifest["timeoutSeconds"], 30)
        self.assertEqual(
            [field["key"] for field in manifest.get("stateInputSchema", [])],
            ["current_requirement"],
        )
        self.assertEqual(
            [field["key"] for field in manifest.get("llmOutputSchema", [])],
            ["capability"],
        )
        self.assertEqual(
            [field["key"] for field in manifest["stateOutputSchema"]],
            ["capability", "needs_capability"],
        )
        self.assertNotIn("audit", [field["key"] for field in manifest["stateOutputSchema"]])
        instruction = manifest["llmInstruction"]
        self.assertIn("是否还需要调用能力", instruction)
        self.assertIn("当前图状态", instruction)
        self.assertNotIn("loop_context", instruction)
        self.assertIn("needs_capability", json.dumps(manifest["stateOutputSchema"], ensure_ascii=False))
        self.assertLess(instruction.index("subgraph"), instruction.index("action"))
        self.assertLess(instruction.index("action"), instruction.index("tool"))
        self.assertIn('{"kind":"none"}', instruction)
        self.assertNotIn('{"kind":"none","reason"', instruction)

    def test_before_llm_publishes_enabled_capability_key_description_context(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "toograph_capability_selector_before_test")

        result = selector.toograph_capability_selector_before_llm(
            runtime_context={"origin": "buddy"},
        )

        context = result["context"]
        self.assertIn("Available TooGraph capabilities:", context)
        self.assertIn("Selection guidance:", context)
        self.assertIn("Subgraphs:", context)
        self.assertIn("Actions:", context)
        self.assertIn("Tools:", context)
        self.assertIn("advanced_web_research_loop", context)
        self.assertIn("web_search", context)
        self.assertIn("video_segmenter", context)
        self.assertIn("description:", context)
        self.assertIn("granularity:", context)
        self.assertIn("covers:", context)
        self.assertIn("produces:", context)
        self.assertNotIn("Invocation origin:", context)
        self.assertNotIn("kind:", context)
        self.assertNotIn("name:", context)
        self.assertNotIn("inputs:", context)
        self.assertNotIn("outputs:", context)
        self.assertNotIn("permissions:", context)
        self.assertNotIn("source:", context)
        self.assertNotIn("Counts:", context)
        allowed_prefixes = (
            "Available TooGraph capabilities:",
            "Selection guidance:",
            "- Prefer",
            "- Select",
            "Subgraphs:",
            "Actions:",
            "Tools:",
            "- key:",
            "  description:",
            "  granularity:",
            "  covers:",
            "  produces:",
            "  taskTags:",
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
                self.assertTrue({"kind", "key", "description"}.issubset(set(item)))

    def test_capability_catalog_does_not_offer_hidden_templates(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "toograph_capability_selector_before_hidden_test")

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            template_dir = root / "graph_template" / "official"
            visible_dir = template_dir / "visible_loop"
            hidden_dir = template_dir / "hidden_loop"
            action_dir = root / "action"
            tool_dir = root / "tool"
            visible_dir.mkdir(parents=True)
            hidden_dir.mkdir(parents=True)
            action_dir.mkdir()
            tool_dir.mkdir()
            (root / "graph_template" / "settings.json").write_text(
                json.dumps(
                    {
                        "entries": {
                            "visible_loop": {"enabled": True, "capabilityDiscoverable": True},
                            "hidden_loop": {"enabled": True, "capabilityDiscoverable": True},
                        }
                    }
                ),
                encoding="utf-8",
            )
            (visible_dir / "template.json").write_text(
                json.dumps(
                    {
                        "template_id": "visible_loop",
                        "label": "Visible Loop",
                        "description": "Visible template.",
                        "metadata": {},
                    }
                ),
                encoding="utf-8",
            )
            (hidden_dir / "template.json").write_text(
                json.dumps(
                    {
                        "template_id": "hidden_loop",
                        "label": "Hidden Loop",
                        "description": "Hidden template.",
                        "metadata": {"visible": False},
                    }
                ),
                encoding="utf-8",
            )

            catalog = selector.discover_capability_catalog(root)

        subgraph_keys = [item["key"] for item in catalog["subgraphs"]]
        self.assertIn("visible_loop", subgraph_keys)
        self.assertNotIn("hidden_loop", subgraph_keys)

    def test_capability_catalog_exposes_generic_selection_metadata(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "toograph_capability_selector_before_metadata_test")

        catalog = selector.discover_capability_catalog()
        research_loop = next(item for item in catalog["subgraphs"] if item["key"] == "advanced_web_research_loop")
        web_search = next(item for item in catalog["actions"] if item["key"] == "web_search")

        self.assertEqual(research_loop["granularity"], "workflow")
        self.assertIn("web_research", research_loop["covers"])
        self.assertIn("final_response", research_loop["produces"])
        self.assertEqual(web_search["granularity"], "atomic")
        self.assertIn("web_research", web_search["covers"])
        self.assertIn("raw_results", web_search["produces"])

    def test_after_llm_prefers_higher_level_capability_with_matching_coverage(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_arbitration_test")

        result = selector.normalize_selected_capability(
            {"kind": "action", "key": "raw_search", "reason": "Need current public sources."},
            catalog={
                "subgraphs": [
                    {
                        "kind": "subgraph",
                        "key": "research_workflow",
                        "description": "Search, verify, and produce a final answer.",
                        "granularity": "workflow",
                        "covers": ["web_research", "evidence_check"],
                        "produces": ["sources", "final_response"],
                    }
                ],
                "actions": [
                    {
                        "kind": "action",
                        "key": "raw_search",
                        "description": "Search raw public sources.",
                        "granularity": "atomic",
                        "covers": ["web_research", "evidence_check"],
                        "produces": ["sources", "raw_results"],
                    }
                ],
                "tools": [],
            },
        )

        self.assertEqual(result["capability"]["kind"], "subgraph")
        self.assertEqual(result["capability"]["key"], "research_workflow")
        self.assertEqual(result["capability"]["description"], "Search, verify, and produce a final answer.")
        self.assertTrue(result["needs_capability"])

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
        self.assertTrue(result["needs_capability"])
        self.assertNotIn("found", result)

    def test_after_llm_returns_none_when_selected_capability_is_disabled_or_unknown(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_unknown_test")

        result = selector.toograph_capability_selector(
            capability={"kind": "subgraph", "key": "not_enabled_template", "reason": "LLM guessed."}
        )

        self.assertEqual(result["capability"]["kind"], "none")
        self.assertIn("not_enabled_template", result["capability"]["reason"])
        self.assertFalse(result["needs_capability"])
        self.assertNotIn("found", result)

    def test_after_llm_returns_none_when_llm_selects_none(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_none_test")

        result = selector.toograph_capability_selector(
            capability={"kind": "none", "reason": "没有合适能力。"},
        )

        self.assertEqual(result["capability"], {"kind": "none"})
        self.assertFalse(result["needs_capability"])
        self.assertNotIn("found", result)


if __name__ == "__main__":
    unittest.main()

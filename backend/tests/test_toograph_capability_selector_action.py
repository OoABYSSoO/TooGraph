from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


SELECTOR_ACTION_DIR = Path(__file__).resolve().parents[2] / "action" / "official" / "toograph_capability_selector"
SELECTOR_BEFORE_LLM_PATH = SELECTOR_ACTION_DIR / "before_llm.py"
SELECTOR_AFTER_LLM_PATH = SELECTOR_ACTION_DIR / "after_llm.py"
REMOVED_SELECTION_TRACE_KEY = "capability_selection_" + "trace"


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
            ["current_requirement", "agent_loop_control"],
        )
        self.assertEqual(
            [field["key"] for field in manifest.get("llmOutputSchema", [])],
            ["needs_capability", "capability"],
        )
        self.assertEqual(
            [field["key"] for field in manifest["stateOutputSchema"]],
            ["needs_capability", "capability"],
        )
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, [field["key"] for field in manifest["stateOutputSchema"]])
        instruction = manifest["llmInstruction"]
        self.assertNotIn("你已绑定", instruction)
        self.assertNotIn("不要", instruction)
        self.assertIn("是否还需要调用能力", instruction)
        self.assertIn("当前图状态", instruction)
        self.assertNotIn("loop_context", instruction)
        self.assertIn("needs_capability", json.dumps(manifest["stateOutputSchema"], ensure_ascii=False))
        self.assertLess(instruction.index("subgraph"), instruction.index("action"))
        self.assertLess(instruction.index("action"), instruction.index("tool"))
        self.assertIn("capability.kind=none", instruction)
        self.assertNotIn('{"kind":"none","reason"', instruction)
        self.assertNotIn("selection_reason", instruction)

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
            "  usage:",
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
        self.assertIn("network", web_search["permissions"])
        self.assertEqual(web_search["permissionTier"], "external")

    def test_capability_catalog_exposes_permission_tier(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "toograph_capability_selector_before_permission_test")

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            template_dir = root / "graph_template" / "official" / "visible_loop"
            template_dir.mkdir(parents=True)
            (root / "action").mkdir()
            (root / "tool").mkdir()
            (root / "graph_template" / "settings.json").write_text(
                json.dumps({"entries": {"visible_loop": {"enabled": True, "capabilityDiscoverable": True}}}),
                encoding="utf-8",
            )
            (template_dir / "template.json").write_text(
                json.dumps(
                    {
                        "template_id": "visible_loop",
                        "label": "Visible Loop",
                        "description": "Visible template.",
                        "metadata": {
                            "permissions": ["file_write"],
                            "capability": {
                                "granularity": "workflow",
                                "covers": ["graph_edit"],
                                "produces": ["final_response"],
                            },
                        },
                    }
                ),
                encoding="utf-8",
            )
            catalog = selector.discover_capability_catalog(root)

        visible_loop = next(item for item in catalog["subgraphs"] if item["key"] == "visible_loop")
        self.assertEqual(visible_loop["permissions"], ["file_write"])
        self.assertEqual(visible_loop["permissionTier"], "risky")

    def test_capability_catalog_exposes_standard_permission_profile(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "toograph_capability_selector_before_permission_profile_test")

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            action_dir = root / "action" / "official" / "delivery_writer"
            action_dir.mkdir(parents=True)
            (root / "graph_template").mkdir()
            (root / "tool").mkdir()
            (action_dir / "action.json").write_text(
                json.dumps(
                    {
                        "actionKey": "delivery_writer",
                        "description": "Write memory and deliver an external report.",
                        "permissions": ["memory_write", "external_delivery", "cost"],
                    }
                ),
                encoding="utf-8",
            )

            catalog = selector.discover_capability_catalog(root)

        item = next(item for item in catalog["actions"] if item["key"] == "delivery_writer")
        self.assertEqual(item["permissionTier"], "risky")
        self.assertEqual(
            item["permissionProfile"],
            {
                "permissions": ["memory_write", "external_delivery", "cost"],
                "operations": ["memory_write", "cost", "external_delivery"],
                "permission_tier": "risky",
                "risky_permissions": ["memory_write", "cost", "external_delivery"],
                "requires_approval_by_default": True,
            },
        )

    def test_capability_catalog_filters_disallowed_permission_tiers(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "toograph_capability_selector_before_permission_filter_test")

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            safe_action_dir = root / "action" / "official" / "safe_lookup"
            external_action_dir = root / "action" / "official" / "web_lookup"
            safe_action_dir.mkdir(parents=True)
            external_action_dir.mkdir(parents=True)
            (root / "graph_template").mkdir()
            (root / "tool").mkdir()
            (safe_action_dir / "action.json").write_text(
                json.dumps(
                    {
                        "actionKey": "safe_lookup",
                        "description": "Read already available context.",
                        "permissions": [],
                    }
                ),
                encoding="utf-8",
            )
            (external_action_dir / "action.json").write_text(
                json.dumps(
                    {
                        "actionKey": "web_lookup",
                        "description": "Fetch public web context.",
                        "permissions": ["network"],
                    }
                ),
                encoding="utf-8",
            )

            catalog = selector.discover_capability_catalog(
                root,
                permission_policy={"allowed_permission_tiers": ["none", "guarded"]},
            )

        action_keys = [item["key"] for item in catalog["actions"]]
        self.assertIn("safe_lookup", action_keys)
        self.assertNotIn("web_lookup", action_keys)

    def test_capability_catalog_exposes_usage_feedback_for_enabled_capabilities(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "toograph_capability_selector_before_usage_test")

        catalog = selector.discover_capability_catalog(
            usage_stats={
                "capabilities": {
                    "action:web_search": {
                        "kind": "action",
                        "key": "web_search",
                        "use_count": 4,
                        "success_count": 3,
                        "failure_count": 1,
                        "last_used_at": "2026-05-27T01:02:03Z",
                        "last_run_id": "run_4",
                        "recent_runs": [
                            {"run_id": "run_4", "success": False},
                            {"run_id": "run_3", "success": True},
                            {"run_id": "run_2", "success": True},
                        ],
                    }
                }
            }
        )

        web_search = next(item for item in catalog["actions"] if item["key"] == "web_search")
        self.assertEqual(
            web_search["usage"],
            {
                "use_count": 4,
                "success_count": 3,
                "failure_count": 1,
                "success_rate": 0.75,
                "recent_failure_count": 1,
                "last_used_at": "2026-05-27T01:02:03Z",
                "last_run_id": "run_4",
                "last_summary": "",
                "last_duration_ms": 0,
            },
        )

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
        self.assertEqual(result["capability"]["reason"], "Need current public sources.")
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, result)

    def test_after_llm_uses_usage_feedback_without_emitting_selection_trace(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_usage_test")

        result = selector.normalize_selected_capability(
            {"kind": "action", "key": "raw_search", "reason": "Need current public sources."},
            catalog={
                "subgraphs": [
                    {
                        "kind": "subgraph",
                        "key": "research_workflow",
                        "description": "Search, verify, and produce a final answer.",
                        "granularity": "workflow",
                        "covers": ["web_research"],
                        "produces": ["sources", "final_response"],
                    }
                ],
                "actions": [
                    {
                        "kind": "action",
                        "key": "raw_search",
                        "description": "Search raw public sources.",
                        "granularity": "atomic",
                        "covers": ["web_research"],
                        "produces": ["sources", "raw_results"],
                    }
                ],
                "tools": [],
            },
            usage_stats={
                "capabilities": {
                    "subgraph:research_workflow": {
                        "kind": "subgraph",
                        "key": "research_workflow",
                        "use_count": 8,
                        "success_count": 6,
                        "failure_count": 2,
                        "last_used_at": "2026-05-27T02:00:00Z",
                        "last_run_id": "run_selected",
                        "last_summary": "Recovered with fallback.",
                        "last_duration_ms": 1234,
                        "recent_runs": [
                            {"run_id": "run_selected", "success": True},
                            {"run_id": "run_previous", "success": False},
                        ],
                    },
                    "action:raw_search": {
                        "kind": "action",
                        "key": "raw_search",
                        "use_count": 3,
                        "success_count": 1,
                        "failure_count": 2,
                        "recent_runs": [
                            {"run_id": "run_failed_2", "success": False},
                            {"run_id": "run_failed_1", "success": False},
                        ],
                    },
                }
            },
        )

        self.assertEqual(result["capability"]["kind"], "subgraph")
        self.assertEqual(result["capability"]["key"], "research_workflow")
        self.assertTrue(result["needs_capability"])
        self.assertEqual(result["capability"]["reason"], "Need current public sources.")
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, result)

    def test_after_llm_selects_fallback_when_requested_capability_has_repeated_recent_failures(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_failure_fallback_test")

        result = selector.normalize_selected_capability(
            {"kind": "action", "key": "raw_search", "reason": "Need current public sources."},
            catalog={
                "subgraphs": [],
                "actions": [
                    {
                        "kind": "action",
                        "key": "raw_search",
                        "description": "Search raw public sources.",
                        "granularity": "atomic",
                        "covers": ["web_research"],
                        "produces": ["raw_results"],
                    },
                    {
                        "kind": "action",
                        "key": "web_search_backup",
                        "description": "Search public sources with the backup provider.",
                        "granularity": "atomic",
                        "covers": ["web_research"],
                        "produces": ["raw_results"],
                    },
                ],
                "tools": [],
            },
            usage_stats={
                "capabilities": {
                    "action:raw_search": {
                        "kind": "action",
                        "key": "raw_search",
                        "use_count": 5,
                        "success_count": 2,
                        "failure_count": 3,
                        "recent_runs": [
                            {"run_id": "run_failed_3", "success": False},
                            {"run_id": "run_failed_2", "success": False},
                            {"run_id": "run_failed_1", "success": False},
                        ],
                    },
                    "action:web_search_backup": {
                        "kind": "action",
                        "key": "web_search_backup",
                        "use_count": 4,
                        "success_count": 4,
                        "failure_count": 0,
                        "recent_runs": [
                            {"run_id": "run_ok_2", "success": True},
                            {"run_id": "run_ok_1", "success": True},
                        ],
                    },
                }
            },
        )

        self.assertEqual(result["capability"]["kind"], "action")
        self.assertEqual(result["capability"]["key"], "web_search_backup")
        self.assertTrue(result["needs_capability"])
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, result)

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
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, result)
        self.assertNotIn("found", result)
        self.assertEqual(list(result.keys()), ["needs_capability", "capability"])

    def test_after_llm_selects_permissioned_capability_without_selection_trace(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_permission_test")

        result = selector.normalize_selected_capability(
            {"kind": "action", "key": "web_search", "reason": "需要公开网页资料。"},
            catalog={
                "subgraphs": [],
                "actions": [
                    {
                        "kind": "action",
                        "key": "web_search",
                        "description": "Search public web pages.",
                        "granularity": "atomic",
                        "covers": ["web_research"],
                        "produces": ["raw_results"],
                        "permissions": ["network"],
                    }
                ],
                "tools": [],
            },
        )

        self.assertNotEqual(result["capability"]["kind"], "none")
        self.assertEqual(result["capability"]["reason"], "需要公开网页资料。")
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, result)

    def test_after_llm_ignores_runtime_budget_context_for_selector_outputs(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_budget_test")

        result = selector.toograph_capability_selector(
            capability={"kind": "action", "key": "web_search", "reason": "需要公开网页资料。"},
            runtime_context={
                "action_state_inputs": {
                    "agent_loop_control": {
                        "iteration_index": 2,
                        "max_iterations": 6,
                        "capability_call_count": 3,
                        "max_capability_calls": 4,
                        "retry_budget": 1,
                    }
                }
            },
        )

        self.assertNotEqual(result["capability"]["kind"], "none")
        self.assertEqual(result["capability"]["reason"], "需要公开网页资料。")
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, result)

    def test_after_llm_rejects_capability_disallowed_by_permission_policy(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_permission_filter_test")

        result = selector.normalize_selected_capability(
            {"kind": "action", "key": "web_search", "reason": "需要公开网页资料。"},
            catalog={
                "subgraphs": [],
                "actions": [
                    {
                        "kind": "action",
                        "key": "web_search",
                        "description": "Search public web pages.",
                        "granularity": "atomic",
                        "covers": ["web_research"],
                        "produces": ["raw_results"],
                        "permissions": ["network"],
                        "permissionTier": "external",
                    }
                ],
                "tools": [],
            },
            permission_policy={"allowed_permission_tiers": ["none", "guarded"]},
        )

        self.assertEqual(result["capability"]["kind"], "none")
        self.assertFalse(result["needs_capability"])
        self.assertIn("not allowed by the current permission policy", result["capability"]["reason"])
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, result)

    def test_after_llm_marks_policy_required_approval_in_permission_summary(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_approval_policy_test")

        result = selector.normalize_selected_capability(
            {"kind": "action", "key": "write_file", "reason": "需要写入文件。"},
            catalog={
                "subgraphs": [],
                "actions": [
                    {
                        "kind": "action",
                        "key": "write_file",
                        "description": "Write a local file.",
                        "granularity": "atomic",
                        "covers": ["file_write"],
                        "produces": ["artifact"],
                        "permissions": ["file_write"],
                        "permissionTier": "risky",
                    }
                ],
                "tools": [],
            },
            permission_policy={
                "allowed_permission_tiers": ["none", "guarded", "external", "risky"],
                "approval_required_permission_tiers": ["risky"],
            },
        )

        self.assertEqual(result["capability"]["kind"], "action")
        self.assertEqual(result["capability"]["key"], "write_file")
        self.assertEqual(result["capability"]["reason"], "需要写入文件。")
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, result)

    def test_after_llm_honors_policy_without_approval_required_tiers(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_no_approval_policy_test")

        result = selector.normalize_selected_capability(
            {"kind": "action", "key": "write_file", "reason": "需要写入文件。"},
            catalog={
                "subgraphs": [],
                "actions": [
                    {
                        "kind": "action",
                        "key": "write_file",
                        "description": "Write a local file.",
                        "granularity": "atomic",
                        "covers": ["file_write"],
                        "produces": ["artifact"],
                        "permissions": ["file_write"],
                        "permissionTier": "risky",
                    }
                ],
                "tools": [],
            },
            permission_policy={
                "allowed_permission_tiers": ["none", "guarded", "external", "risky"],
                "approval_required_permission_tiers": [],
            },
        )

        self.assertEqual(result["capability"]["kind"], "action")
        self.assertEqual(result["capability"]["key"], "write_file")
        self.assertEqual(result["capability"]["reason"], "需要写入文件。")
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, result)

    def test_after_llm_returns_none_when_selected_capability_is_disabled_or_unknown(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_unknown_test")

        result = selector.toograph_capability_selector(
            capability={"kind": "subgraph", "key": "not_enabled_template", "reason": "LLM guessed."}
        )

        self.assertEqual(result["capability"]["kind"], "none")
        self.assertIn("not_enabled_template", result["capability"]["reason"])
        self.assertFalse(result["needs_capability"])
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, result)
        self.assertNotIn("found", result)

    def test_after_llm_returns_none_when_llm_selects_none(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_none_test")

        result = selector.toograph_capability_selector(
            capability={"kind": "none", "reason": "没有合适能力。"},
        )

        self.assertEqual(result["capability"], {"kind": "none"})
        self.assertFalse(result["needs_capability"])
        self.assertNotIn(REMOVED_SELECTION_TRACE_KEY, result)
        self.assertNotIn("found", result)
        self.assertEqual(list(result.keys()), ["needs_capability", "capability"])


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SELECTOR_SKILL_DIR = Path(__file__).resolve().parents[2] / "skill" / "official" / "toograph_capability_selector"
SELECTOR_BEFORE_LLM_PATH = SELECTOR_SKILL_DIR / "before_llm.py"
SELECTOR_AFTER_LLM_PATH = SELECTOR_SKILL_DIR / "after_llm.py"


def _load_selector_module(path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Could not load {path}.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_settings(path: Path, schema_version: str, entry_key: str, entry: dict[str, object]) -> None:
    _write_json(path, {"schemaVersion": schema_version, "entries": {entry_key: entry}})


def _write_template(
    repo_root: Path,
    *,
    template_id: str,
    label: str,
    description: str,
    source: str = "official",
    status: str = "active",
) -> None:
    _write_json(
        repo_root / "graph_template" / source / template_id / "template.json",
        {
            "template_id": template_id,
            "label": label,
            "description": description,
            "default_graph_name": label,
            "state_schema": {
                "question": {
                    "name": "Question",
                    "description": "User request.",
                    "type": "text",
                    "value": "",
                }
            },
            "nodes": {},
            "edges": [],
            "conditional_edges": [],
            "metadata": {"tags": ["research", "web"]},
        },
    )
    if status != "active":
        _write_settings(
            repo_root / "graph_template" / "settings.json",
            "toograph.template-settings/v1",
            template_id,
            {"enabled": False},
        )


def _write_skill(
    repo_root: Path,
    *,
    skill_key: str,
    name: str,
    description: str,
    source: str = "official",
    selectable: bool = True,
    status: str = "active",
    permissions: list[str] | None = None,
    internal: bool = False,
) -> None:
    skill_dir = repo_root / "skill" / source / skill_key
    payload = {
            "schemaVersion": "toograph.skill/v1",
            "skillKey": skill_key,
            "name": name,
            "description": description,
            "llmInstruction": "Generate skill inputs from the current graph state.",
            "version": "1.0.0",
            "permissions": permissions if permissions is not None else (["network"] if "search" in description.lower() else []),
            "inputSchema": [{"key": "query", "name": "Query", "valueType": "text", "required": True}],
            "outputSchema": [{"key": "result", "name": "Result", "valueType": "json"}],
    }
    if internal:
        payload["metadata"] = {"internal": True}
    _write_json(skill_dir / "skill.json", payload)
    (skill_dir / "after_llm.py").write_text("import json\nprint(json.dumps({'result': {}}))\n", encoding="utf-8")
    if status != "active" or not selectable:
        _write_settings(
            repo_root / "skill" / "settings.json",
            "toograph.skill-settings/v1",
            skill_key,
            {
                "enabled": status == "active",
                "origins": {
                    "default": {"selectable": selectable, "requiresApproval": False},
                    "buddy": {"selectable": selectable, "requiresApproval": False},
                },
            },
        )


def _add_template_skill_node(repo_root: Path, template_id: str, skill_key: str) -> None:
    template_path = repo_root / "graph_template" / "official" / template_id / "template.json"
    payload = json.loads(template_path.read_text(encoding="utf-8"))
    payload["nodes"] = {
        "run_skill": {
            "id": "run_skill",
            "kind": "agent",
            "name": "Run Skill",
            "description": "",
            "position": {"x": 0, "y": 0},
            "size": {"width": 320, "height": 220},
            "reads": [],
            "writes": [],
            "config": {
                "prompt": "",
                "modelSource": "global",
                "model": "",
                "skillKey": skill_key,
                "skillBindings": [],
            },
        }
    }
    template_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


class TooGraphCapabilitySelectorSkillTests(unittest.TestCase):
    def test_manifest_declares_capability_and_found_outputs(self) -> None:
        manifest = json.loads((SELECTOR_SKILL_DIR / "skill.json").read_text(encoding="utf-8"))

        input_keys = [field["key"] for field in manifest["inputSchema"]]
        capability_inputs = [field for field in manifest["inputSchema"] if field["key"] == "capability"]
        self.assertNotIn("runtime", manifest)
        self.assertNotIn("capabilityPolicy", manifest)
        self.assertEqual(manifest["timeoutSeconds"], 30)
        self.assertIn("selection_reason", input_keys)
        self.assertIn("rejected_candidates", input_keys)
        self.assertEqual(capability_inputs[0]["valueType"], "capability")
        self.assertEqual([field["key"] for field in manifest["outputSchema"]], ["capability", "found", "audit"])

    def test_before_llm_lists_available_templates_and_skills_for_llm_choice(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "toograph_capability_selector_before_test")
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_template(
                repo_root,
                template_id="advanced_web_research_loop",
                label="Advanced Web Research",
                description="Multi-round web research with evidence review.",
            )
            _write_skill(
                repo_root,
                skill_key="web_search",
                name="Web Search",
                description="Search public web pages and save readable sources.",
            )
            _write_skill(
                repo_root,
                skill_key="blocked_skill",
                name="Blocked Skill",
                description="This should not appear.",
                status="disabled",
            )
            with patch.dict("os.environ", {"TOOGRAPH_REPO_ROOT": str(repo_root)}, clear=True):
                result = selector.toograph_capability_selector_before_llm(graph_state={})

        context = result["context"]
        self.assertIn("Available TooGraph capabilities:", context)
        self.assertIn("Graph templates are preferred over Skills when both can satisfy the requirement.", context)
        self.assertIn("Also provide selection_reason and rejected_candidates", context)
        self.assertIn("kind: subgraph", context)
        self.assertIn("key: advanced_web_research_loop", context)
        self.assertIn("name: Advanced Web Research", context)
        self.assertIn("kind: skill", context)
        self.assertIn("key: web_search", context)
        self.assertNotIn("requiresApproval", context)
        self.assertNotIn("blocked_skill", context)

    def test_selector_normalizes_llm_selected_template_capability(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_test")
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_template(
                repo_root,
                template_id="advanced_web_research_loop",
                label="Advanced Web Research",
                description="Multi-round web research with evidence review.",
            )
            _write_skill(
                repo_root,
                skill_key="web_search",
                name="Web Search",
                description="Search public web pages and save readable sources.",
            )
            with patch.dict("os.environ", {"TOOGRAPH_REPO_ROOT": str(repo_root)}, clear=True):
                result = selector.toograph_capability_selector(
                    requirement="Research the latest materials.",
                    capability={"kind": "subgraph", "key": "advanced_web_research_loop"},
                    selection_reason="Research is better handled by a multi-step graph template.",
                    rejected_candidates=[
                        {
                            "kind": "skill",
                            "key": "web_search",
                            "reason": "Only searches once and does not review evidence.",
                        }
                    ],
                )

        self.assertEqual(set(result), {"capability", "found", "audit", "activity_events"})
        self.assertTrue(result["found"])
        self.assertEqual(result["capability"]["kind"], "subgraph")
        self.assertEqual(result["capability"]["key"], "advanced_web_research_loop")
        self.assertEqual(result["capability"]["name"], "Advanced Web Research")
        self.assertNotIn("requiresApproval", result["capability"])
        self.assertEqual(
            result["audit"],
            {
                "candidate_count": 2,
                "candidate_counts": {"subgraph": 1, "skill": 1},
                "selected": {
                    "kind": "subgraph",
                    "key": "advanced_web_research_loop",
                    "name": "Advanced Web Research",
                },
                "selection_reason": "Research is better handled by a multi-step graph template.",
                "selected_permissions": [],
                "permission_summary": "none",
                "rejected_candidates": [
                    {
                        "kind": "skill",
                        "key": "web_search",
                        "name": "Web Search",
                        "reason": "Only searches once and does not review evidence.",
                    }
                ],
                "gap": "",
                "catalog_errors": [],
            },
        )
        self.assertEqual(result["activity_events"][0]["kind"], "capability_selection")
        self.assertIn("Selected Advanced Web Research from 2 candidates", result["activity_events"][0]["summary"])
        self.assertEqual(result["activity_events"][0]["detail"], result["audit"])

    def test_selector_normalizes_llm_selected_skill_capability(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_test_skill")
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_template(
                repo_root,
                template_id="write_report",
                label="Write Report",
                description="Turn existing materials into a report.",
            )
            _write_skill(
                repo_root,
                skill_key="web_search",
                name="Web Search",
                description="Search public web pages and save readable sources.",
            )
            with patch.dict("os.environ", {"TOOGRAPH_REPO_ROOT": str(repo_root)}, clear=True):
                result = selector.toograph_capability_selector(
                    requirement="Need current version information.",
                    capability={"kind": "skill", "key": "web_search"},
                )

        self.assertEqual(set(result), {"capability", "found", "audit", "activity_events"})
        self.assertTrue(result["found"])
        self.assertEqual(result["capability"]["kind"], "skill")
        self.assertEqual(result["capability"]["key"], "web_search")
        self.assertEqual(result["capability"]["name"], "Web Search")
        self.assertNotIn("requiresApproval", result["capability"])

    def test_selector_ignores_disabled_capabilities_but_not_legacy_selectable_policy(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_test_disabled")
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_template(
                repo_root,
                template_id="disabled_research",
                label="Disabled Research",
                description="Web research.",
                source="user",
                status="disabled",
            )
            _write_skill(
                repo_root,
                skill_key="web_search",
                name="Web Search",
                description="Search public web pages and save readable sources.",
                selectable=False,
            )
            with patch.dict("os.environ", {"TOOGRAPH_REPO_ROOT": str(repo_root)}, clear=True):
                disabled_result = selector.toograph_capability_selector(
                    requirement="Search for materials.",
                    capability={"kind": "subgraph", "key": "disabled_research"},
                )
                enabled_legacy_result = selector.toograph_capability_selector(
                    requirement="Search for materials.",
                    capability={"kind": "skill", "key": "web_search"},
                )

        self.assertEqual(set(disabled_result), {"capability", "found", "audit", "activity_events"})
        self.assertFalse(disabled_result["found"])
        self.assertEqual(disabled_result["capability"], {"kind": "none"})
        self.assertEqual(disabled_result["audit"]["gap"], "Selected capability 'disabled_research' is not enabled or no longer exists.")
        self.assertTrue(enabled_legacy_result["found"])
        self.assertEqual(enabled_legacy_result["capability"]["key"], "web_search")

    def test_selector_hides_internal_writer_skills_from_capability_catalog(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "toograph_capability_selector_before_internal_skill")
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_skill(
                repo_root,
                skill_key="buddy_home_writer",
                name="Buddy Home Writer",
                description="Internal controlled writer for Buddy Home.",
                permissions=["buddy_home_write"],
                internal=True,
            )
            _write_skill(
                repo_root,
                skill_key="web_search",
                name="Web Search",
                description="Search public web pages.",
                permissions=["network"],
            )
            with patch.dict("os.environ", {"TOOGRAPH_REPO_ROOT": str(repo_root)}, clear=True):
                result = selector.toograph_capability_selector_before_llm(graph_state={})

        context = result["context"]
        self.assertIn("key: web_search", context)
        self.assertNotIn("buddy_home_writer", context)

    def test_selector_preserves_permissions_without_approval_flags(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_test_permissions")
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_skill(
                repo_root,
                skill_key="web_search",
                name="Web Search",
                description="Search public web pages.",
                permissions=["network", "browser_automation"],
            )
            _write_skill(
                repo_root,
                skill_key="local_workspace_executor",
                name="Local Workspace Executor",
                description="Write files or execute local scripts.",
                permissions=["file_read", "file_write", "subprocess"],
            )
            _write_template(
                repo_root,
                template_id="advanced_web_research_loop",
                label="Advanced Web Research",
                description="Multi-round web research.",
            )
            _add_template_skill_node(repo_root, "advanced_web_research_loop", "web_search")
            _write_template(
                repo_root,
                template_id="write_workspace_file",
                label="Write Workspace File",
                description="Write a local artifact.",
            )
            _add_template_skill_node(repo_root, "write_workspace_file", "local_workspace_executor")

            with patch.dict("os.environ", {"TOOGRAPH_REPO_ROOT": str(repo_root)}, clear=True):
                web_skill = selector.toograph_capability_selector(
                    requirement="Need current information.",
                    capability={"kind": "skill", "key": "web_search"},
                )
                write_skill = selector.toograph_capability_selector(
                    requirement="Write a report file.",
                    capability={"kind": "skill", "key": "local_workspace_executor"},
                )
                web_template = selector.toograph_capability_selector(
                    requirement="Research current information.",
                    capability={"kind": "subgraph", "key": "advanced_web_research_loop"},
                )
                write_template = selector.toograph_capability_selector(
                    requirement="Write a workspace file.",
                    capability={"kind": "subgraph", "key": "write_workspace_file"},
                )

        self.assertEqual(web_skill["capability"]["permissions"], ["network", "browser_automation"])
        self.assertNotIn("requiresApproval", web_skill["capability"])
        self.assertEqual(write_skill["capability"]["permissions"], ["file_read", "file_write", "subprocess"])
        self.assertNotIn("requiresApproval", write_skill["capability"])
        self.assertEqual(web_template["capability"]["permissions"], ["network", "browser_automation"])
        self.assertNotIn("requiresApproval", web_template["capability"])
        self.assertEqual(write_template["capability"]["permissions"], ["file_read", "file_write", "subprocess"])
        self.assertNotIn("requiresApproval", write_template["capability"])

    def test_selector_does_not_match_requirement_without_llm_selected_capability(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "toograph_capability_selector_after_test_none")
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_template(
                repo_root,
                template_id="advanced_web_research_loop",
                label="Advanced Web Research",
                description="Multi-round web research with evidence review.",
            )
            with patch.dict("os.environ", {"TOOGRAPH_REPO_ROOT": temp_dir}, clear=True):
                result = selector.toograph_capability_selector(requirement="Research materials.")

        self.assertEqual(set(result), {"capability", "found", "audit", "activity_events"})
        self.assertFalse(result["found"])
        self.assertEqual(result["capability"], {"kind": "none"})
        self.assertEqual(result["audit"]["candidate_count"], 1)
        self.assertEqual(result["audit"]["gap"], "No capability was selected from the enabled catalog.")
        self.assertEqual(result["activity_events"][0]["status"], "not_found")


if __name__ == "__main__":
    unittest.main()

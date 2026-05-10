from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SELECTOR_SKILL_DIR = Path(__file__).resolve().parents[2] / "skill" / "official" / "graphiteui_capability_selector"
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
            repo_root / "graph_template" / "settings.local.json",
            "graphiteui.template-settings/v1",
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
) -> None:
    skill_dir = repo_root / "skill" / source / skill_key
    _write_json(
        skill_dir / "skill.json",
        {
            "schemaVersion": "graphite.skill/v1",
            "skillKey": skill_key,
            "name": name,
            "description": description,
            "llmInstruction": "Generate skill inputs from the current graph state.",
            "version": "1.0.0",
            "permissions": ["network"] if "search" in description.lower() else [],
            "inputSchema": [{"key": "query", "name": "Query", "valueType": "text", "required": True}],
            "outputSchema": [{"key": "result", "name": "Result", "valueType": "json"}],
        },
    )
    (skill_dir / "after_llm.py").write_text("import json\nprint(json.dumps({'result': {}}))\n", encoding="utf-8")
    if status != "active" or not selectable:
        _write_settings(
            repo_root / "skill" / "settings.local.json",
            "graphiteui.skill-settings/v1",
            skill_key,
            {
                "enabled": status == "active",
                "origins": {
                    "default": {"selectable": selectable, "requiresApproval": False},
                    "buddy": {"selectable": selectable, "requiresApproval": False},
                },
            },
        )


class GraphiteUICapabilitySelectorSkillTests(unittest.TestCase):
    def test_manifest_declares_capability_and_found_outputs(self) -> None:
        manifest = json.loads((SELECTOR_SKILL_DIR / "skill.json").read_text(encoding="utf-8"))

        capability_inputs = [field for field in manifest["inputSchema"] if field["key"] == "capability"]
        self.assertNotIn("runtime", manifest)
        self.assertNotIn("capabilityPolicy", manifest)
        self.assertEqual(manifest["timeoutSeconds"], 30)
        self.assertEqual(capability_inputs[0]["valueType"], "capability")
        self.assertEqual([field["key"] for field in manifest["outputSchema"]], ["capability", "found"])

    def test_before_llm_lists_available_templates_and_skills_for_llm_choice(self) -> None:
        selector = _load_selector_module(SELECTOR_BEFORE_LLM_PATH, "graphiteui_capability_selector_before_test")
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
                selectable=False,
            )
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = selector.graphiteui_capability_selector_before_llm(graph_state={})

        context = result["context"]
        self.assertIn("Available GraphiteUI capabilities:", context)
        self.assertIn("Graph templates are preferred over Skills when both can satisfy the requirement.", context)
        self.assertIn("kind: subgraph", context)
        self.assertIn("key: advanced_web_research_loop", context)
        self.assertIn("name: Advanced Web Research", context)
        self.assertIn("kind: skill", context)
        self.assertIn("key: web_search", context)
        self.assertNotIn("blocked_skill", context)

    def test_selector_normalizes_llm_selected_template_capability(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "graphiteui_capability_selector_after_test")
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
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = selector.graphiteui_capability_selector(
                    requirement="Research the latest materials.",
                    capability={"kind": "subgraph", "key": "advanced_web_research_loop"},
                )

        self.assertEqual(set(result), {"capability", "found"})
        self.assertTrue(result["found"])
        self.assertEqual(result["capability"]["kind"], "subgraph")
        self.assertEqual(result["capability"]["key"], "advanced_web_research_loop")
        self.assertEqual(result["capability"]["name"], "Advanced Web Research")

    def test_selector_normalizes_llm_selected_skill_capability(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "graphiteui_capability_selector_after_test_skill")
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
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = selector.graphiteui_capability_selector(
                    requirement="Need current version information.",
                    capability={"kind": "skill", "key": "web_search"},
                )

        self.assertEqual(set(result), {"capability", "found"})
        self.assertTrue(result["found"])
        self.assertEqual(result["capability"]["kind"], "skill")
        self.assertEqual(result["capability"]["key"], "web_search")
        self.assertEqual(result["capability"]["name"], "Web Search")

    def test_selector_ignores_disabled_and_nonselectable_capabilities(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "graphiteui_capability_selector_after_test_disabled")
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
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": str(repo_root)}, clear=True):
                result = selector.graphiteui_capability_selector(
                    requirement="Search for materials.",
                    capability={"kind": "skill", "key": "web_search"},
                )

        self.assertEqual(set(result), {"capability", "found"})
        self.assertFalse(result["found"])
        self.assertEqual(result["capability"], {"kind": "none"})

    def test_selector_does_not_match_requirement_without_llm_selected_capability(self) -> None:
        selector = _load_selector_module(SELECTOR_AFTER_LLM_PATH, "graphiteui_capability_selector_after_test_none")
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_template(
                repo_root,
                template_id="advanced_web_research_loop",
                label="Advanced Web Research",
                description="Multi-round web research with evidence review.",
            )
            with patch.dict("os.environ", {"GRAPHITE_REPO_ROOT": temp_dir}, clear=True):
                result = selector.graphiteui_capability_selector(requirement="Research materials.")

        self.assertEqual(set(result), {"capability", "found"})
        self.assertFalse(result["found"])
        self.assertEqual(result["capability"], {"kind": "none"})


if __name__ == "__main__":
    unittest.main()
